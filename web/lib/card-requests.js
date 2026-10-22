import "server-only";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { findCard, getProduct, searchProducts } from "@/lib/catalog";
import { db, schema } from "@/lib/db";
import { log } from "@/lib/log";
import { addFromPage, addFromTcgplayer, existingFor, readCardPage, reviewReason, searchMemberCards } from "@/lib/member-cards";
import { parseTcgplayerInput } from "@/lib/watches";

// "Can't find a card? Request it." Members send what they searched for and a link to the card.
//   - A TCGplayer product link is a trusted source: TCGplayer's product IDs are the ones our price service uses, so
//     if the service has that product we add it at once. The member's search words are remembered (search_alias)
//     so the next search finds it, but only when they plausibly describe the card (a shared name word, the card
//     number or the set), so a stray request can't make search show the wrong card.
//   - A TCGplayer product the service doesn't have is added from TCGplayer's product data as a member card with no
//     prices ("No pricing data available"), so the catalog grows one requested card at a time (lib/member-cards.js).
//   - Any other link (eBay, PriceCharting, a Korean card site...) is read and Claude says which card it is. If the
//     price service has that card (same number), that's the one; otherwise it's added as a member card.
//   - Only from trusted sources, though (see reviewReason): an eBay listing whose Game detail says Pokémon, or another
//     site when the name contains a real Pokémon's name. Anything else waits for an admin with what we read, and
//     links we can't read or that aren't about one Pokémon card wait too (Admin → Requests).
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
export async function submitRequest(user, { query, link, note, kind }) {
  kind = kind === "sealed" ? "sealed" : "card";
  const what = kind === "sealed" ? "product" : "card";
  const q = String(query || "").trim().slice(0, 120);
  const raw = String(link || "").trim().slice(0, 500);
  let url;
  try { url = new URL(raw); } catch { return { status: "declined", message: "That doesn't look like a link. Paste the full address, starting with https://" }; }
  if (!/^https?:$/.test(url.protocol)) return { status: "declined", message: "Please send a normal web link (https://…)." };

  const save = async (fields) => {
    if (!db) return null;
    const [row] = await db.insert(cardRequests).values({ userId: user.id, kind, query: q || "(no search)", link: url.href, note: note ? String(note).slice(0, 300) : null, ...fields }).returning({ id: cardRequests.id });
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
    if (product) return found(user, q, url, product, "TCGplayer product found in the price service");
    const requestId = await save({ status: "pending", reason: `TCGplayer product ${id} isn't in the price service` });
    const added = await addFromTcgplayer(id, { link: url.href, userId: user.id, requestId }).catch(() => null);
    if (added) return addedWithoutPrices(user, q, url, added, requestId, "TCGplayer product not in the price service; added from TCGplayer's details without prices");
    await log("catalog", "warn", `Card request needs review: TCGplayer ${id} isn't a Pokémon card TCGplayer could describe ("${q}")`, { link: url.href }, user.id);
    return { status: "pending", message: "Thanks! We couldn't read that card from TCGplayer, so we'll review it by hand." };
  }

  // Any other link: read the page and work out which card or sealed product it is.
  const requestId = await save({ status: "pending", reason: `link from ${url.hostname}` });
  const card = await readCardPage(url.href, q, kind).catch(() => null);
  if (!card) {
    if (requestId) await db.update(cardRequests).set({ reason: `link from ${url.hostname}: couldn't tell which ${what} the page is about` }).where(eq(cardRequests.id, requestId));
    return { status: "pending", message: `Thanks! We couldn't tell which ${what} that page is about, so we'll review it. A TCGplayer link to it gets it added straight away, if you have one.` };
  }
  // The price service may have it after all (searched oddly): a card with the same number, or a sealed product with the same name.
  if (card.type === "sealed" && card.language === "english") {
    const words = (n) => normTerm(n).split(" ").filter((w) => !STOP.has(w)).sort().join(" ");
    const p = (await searchProducts(card.name).catch(() => [])).find((x) => x.type === "sealed" && words(x.name) === words(card.name));
    if (p) return found(user, q, url, p, `read from ${url.hostname}; found in the price service`, requestId);
  }
  if (card.type === "card" && card.number && ["english", "japanese"].includes(card.language)) {
    const bare = (n) => String(n || "").toUpperCase().replace(/\s/g, "").split("/")[0].replace(/^0+/, "");
    const p = await findCard({ name: card.name, number: card.number, language: card.language }).catch(() => null);
    if (p && bare(p.number) === bare(card.number)) return found(user, q, url, p, `read from ${url.hostname}; found in the price service`, requestId);
  }
  // Not a source we trust enough to add it for everyone at once: keep what we read for a one-click admin approval.
  const hold = reviewReason(card);
  if (hold) {
    if (requestId) await db.update(cardRequests).set({ reason: `read from ${url.hostname}, but ${hold}: waiting for review`, card }).where(eq(cardRequests.id, requestId));
    await log("catalog", "info", `Card request held for review: "${card.name}" from ${url.hostname} (${hold})`, { link: url.href }, user.id);
    return { status: "pending", message: `Thanks! We read it as ${card.name}${card.number ? ` ${card.number}` : ""}. We'll double-check it and add it soon.` };
  }
  const added = await addFromPage(card, { link: url.href, userId: user.id, requestId }).catch(() => null);
  if (added) return addedWithoutPrices(user, q, url, added, requestId, `read from ${url.hostname}${card.via === "ebay" ? ` (eBay Game: ${card.game})` : ""}; not in the price service, added without prices`);
  return { status: "pending", message: "Thanks! We'll review it and add it if we can." };
}

const slimProduct = (p) => ({ id: p.id, name: p.name, setName: p.setName, number: p.number, image: p.image, language: p.language || "english" });

/** The card is in the price service: mark the request added and teach search the member's words (if they fit). */
async function found(user, q, url, product, why, requestId = null) {
  const teach = describes(q, product);
  const fields = { status: "added", productId: String(product.id), language: product.language || "english",
    reason: `${why}; ${teach ? "search taught" : "search words didn't match the card, so search wasn't changed"}` };
  if (requestId && db) await db.update(cardRequests).set(fields).where(eq(cardRequests.id, requestId));
  else if (db) requestId = (await db.insert(cardRequests).values({ userId: user.id, query: q || "(no search)", link: url.href, ...fields }).returning({ id: cardRequests.id }))[0]?.id ?? null;
  if (teach) await addAlias(normTerm(q), product, requestId);
  await log("catalog", "info", `Card request ${teach ? "added" : "found"}: ${product.name} (${product.setName || "?"}) for "${q}"`, { id: product.id, link: url.href }, user.id);
  return { status: teach ? "added" : "found", product: slimProduct(product),
    message: teach ? "Found it! It's on TCG Boogie now, and searching for it the same way will find it from now on." : "Found it! Here's the card." };
}

/** The card isn't in the price service: it's been added as a member card, without prices. */
async function addedWithoutPrices(user, q, url, { product, created }, requestId, why) {
  if (requestId && db) {
    await db.update(cardRequests).set({ status: "added", productId: String(product.id), language: product.language || "english",
      reason: created ? why : `${why} (already added by an earlier request)` }).where(eq(cardRequests.id, requestId));
  }
  if (describes(q, product)) await addAlias(normTerm(q), product, requestId);
  await log("catalog", "info", `Card request ${created ? "added a new card" : "matched a member-added card"} (no prices): ${product.name} (${product.setName || "?"}, ${product.language}) for "${q}"`,
    { id: product.id, link: url.href }, user.id);
  return { status: "added", noPrices: true, product: slimProduct(product),
    message: `${created ? "Added!" : "Found it!"} ${product.name}${product.number ? ` #${product.number}` : ""} is on TCG Boogie now. We don't have pricing data for this ${product.type === "sealed" ? "product" : "card"} yet, but you can add it to your collection (with your own value) and set price alerts.` };
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

/** The usual search, with products learned from requests first and member-added cards (no prices) after. */
export async function searchWithRequests(q) {
  const [learned, members, found] = await Promise.all([
    aliasMatches(q).then((rows) => Promise.all(rows.map((r) => getProduct(r.productId, { language: r.language }).catch(() => null)))),
    searchMemberCards(q),
    searchProducts(q),
  ]);
  const seen = new Set();
  return [...learned.filter(Boolean), ...found, ...members].filter((p) => {
    const k = `${p.id}:${p.language || "english"}`;
    return seen.has(k) ? false : seen.add(k);
  });
}

// ---------- Admin → Requests ----------
export async function listRequests({ status = "pending", kind = "all", limit = 100 } = {}) {
  if (!db) return [];
  const where = and(status === "all" ? undefined : eq(cardRequests.status, status), kind === "all" ? undefined : eq(cardRequests.kind, kind));
  const rows = await db.select({ r: cardRequests, email: schema.users.email, memberCard: schema.memberCards.id }).from(cardRequests)
    .leftJoin(schema.users, eq(schema.users.id, cardRequests.userId))
    .leftJoin(schema.memberCards, and(eq(schema.memberCards.productId, cardRequests.productId), eq(schema.memberCards.hidden, false)))
    .where(where).orderBy(desc(cardRequests.createdAt)).limit(limit);
  const out = rows.map(({ r, email, memberCard }) => ({ ...r, email, memberCard: Boolean(memberCard) }));
  // Held requests: is that card already in the catalog (added from another request)? Then approving just links to it.
  for (const r of out) if (r.status === "pending" && r.card?.name) r.existing = await existingFor(r.card);
  return out;
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
  const product = (await getProduct(pid)) || (await addFromTcgplayer(pid, { link: req.link, userId: req.userId, requestId: req.id }).catch(() => null))?.product;
  if (!product) return "TCGplayer didn't describe that product as a Pokémon card. Check the link.";
  await db.update(cardRequests).set({ status: "added", productId: String(product.id), language: product.language || "english",
    reason: `Approved by ${admin.email}`, reviewedBy: admin.email, reviewedAt: new Date() }).where(eq(cardRequests.id, req.id));
  await addAlias(normTerm(req.query), product, req.id);
  return null;
}

/** Import-format requests: mark reviewed ("done"). */
export async function markRequestDone(admin, id) {
  await db.update(cardRequests).set({ status: "done", reviewedBy: admin.email, reviewedAt: new Date() })
    .where(and(eq(cardRequests.id, Number(id)), eq(cardRequests.status, "pending")));
}

/** Admin: add a held card exactly as we read it from the member's link (and teach search the member's words). */
export async function approveAsRead(admin, id) {
  const [req] = await db.select().from(cardRequests).where(eq(cardRequests.id, Number(id))).limit(1);
  if (!req) return "That request is gone.";
  if (!req.card?.name) return "We didn't keep what we read for this request. Approve it with a TCGplayer link instead.";
  const added = await addFromPage(req.card, { link: req.link, userId: req.userId, requestId: req.id });
  if (!added) return "Couldn't add that card (it may have been removed before).";
  await db.update(cardRequests).set({ status: "added", productId: String(added.product.id), language: added.product.language || "english",
    reason: `Added as read, approved by ${admin.email}`, reviewedBy: admin.email, reviewedAt: new Date() }).where(eq(cardRequests.id, req.id));
  if (describes(req.query, added.product)) await addAlias(normTerm(req.query), added.product, req.id);
  return null;
}

export async function declineRequests(admin, ids, reason) {
  const list = (Array.isArray(ids) ? ids : [ids]).map(Number).filter(Boolean);
  if (!list.length) return;
  await db.update(cardRequests).set({ status: "declined", reason: String(reason || "Declined").slice(0, 200), reviewedBy: admin.email, reviewedAt: new Date() })
    .where(and(inArray(cardRequests.id, list), eq(cardRequests.status, "pending")));
}

/**
 * Import: a member's file whose columns we couldn't recognise by name. Saved as a request (just the column names and
 * the file name, never the rows) so admins can see which apps' exports to support. Once per member per header a day.
 */
export async function recordImportFormat(user, { fileName, header, guessed }) {
  if (!db) return;
  const cols = (Array.isArray(header) ? header : []).map((h) => String(h || "").trim().slice(0, 40)).filter(Boolean).slice(0, 30);
  if (!cols.length) return;
  const query = cols.join(" | ").slice(0, 600);
  const since = new Date(Date.now() - 86400000);
  const [dupe] = await db.select({ id: cardRequests.id }).from(cardRequests)
    .where(and(eq(cardRequests.userId, user.id), eq(cardRequests.kind, "import"), eq(cardRequests.query, query), gte(cardRequests.createdAt, since))).limit(1);
  if (dupe) return;
  await db.insert(cardRequests).values({ userId: user.id, kind: "import", query, link: String(fileName || "file.csv").slice(0, 200),
    status: "pending", reason: guessed ? "Columns not recognised; we guessed them and the member could adjust" : "Columns not recognised" });
}
