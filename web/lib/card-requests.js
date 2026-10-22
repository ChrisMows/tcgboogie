import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getProduct, searchProducts } from "@/lib/catalog";
import { db, schema } from "@/lib/db";
import { log } from "@/lib/log";
import { parseTcgplayerInput } from "@/lib/watches";

// "Can't find a card? Request it." Members send what they searched for and a link to the card.
//   - A TCGplayer product link is a trusted source: TCGplayer's product IDs are the ones our price service uses, so
//     if the service has that product we add it at once. The member's search words are remembered (search_alias)
//     so the next search finds it, but only when they plausibly describe the card (a shared name word, the card
//     number or the set), so a stray request can't make search show the wrong card.
//   - Any other link, or a TCGplayer product the service doesn't have, waits for an admin (Admin → Requests).
const { cardRequests, searchAliases } = schema;
const TRUSTED = /(^|\.)tcgplayer\.com$/i;
const STOP = new Set(["the", "and", "of", "card", "pokemon", "pokémon", "tcg", "holo", "rare", "psa", "cgc", "bgs", "sgc", "tag"]);

/** "  Flareon 183  BW-P " -> "flareon 183 bw-p" */
export const normTerm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9/#\- ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

const words = (s) => normTerm(s).split(" ").map((w) => w.replace(/^#/, "")).filter((w) => w.length > 1 && !STOP.has(w));

/** Do the member's search words plausibly describe this product? (a name word, the card number or a set word) */
export function describes(query, p) {
  const q = words(query);
  if (!q.length) return false;
  const name = new Set(words(p.name));
  const set = new Set(words(p.setName));
  const num = String(p.number || "").toLowerCase();
  const numBare = num.split("/")[0].replace(/^0+/, "");
  return q.some((w) => name.has(w) || set.has(w) || (num && (w === num || w.replace(/^0+/, "") === numBare)));
}

async function addAlias(term, product, requestId) {
  if (!db || !term) return;
  await db.insert(searchAliases).values({ term, productId: String(product.id), language: product.language || "english", requestId })
    .onConflictDoNothing();
}

/**
 * A member's request. Returns { status: "added" | "found" | "pending" | "declined", message, product? }.
 * "found" means the product exists but the search words didn't match it well enough to teach search.
 */
export async function submitRequest(user, { query, link, note }) {
  const q = String(query || "").trim().slice(0, 120);
  const raw = String(link || "").trim().slice(0, 500);
  let url;
  try { url = new URL(raw); } catch { return { status: "declined", message: "That doesn't look like a link. Paste the full address, starting with https://" }; }
  if (!/^https?:$/.test(url.protocol)) return { status: "declined", message: "Please send a normal web link (https://…)." };

  const save = async (fields) => {
    if (!db) return null;
    const [row] = await db.insert(cardRequests).values({ userId: user.id, query: q || "(no search)", link: url.href, note: note ? String(note).slice(0, 300) : null, ...fields }).returning({ id: cardRequests.id });
    return row?.id ?? null;
  };

  if (TRUSTED.test(url.hostname)) {
    const id = parseTcgplayerInput(url.href);
    if (!id) {
      await save({ status: "pending", reason: "TCGplayer link without a product number" });
      return { status: "pending", message: "Thanks! That TCGplayer link isn't a single product page, so we'll look into it by hand. Tip: open the card itself on TCGplayer and copy that link." };
    }
    let product = null;
    try { product = await getProduct(id); } catch { /* price service hiccup: treat as not found right now */ }
    if (product) {
      const teach = describes(q, product);
      const requestId = await save({ status: "added", productId: String(product.id), language: product.language || "english",
        reason: teach ? "TCGplayer product found in the price service; search taught" : "TCGplayer product found; search words didn't match the card, so search wasn't changed" });
      if (teach) await addAlias(normTerm(q), product, requestId);
      await log("catalog", "info", `Card request ${teach ? "added" : "found"}: ${product.name} (${product.setName || "?"}) for "${q}"`, { id: product.id, link: url.href }, user.id);
      return { status: teach ? "added" : "found", product: { id: product.id, name: product.name, setName: product.setName, number: product.number, image: product.image, language: product.language || "english" },
        message: teach ? "Found it! It's on TCG Boogie now, and searching for it the same way will find it from now on." : "Found it! Here's the card." };
    }
    await save({ status: "pending", reason: `TCGplayer product ${id} isn't in the price service yet` });
    await log("catalog", "warn", `Card request needs review: TCGplayer ${id} not in the price service ("${q}")`, { link: url.href }, user.id);
    return { status: "pending", message: "Thanks! That card isn't in our price data yet, so we'll review it and add it if we can." };
  }

  await save({ status: "pending", reason: `link from ${url.hostname}` });
  return { status: "pending", message: "Thanks! We'll review it. A TCGplayer link to the card gets it added straight away, if you have one." };
}

/** Products learned from approved requests for this search, as product IDs with language (newest first). */
export async function aliasMatches(query, limit = 3) {
  if (!db) return [];
  const t = normTerm(query);
  if (t.length < 2) return [];
  try {
    return await db.select({ productId: searchAliases.productId, language: searchAliases.language }).from(searchAliases)
      .where(eq(searchAliases.term, t)).orderBy(desc(searchAliases.createdAt)).limit(limit);
  } catch { return []; }
}

/** The usual search, with products learned from approved requests first. */
export async function searchWithRequests(q) {
  const [learned, found] = await Promise.all([
    aliasMatches(q).then((rows) => Promise.all(rows.map((r) => getProduct(r.productId, { language: r.language }).catch(() => null)))),
    searchProducts(q),
  ]);
  const seen = new Set();
  return [...learned.filter(Boolean), ...found].filter((p) => {
    const k = `${p.id}:${p.language || "english"}`;
    return seen.has(k) ? false : seen.add(k);
  });
}

// ---------- Admin → Requests ----------
export async function listRequests({ status = "pending", limit = 100 } = {}) {
  if (!db) return [];
  const where = status === "all" ? undefined : eq(cardRequests.status, status);
  const rows = await db.select({ r: cardRequests, email: schema.users.email }).from(cardRequests)
    .leftJoin(schema.users, eq(schema.users.id, cardRequests.userId)).where(where).orderBy(desc(cardRequests.createdAt)).limit(limit);
  return rows.map(({ r, email }) => ({ ...r, email }));
}

export async function pendingCount() {
  if (!db) return 0;
  try { return (await db.select({ id: cardRequests.id }).from(cardRequests).where(eq(cardRequests.status, "pending"))).length; } catch { return 0; }
}

/** Approve with a TCGplayer link or product number (teaches search the member's words). Returns an error or null. */
export async function approveRequest(admin, id, tcgplayer) {
  const pid = parseTcgplayerInput(tcgplayer);
  if (!pid) return "Paste a TCGplayer product link or number.";
  const [req] = await db.select().from(cardRequests).where(eq(cardRequests.id, Number(id))).limit(1);
  if (!req) return "That request is gone.";
  const product = await getProduct(pid);
  if (!product) return "Our price service doesn't have that TCGplayer product, so it can't be priced yet.";
  await db.update(cardRequests).set({ status: "added", productId: String(product.id), language: product.language || "english",
    reason: `Approved by ${admin.email}`, reviewedBy: admin.email, reviewedAt: new Date() }).where(eq(cardRequests.id, req.id));
  await addAlias(normTerm(req.query), product, req.id);
  return null;
}

export async function declineRequests(admin, ids, reason) {
  const list = (Array.isArray(ids) ? ids : [ids]).map(Number).filter(Boolean);
  if (!list.length) return;
  await db.update(cardRequests).set({ status: "declined", reason: String(reason || "Declined").slice(0, 200), reviewedBy: admin.email, reviewedAt: new Date() })
    .where(and(inArray(cardRequests.id, list), eq(cardRequests.status, "pending")));
}
