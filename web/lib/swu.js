import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { log } from "@/lib/log";

// Star Wars: Unlimited cards and sealed product, priced from TCGCSV (tcgcsv.com): free daily copies of TCGplayer's
// prices, one category (79) for the whole game, about 70 requests a day. Not the Pokémon price service, so no credits.
//
// - Products are TCGplayer products, IDs "swu-<productId>". Hyperspace, Showcase and Prestige cards are their own
//   products ("Obi-Wan Kenobi - Patient Mentor (Hyperspace)"); Normal and Foil are a product's printings.
// - Prices are Near Mint market prices only (TCGCSV has no other conditions). History is our own: one point a day.
// - The import (refreshSwu, from the price-alert cron) runs once a day after TCGCSV updates (~20:00 UTC) and saves
//   everything to swu_product; pages read a copy held in memory (no history), reloaded when a new import lands.
// - Without a database (the local demo) the catalog is read straight from TCGCSV and kept in memory.
// TCGCSV's rules: a custom User-Agent, ~100 ms between requests, under 10,000 requests a day, server side only.

const BASE = "https://tcgcsv.com/tcgplayer/79";
const UA = process.env.TCGCSV_USER_AGENT || "card-collection-sync/1.0";
const SETS_KEY = "swu_sets";
const IMPORT_KEY = "swu_import";
const PREFIX = "swu-";
export const SWU_SERIES = "Star Wars: Unlimited";
const SET_PREFIX = "Star Wars: "; // set names carry it, so they never collide with a Pokémon set ("Judge Promos")
const HISTORY_DAYS = 400;

export const isSwuId = (id) => /^swu-\d+$/.test(String(id));
const tcgId = (id) => String(id).slice(PREFIX.length);
const r2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bigImage = (url) => (url ? String(url).replace(/_200w\.jpg$/, "_in_400x400.jpg") : null);

async function get(path) {
  const r = await fetch(`${BASE}${path}`, { headers: { "User-Agent": UA }, cache: "no-store" });
  if (!r.ok) throw new Error(`TCGCSV ${path}: HTTP ${r.status}`);
  const j = await r.json();
  return j.results || [];
}

// ---------- reading TCGCSV ----------
const ext = (p, name) => (p.extendedData || []).find((e) => e.name === name)?.value ?? null;
const factsOf = (p) => {
  const f = { aspect: ext(p, "Aspect")?.split(/\s*;\s*/).join(" · ") ?? null, cardType: ext(p, "CardType"), cost: ext(p, "Cost"), power: ext(p, "Power"), hp: ext(p, "HP"), arena: ext(p, "Arena Type"), traits: ext(p, "Traits") };
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== null && v !== ""));
};

/** One TCGCSV group as our set. */
function toSet(g, products) {
  const cards = products.filter((p) => p.type === "card").length;
  // The set's picture: its booster pack (else its booster box or any sealed product), as TCGplayer shows it.
  const sealed = products.filter((p) => p.type === "sealed" && p.image);
  const art = sealed.find((p) => /booster pack$/i.test(p.name)) || sealed.find((p) => /booster (display|box)$/i.test(p.name)) || sealed[0] || null;
  return {
    id: String(g.groupId), groupId: g.groupId, name: `${SET_PREFIX}${g.name}`, code: g.abbreviation || null, series: SWU_SERIES,
    releaseDate: g.publishedOn ? String(g.publishedOn).slice(0, 10) : null, total: cards, printedTotal: cards,
    sealed: products.length - cards, image: art?.image || null,
  };
}

/** A group's products with their prices, as rows for swu_product. */
function toRows(products, prices) {
  const byId = new Map();
  for (const p of prices) {
    const m = byId.get(p.productId) || byId.set(p.productId, {}).get(p.productId);
    m[p.subTypeName || "Normal"] = { market: r2(p.marketPrice), low: r2(p.lowPrice) };
  }
  return products.map((p) => {
    const number = ext(p, "Number");
    return {
      productId: `${PREFIX}${p.productId}`, groupId: p.groupId, type: number ? "card" : "sealed", name: p.name, number,
      rarity: ext(p, "Rarity"), image: bigImage(p.imageUrl), url: p.url || `https://www.tcgplayer.com/product/${p.productId}`,
      facts: number ? factsOf(p) : null, prices: byId.get(p.productId) || {},
    };
  });
}

/** Every Star Wars set and product from TCGCSV: { sets, rows }. About 70 requests, 100+ ms apart. */
async function fetchAll() {
  const groups = await get("/groups");
  const sets = [];
  const rows = [];
  for (const g of groups) {
    await sleep(150);
    const products = await get(`/${g.groupId}/products`);
    await sleep(150);
    const prices = await get(`/${g.groupId}/prices`).catch(() => []); // a brand-new set can have no prices yet
    const mine = toRows(products, prices);
    sets.push(toSet(g, mine));
    rows.push(...mine);
  }
  sets.sort((a, b) => String(b.releaseDate || "").localeCompare(String(a.releaseDate || "")));
  return { sets, rows };
}

// ---------- the daily import ----------
const HISTORY_SQL = (today) => sql`(SELECT coalesce(jsonb_agg(x ORDER BY n), '[]'::jsonb) FROM (
    SELECT x, n FROM jsonb_array_elements(
      (SELECT coalesce(jsonb_agg(y ORDER BY m), '[]'::jsonb) FROM jsonb_array_elements(coalesce(swu_product.history, '[]'::jsonb))
        WITH ORDINALITY AS o(y, m) WHERE y->>'date' <> ${today}) || excluded.history
    ) WITH ORDINALITY AS h(x, n) ORDER BY n DESC LIMIT ${sql.raw(String(HISTORY_DAYS))}) last)`;

/**
 * Copy today's Star Wars prices into swu_product, once a day after TCGCSV updates (around 20:00 UTC). Called every
 * cron run; returns quickly when there's nothing new. force: run now whatever the time.
 */
export async function refreshSwu({ force = false } = {}) {
  if (!db) return { skipped: "no database" };
  const [row] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, IMPORT_KEY)).limit(1).catch(() => []);
  const last = row?.value?.at ? new Date(row.value.at).getTime() : 0;
  const now = new Date();
  const hours = (Date.now() - last) / 3600000;
  if (!force && last && !(hours > 26 || (hours > 12 && now.getUTCHours() >= 21))) return { skipped: "imported recently" };
  const stamp = await fetch("https://tcgcsv.com/last-updated.txt", { headers: { "User-Agent": UA }, cache: "no-store" })
    .then((r) => (r.ok ? r.text() : "")).then((t) => t.trim()).catch(() => "");
  if (!force && stamp && row?.value?.stamp === stamp) return { skipped: "no new prices yet" };

  const started = Date.now();
  const { sets, rows } = await fetchAll();
  const today = now.toISOString().slice(0, 10);
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500).map((r) => {
      const point = { date: today, normal: r.prices.Normal?.market ?? null, foil: r.prices.Foil?.market ?? null };
      return { ...r, history: point.normal != null || point.foil != null ? [point] : [], updatedAt: now };
    });
    await db.insert(schema.swuProducts).values(batch).onConflictDoUpdate({
      target: schema.swuProducts.productId,
      set: {
        groupId: sql`excluded.group_id`, type: sql`excluded.type`, name: sql`excluded.name`, number: sql`excluded.number`,
        rarity: sql`excluded.rarity`, image: sql`coalesce(excluded.image, swu_product.image)`, url: sql`excluded.url`,
        facts: sql`excluded.facts`, prices: sql`excluded.prices`, history: HISTORY_SQL(today), updatedAt: sql`excluded.updated_at`,
      },
    });
  }
  const at = new Date().toISOString();
  for (const [key, value] of [[SETS_KEY, sets], [IMPORT_KEY, { at, stamp, products: rows.length, sets: sets.length }]]) {
    await db.insert(schema.appSettings).values({ key, value })
      .onConflictDoUpdate({ target: schema.appSettings.key, set: { value, updatedAt: new Date() } });
  }
  const secs = Math.round((Date.now() - started) / 1000);
  void log("prices", "info", `Star Wars: Unlimited prices imported: ${rows.length} products in ${sets.length} sets (${secs}s)`);
  return { products: rows.length, sets: sets.length, seconds: secs };
}

// ---------- the copy in memory ----------
// { sets, byId: Map(productId -> row without history), stamp, checkedAt }. Shared across hot reloads.
const g = globalThis;
const CHECK_MS = 10 * 60 * 1000;
const DEMO_MS = 12 * 3600 * 1000;

async function load() {
  const mem = g.__swuCatalog;
  if (mem && Date.now() - mem.checkedAt < (db ? CHECK_MS : DEMO_MS)) return mem;
  if (g.__swuLoading) return g.__swuLoading;
  g.__swuLoading = (async () => {
    try {
      if (!db) {
        const { sets, rows } = await fetchAll();
        return (g.__swuCatalog = { sets, byId: new Map(rows.map((r) => [r.productId, r])), stamp: "demo", checkedAt: Date.now() });
      }
      // Only reread the products when a new import has landed since the last read.
      const [imp] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, IMPORT_KEY)).limit(1);
      const stamp = imp?.value?.at || null;
      if (mem && mem.stamp === stamp) return (g.__swuCatalog = { ...mem, checkedAt: Date.now() });
      if (!stamp) return (g.__swuCatalog = { sets: [], byId: new Map(), stamp: null, checkedAt: Date.now() });
      const [setRow] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, SETS_KEY)).limit(1);
      const cols = schema.swuProducts; // everything but the history (most of a row)
      const rows = await db.select({
        productId: cols.productId, groupId: cols.groupId, type: cols.type, name: cols.name, number: cols.number,
        rarity: cols.rarity, image: cols.image, url: cols.url, facts: cols.facts, prices: cols.prices,
      }).from(schema.swuProducts);
      return (g.__swuCatalog = { sets: setRow?.value || [], byId: new Map(rows.map((r) => [r.productId, r])), stamp, checkedAt: Date.now() });
    } catch (e) {
      // TCGCSV or the database is down (or swu_product isn't there before db:push): keep what we had.
      if (!mem) console.error("[swu] catalog didn't load:", e.message);
      return (g.__swuCatalog = mem ? { ...mem, checkedAt: Date.now() - CHECK_MS + 60000 } : { sets: [], byId: new Map(), stamp: null, checkedAt: Date.now() - CHECK_MS + 60000 });
    } finally {
      g.__swuLoading = null;
    }
  })();
  return g.__swuLoading;
}

// Saved price histories, read in one go for a page's products (prefetchSwu) or one at a time.
const histories = new Map(); // productId -> { at, points }
const HISTORY_TTL = 3600 * 1000;
export async function prefetchSwu(ids) {
  const want = [...new Set(ids.map(String))].filter((id) => isSwuId(id) && !(Date.now() - (histories.get(id)?.at || 0) < HISTORY_TTL));
  if (!db || !want.length) return;
  try {
    const rows = await db.select({ productId: schema.swuProducts.productId, history: schema.swuProducts.history })
      .from(schema.swuProducts).where(inArray(schema.swuProducts.productId, want));
    const found = new Map(rows.map((r) => [r.productId, r.history || []]));
    for (const id of want) histories.set(id, { at: Date.now(), points: found.get(id) || [] });
    if (histories.size > 20000) histories.clear();
  } catch { /* no history: the card still shows today's price */ }
}
async function historyOf(id) {
  if (!histories.has(id) || Date.now() - histories.get(id).at >= HISTORY_TTL) await prefetchSwu([id]);
  return histories.get(id)?.points || [];
}

// ---------- products ----------
const setOf = (cat, groupId) => cat.sets.find((s) => s.groupId === groupId) || null;

/** A swu_product row as a catalog product, in the same shape as lib/catalog.js's. */
function toProduct(cat, r, points = []) {
  const set = setOf(cat, r.groupId);
  const base = {
    id: r.productId, type: r.type, name: r.name, setName: set?.name || SET_PREFIX.trim(), setId: String(r.groupId),
    number: r.number || null, rarity: r.rarity || null, language: "english", image: r.image || null, tcgplayerUrl: r.url,
    graded: {}, recentSales: [], swu: { code: set?.code || null, ...(r.facts || {}) },
  };
  // The printing with a Near Mint price goes first (Hyperspace Foil and Prestige Foil cards only come in Foil).
  const printings = ["Normal", "Foil", ...Object.keys(r.prices || {})].filter((k, i, a) => a.indexOf(k) === i && r.prices?.[k]);
  const lead = printings.find((k) => r.prices[k].market != null) || printings[0] || null;
  const key = lead === "Foil" ? "foil" : "normal";
  const history = points.map((h) => ({ date: h.date, price: h[key] })).filter((h) => Number.isFinite(h.price));
  if (r.type === "sealed") {
    const p = r.prices?.Normal || r.prices?.[lead] || {};
    return { ...base, prices: { market: p.market ?? null, low: p.low ?? null }, history };
  }
  const prices = {};
  for (const k of [lead, ...printings.filter((x) => x !== lead)].filter(Boolean)) {
    const v = r.prices[k];
    if (v.market != null || v.low != null) prices[k] = { "Near Mint": { market: v.market ?? null, low: v.low ?? null } };
  }
  return { ...base, prices, history };
}

/** One Star Wars product by ID ("swu-565465"), with its price history, or null. */
export async function swuProduct(id) {
  const cat = await load();
  const r = cat.byId.get(String(id));
  return r ? toProduct(cat, r, await historyOf(r.productId)) : null;
}

/** Every Star Wars set, newest first, in listSets()'s shape (series "Star Wars: Unlimited"). */
export async function swuSets() {
  return (await load()).sets;
}
export async function swuSetByName(name) {
  if (!String(name || "").startsWith(SET_PREFIX)) return null;
  return (await load()).sets.find((s) => s.name === name) || null;
}

/** Every card in a Star Wars set (no history), or null for an unknown set. sealed: its sealed products instead. */
export async function swuSetCards(name, { sealed = false } = {}) {
  const cat = await load();
  const set = cat.sets.find((s) => s.name === name);
  if (!set) return null;
  const out = [];
  for (const r of cat.byId.values()) if (r.groupId === set.groupId && (r.type === "sealed") === sealed) out.push(toProduct(cat, r));
  return out;
}

const words = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const STOP = new Set(["star", "wars", "swu", "unlimited", "card", "the", "of"]);
/** Does a search ask for Star Wars cards? ("star wars vader", "swu boba", "hyperspace luke") */
export const asksForSwu = (q) => /\b(star\s*wars|swu|hyperspace|showcase|prestige|spark of rebellion|jump to lightspeed|twilight of the republic|shadows of the galaxy|legends of the force|secrets of power|a lawless time|ashes of the empire|homeworlds)\b/i.test(String(q || ""));

/**
 * Star Wars products whose name, subtitle, set, set code or number contain every search word ("vader", "boba fett
 * hyperspace", "sor 10"). Exact name starts first, then priciest.
 */
export async function searchSwu(q, limit = 8) {
  const ws = words(q).split(" ").filter((w) => w && !STOP.has(w));
  if (!ws.length) return [];
  const cat = await load();
  const codeOf = new Map(cat.sets.map((s) => [s.groupId, `${words(s.name)} ${words(s.code || "")}`]));
  const hits = [];
  for (const r of cat.byId.values()) {
    const text = ` ${words(r.name)} ${codeOf.get(r.groupId) || ""} ${words(r.number || "")} ${r.type === "sealed" ? "sealed" : ""} `;
    if (ws.every((w) => text.includes(` ${w}`))) hits.push(r);
  }
  const first = ws[0];
  const price = (r) => r.prices?.Normal?.market ?? r.prices?.Foil?.market ?? 0;
  hits.sort((a, b) => Number(words(b.name).startsWith(first)) - Number(words(a.name).startsWith(first)) || price(b) - price(a));
  return hits.slice(0, limit).map((r) => toProduct(cat, r));
}

/** Admin → Status: when the last import ran and how big it was. */
export async function swuImportStatus() {
  if (!db) return null;
  const [row] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, IMPORT_KEY)).limit(1).catch(() => []);
  return row?.value || null;
}
