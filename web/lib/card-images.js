import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { log } from "@/lib/log";
import { setLabel } from "@/lib/sets";

// Missing card pictures. TCGplayer (where card pictures come from) has no photo for some cards, often Japanese
// variants. A member who sees an empty slab taps "Missing picture?" on the card page and we:
//   1. look the card up on TCGdex (free card-image library: English by name + number + set, Japanese by set code +
//      number). An exact match is used at once, for that card everywhere, for every member (card_image table).
//   2. otherwise (nothing found, or only the regular version of a variant like "Master Ball Pattern") put it in
//      Admin -> Requests and DM the admin on Discord, who can paste a picture link there.
const { cardImages, cardRequests, users, accounts } = schema;
const SITE = (process.env.AUTH_URL || "https://tcgboogie.com").replace(/\/$/, "");
const TCGDEX = "https://api.tcgdex.net/v2";
const g = globalThis;
g.__tcgCardImages ??= { at: 0, map: new Map() };

/** Every saved picture, read at most every 5 minutes (a handful of rows). */
export async function loadPictures() {
  if (!db || Date.now() - g.__tcgCardImages.at < 5 * 60000) return g.__tcgCardImages.map;
  try {
    const rows = await db.select({ productId: cardImages.productId, image: cardImages.image }).from(cardImages);
    g.__tcgCardImages = { at: Date.now(), map: new Map(rows.map((r) => [r.productId, r.image])) };
  } catch { g.__tcgCardImages.at = Date.now(); /* table not there yet: no saved pictures */ }
  return g.__tcgCardImages.map;
}

/** The saved picture for a product, if any (call loadPictures() first). */
export const pictureFor = (productId) => g.__tcgCardImages.map.get(String(productId)) || null;

/** A product with its saved picture in place of TCGplayer's (which is missing when there's a saved one). */
export async function withPicture(p) {
  if (!p?.id) return p;
  const img = (await loadPictures()).get(String(p.id));
  return img ? { ...p, image: img } : p;
}

/** Does this address really serve a picture? (TCGplayer answers 403 for a missing one.) */
export async function pictureLoads(url) {
  if (!url) return false;
  if (url.startsWith("/")) return true; // one of ours (public/cards)
  try {
    const r = await fetch(url, { method: "GET", headers: { Range: "bytes=0-1023" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    return (r.ok || r.status === 206) && /^image\//.test(r.headers.get("content-type") || "");
  } catch { return false; }
}

const tcgdex = async (path) => {
  try {
    const r = await fetch(`${TCGDEX}${path}`, { signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } });
    return r.ok ? await r.json() : null;
  } catch { return null; }
};
const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const localOf = (number) => String(number || "").split("/")[0].trim();
const noZeros = (n) => n.replace(/^0+(?=\d)/, "");
// "Zorua (Master Ball Pattern)" -> base "Zorua", variant "Master Ball Pattern". Plain printings aren't variants.
function splitName(name) {
  const m = String(name || "").match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  return m ? { base: m[1], variant: m[2] } : { base: String(name || ""), variant: null };
}

/**
 * Find a picture for a product on TCGdex. Returns { image, exact, where } or null. exact is false when only the
 * regular version of a variant was found (same art, different foil pattern): not used without an admin.
 */
export async function findPicture(p) {
  const { base, variant } = splitName(p.name);
  const local = localOf(p.number);
  if (!local) return null;
  let hit = null;
  if ((p.language || "english") === "japanese") {
    const code = setLabel(p.setName).code || String(p.setName || "").split(":")[0].trim();
    for (const id of [...new Set([`${code}-${local}`, `${code}-${noZeros(local)}`])]) {
      const c = code && (await tcgdex(`/ja/cards/${encodeURIComponent(id)}`));
      if (c?.image) { hit = { image: c.image, where: `TCGdex ${c.id}` }; break; }
    }
  } else {
    const list = (await tcgdex(`/en/cards?name=${encodeURIComponent(base)}`)) || [];
    const same = list.filter((c) => c.image && norm(c.name) === norm(base) && noZeros(c.localId) === noZeros(local)).slice(0, 8);
    // The same set by name: an exact match wins over a partial one ("Base Set" must not take "Base Set 2").
    const setWanted = norm(setLabel(p.setName).name);
    const sets = [];
    for (const c of same) {
      const full = await tcgdex(`/en/cards/${encodeURIComponent(c.id)}`);
      if (full?.set?.name) sets.push({ c, name: full.set.name, n: norm(full.set.name) });
    }
    const pick = sets.find((s) => s.n === setWanted)
      || (sets.filter((s) => setWanted.includes(s.n) || s.n.includes(setWanted)).length === 1 ? sets.find((s) => setWanted.includes(s.n) || s.n.includes(setWanted)) : null);
    if (setWanted && pick) hit = { image: pick.c.image, where: `TCGdex ${pick.c.id} (${pick.name})` };
  }
  if (!hit) return null;
  const image = `${hit.image}/high.webp`;
  if (!(await pictureLoads(image))) return null;
  return { image, exact: !variant || /^(holo(foil)?|normal|reverse holo(foil)?|1st edition)$/i.test(variant), where: hit.where };
}

/** Save a picture for a product (everywhere, every member). */
export async function savePicture(productId, image, { source, note = null, by = null }) {
  await db.insert(cardImages).values({ productId: String(productId), image, source, note, createdBy: by })
    .onConflictDoUpdate({ target: cardImages.productId, set: { image, source, note, createdBy: by, createdAt: new Date() } });
  g.__tcgCardImages.at = 0; // read again on the next page
}

/** The admin's Discord user ID (an admin who connected Discord), for a DM from BoogieBot. */
async function adminDiscordId() {
  const admins = String(process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!admins.length || !process.env.DISCORD_BOT_TOKEN) return null;
  const rows = await db.select({ email: users.email, id: accounts.providerAccountId }).from(accounts)
    .innerJoin(users, eq(users.id, accounts.userId)).where(eq(accounts.provider, "discord"));
  return rows.find((r) => admins.includes(String(r.email || "").toLowerCase()))?.id || null;
}

/**
 * A member's "Missing picture?" on a card page. Returns { status, message }:
 *   fixed    - found on TCGdex and saved; the page shows it after a refresh
 *   ok       - the picture loads for us (a hiccup on their side)
 *   queued   - couldn't be fixed automatically; it's in Admin -> Requests and the admin got a DM
 *   already  - someone reported it already and it's waiting for the admin
 */
export async function reportMissingPicture(user, p) {
  const productId = String(p.id);
  const pageUrl = `${SITE}/app/cards/${encodeURIComponent(productId)}${p.language === "japanese" ? "?lang=japanese" : ""}`;
  const saved = (await loadPictures()).get(productId);
  if (saved && (await pictureLoads(saved.startsWith("/") ? `${SITE}${saved}` : saved))) {
    return { status: "ok", message: "This card has a picture now. Refresh the page to see it." };
  }
  if (!saved && p.image && (await pictureLoads(p.image))) {
    return { status: "ok", message: "The picture loads for us. Refresh the page; if it's still blank, it may be your connection or an ad blocker." };
  }

  const found = await findPicture(p).catch(() => null);
  if (found?.exact) {
    await savePicture(productId, found.image, { source: "tcgdex", note: found.where, by: user.id });
    await log("website", "info", `Missing picture fixed automatically: ${p.name} (${productId}) from ${found.where}`, { image: found.image }, user.id);
    return { status: "fixed", message: "Found it! We added the picture for this card. Refresh the page to see it." };
  }

  // Already waiting for the admin? Don't ask twice.
  const [waiting] = await db.select({ id: cardRequests.id }).from(cardRequests)
    .where(and(eq(cardRequests.kind, "picture"), eq(cardRequests.productId, productId), eq(cardRequests.status, "pending"))).limit(1);
  if (waiting) return { status: "already", message: "Thanks! This one's already on our list, and we'll add a picture soon." };

  const reason = found ? `TCGdex only has the regular version (${found.where}), not "${splitName(p.name).variant}"` : "No picture on TCGplayer or TCGdex";
  await db.insert(cardRequests).values({ userId: user.id, kind: "picture", query: `${p.name}${p.number ? ` ${p.number}` : ""}`, link: pageUrl,
    status: "pending", productId, language: p.language || "english", reason, card: { name: p.name, setName: p.setName || null, number: p.number || null, suggestion: found?.image || null } });
  await log("website", "info", `Missing picture reported: ${p.name} (${productId}). ${reason}`, null, user.id);
  try {
    const id = await adminDiscordId();
    if (id) {
      const { sendDiscordDM } = await import("@/lib/notify");
      await sendDiscordDM(id, {
        title: `📷 Missing picture: ${p.name}`,
        description: `${[p.setName, p.number && `#${p.number}`, p.language === "japanese" && "Japanese"].filter(Boolean).join(" · ")}\n${reason}.\nAdd one in Admin → Requests → Pictures (paste an image link).${found ? `\nThe regular version, if that's close enough: ${found.image}` : ""}`,
        url: `${SITE}/app/admin?tab=requests&kind=picture`,
      });
    }
  } catch (e) { await log("website", "warn", `Couldn't DM the admin about a missing picture: ${e.message}`); }
  return { status: "queued", message: "Thanks! We couldn't find this one automatically, so we've asked a person to add it. It usually takes a day or two." };
}

/** Admin -> Requests: set a picture from a link (checked first) and close the request. Returns an error or null. */
export async function setPictureFromRequest(admin, requestId, image) {
  const url = String(image || "").trim();
  if (!/^https:\/\/\S+$/.test(url)) return "Paste a picture link that starts with https://";
  if (!(await pictureLoads(url))) return "That link didn't load as a picture. Open it in a new tab, right-click the image, and copy the image address.";
  const [req] = await db.select().from(cardRequests).where(eq(cardRequests.id, Number(requestId))).limit(1);
  if (!req?.productId) return "That request is gone.";
  await savePicture(req.productId, url, { source: "admin", note: `Request ${req.id}`, by: admin.email });
  await db.update(cardRequests).set({ status: "added", reason: `Picture added by ${admin.email}`, reviewedBy: admin.email, reviewedAt: new Date() })
    .where(and(eq(cardRequests.kind, "picture"), eq(cardRequests.productId, req.productId), eq(cardRequests.status, "pending")));
  return null;
}
