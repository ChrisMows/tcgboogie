import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { log } from "@/lib/log";

// TCGplayer card and sealed product prices (plus eBay graded sales), via the PokemonPriceTracker API.
// Prices update about once a day. Responses are cached and shared by every member (in the database when there is one),
// so a card costs one lookup a day no matter how many people own or watch it.
// Without PPT_API_KEY (local demo) a small sample catalog is used instead.

const PPT = "https://www.pokemonpricetracker.com/api/v2";
const HOUR = 3600 * 1000;
const PRICE_TTL = 20 * HOUR; // keep in step with price_cache_hours in the bot's config.yaml
const img = (id) => `https://tcgplayer-cdn.tcgplayer.com/product/${id}_in_200x200.jpg`;
const r2 = (v) => Math.round(v * 100) / 100;
const today = new Date();
// A believable sample price history that ends exactly at today's price.
const series = (base, wobble, days = 90, seed = 1) => {
  const raw = Array.from({ length: days }, (_, i) => 1 + Math.sin(i / 5 + seed) * wobble + (days - i) * 0.0012 * (seed % 2 ? 1 : -1));
  const k = base / raw[days - 1];
  return raw.map((v, i) => ({ date: new Date(today.getTime() - (days - 1 - i) * 86400000).toISOString().slice(0, 10), price: r2(v * k) }));
};
const conds = (nm, low) => ({
  "Near Mint": { market: nm, low },
  "Lightly Played": { market: r2(nm * 0.88), low: r2(low * 0.88) },
  "Moderately Played": { market: r2(nm * 0.72), low: r2(low * 0.72) },
  "Heavily Played": { market: r2(nm * 0.55), low: r2(low * 0.55) },
});
// Sample slab values as multiples of the raw Near Mint price.
const GRADE_MULT = { psa10: 3.4, psa9: 1.45, psa8: 1.08, psa7: 0.9, bgs10: 5, bgs9_5: 2.3, bgs9: 1.3, cgc10: 2.4, cgc9_5: 1.6, cgc9: 1.15, sgc10: 2.1, sgc9: 1.2, tag10: 2.2, tag9: 1.15 };
const sampleGraded = (nm) =>
  nm < 3 ? {} : Object.fromEntries(Object.entries(GRADE_MULT).map(([k, m]) => [k, { price: r2(Math.max(nm * m, 12)), sales: Math.round(4 + (nm % 17)) }]));

// ---------- sample catalog (demo only) ----------
const SAMPLE_SETS = [
  { id: "base-set", name: "Base Set", series: "Original", releaseDate: "1999-01-09", printedTotal: 102 },
  { id: "sv-151", name: "Scarlet & Violet 151", series: "Scarlet & Violet", releaseDate: "2023-09-22", printedTotal: 165 },
  { id: "evolving-skies", name: "Evolving Skies", series: "Sword & Shield", releaseDate: "2021-08-27", printedTotal: 203 },
];
const sampleCards = {
  "Base Set": [
    ["1", "Alakazam", 95], ["2", "Blastoise", 210], ["3", "Chansey", 70], ["4", "Charizard", 489.99, "42382"], ["5", "Clefairy", 60],
    ["6", "Gyarados", 75], ["7", "Hitmonchan", 55], ["8", "Machamp", 25], ["9", "Magneton", 50], ["10", "Mewtwo", 85],
    ["11", "Nidoking", 65], ["12", "Ninetales", 70], ["13", "Poliwrath", 45], ["14", "Raichu", 80], ["15", "Venusaur", 180], ["16", "Zapdos", 70],
  ],
  "Scarlet & Violet 151": [
    ["1", "Bulbasaur", 0.35, null, "Normal"], ["2", "Ivysaur", 0.3, null, "Normal"], ["3", "Venusaur ex", 2.5], ["4", "Charmander", 0.5, null, "Normal"],
    ["5", "Charmeleon", 0.4, null, "Normal"], ["6", "Charizard ex", 6.5], ["7", "Squirtle", 0.45, null, "Normal"], ["8", "Wartortle", 0.3, null, "Normal"],
    ["9", "Blastoise ex", 2.8], ["166", "Bulbasaur", 18], ["167", "Ivysaur", 14], ["168", "Charmander", 32], ["169", "Charmeleon", 16],
    ["170", "Squirtle", 25], ["171", "Wartortle", 13], ["175", "Psyduck", 57.93, "517035"], ["198", "Venusaur ex", 62], ["199", "Charizard ex", 325, "517045"],
    ["200", "Blastoise ex", 78], ["201", "Alakazam ex", 41], ["202", "Zapdos ex", 38], ["205", "Mew ex", 34],
  ],
  "Evolving Skies": [
    ["205", "Leafeon VMAX (Alternate Art Secret)", 210], ["209", "Glaceon VMAX (Alternate Art Secret)", 310],
    ["212", "Sylveon VMAX (Alternate Art Secret)", 265], ["215", "Umbreon VMAX (Alternate Art Secret)", 2264.7, "246723"],
    ["218", "Rayquaza VMAX (Alternate Art Secret)", 520],
  ],
};
const SAMPLE = [];
for (const set of SAMPLE_SETS) {
  sampleCards[set.name].forEach(([num, name, nm, realId, printing = "Holofoil"], i) => {
    const id = realId || `demo-${set.id}-${num}`;
    SAMPLE.push({
      id, type: "card", name, setName: set.name, setId: set.id,
      number: `${num.padStart(3, "0")}/${String(set.printedTotal).padStart(3, "0")}`,
      image: realId ? img(realId) : null, prices: { [printing]: conds(nm, r2(nm * 0.82)) },
      graded: sampleGraded(nm), history: series(nm, 0.05, 90, i + 1), rarity: nm > 20 ? "Rare" : "Common",
    });
  });
}
SAMPLE.push(
  { id: "84186", type: "card", name: "Charizard", setName: "Skyridge", setId: "skyridge", number: "146/144", image: img("84186"),
    prices: { Holofoil: conds(1850, 1600) }, graded: sampleGraded(1850), history: series(1850, 0.02, 90, 3) },
  { id: "demo-151-bundle", type: "sealed", name: "Scarlet & Violet 151 Booster Bundle", setName: "Scarlet & Violet 151", setId: "sv-151",
    number: null, image: null, prices: { market: 61.5, low: 54.99 }, graded: {}, history: series(61.5, 0.05, 90, 4) },
  { id: "demo-evs-etb", type: "sealed", name: "Evolving Skies Elite Trainer Box", setName: "Evolving Skies", setId: "evolving-skies",
    number: null, image: null, prices: { market: 189.99, low: 172.5 }, graded: {}, history: series(189.99, 0.04, 90, 5) },
);
for (const p of SAMPLE) {
  p.tcgplayerUrl = /^\d+$/.test(p.id)
    ? `https://www.tcgplayer.com/product/${p.id}`
    : `https://www.tcgplayer.com/search/pokemon/product?q=${encodeURIComponent(`${p.name} ${p.setName}`)}`;
}

export const catalogLive = () => Boolean(process.env.PPT_API_KEY);

// Last price-service response, for the admin status page.
const status = globalThis.__tcgPptStatus ?? (globalThis.__tcgPptStatus = { at: null, ok: null, code: null, creditsLeft: null });
/**
 * Is a graded price backed by enough recent sales to show as a value? One sale from two years ago isn't:
 * the service must rate it medium/high confidence, or there must be 3+ sales with one in the last 6 months.
 */
function gradedReliable({ sales, lastSale, confidence }) {
  if (confidence === "high" || confidence === "medium") return true;
  const recent = lastSale && Date.now() - new Date(lastSale).getTime() < 183 * 86400000;
  return Boolean(recent && (sales ?? 0) >= 3);
}

function recordStatus(r) {
  const left = r.headers.get("x-ratelimit-daily-remaining") ?? r.headers.get("x-ratelimit-total-remaining");
  Object.assign(status, { at: new Date().toISOString(), ok: r.ok || r.status === 404, code: r.status, creditsLeft: left === null ? status.creditsLeft : Number(left) });
  if (left !== null) shareCredits(Number(left));
  if (!status.ok) void log("prices", r.status === 429 ? "warn" : "error", `Price service answered ${r.status}${r.status === 429 ? " (out of credits or rate-limited)" : ""}`, { url: String(r.url || "").replace(/\?.*$/, ""), creditsLeft: status.creditsLeft });
  else if (status.creditsLeft !== null && status.creditsLeft !== undefined && status.creditsLeft < 500 && !status.lowWarned) {
    status.lowWarned = true;
    void log("prices", "warn", `Price service credits running low: ${status.creditsLeft} left today`);
  }
}
export const priceServiceStatus = () => ({ ...status });

// The bot uses the same API key, so both write the credits left today to one shared setting (at most once a minute
// from here). The bot paces its spending against it and always leaves a reserve for the website.
let lastShared = 0;
function shareCredits(remaining) {
  if (!db || !Number.isFinite(remaining) || Date.now() - lastShared < 60000) return;
  lastShared = Date.now();
  const value = { remaining, at: new Date().toISOString(), by: "website" };
  db.insert(schema.appSettings).values({ key: "ppt_credits", value })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value, updatedAt: new Date() } }).catch(() => {});
}

/** Admin status check: one tiny live request (1 credit). */
export async function pingPriceService() {
  if (!catalogLive()) return { ok: false, detail: "No PPT_API_KEY set" };
  const started = Date.now();
  const r = await fetch(`${PPT}/sets?limit=1`, { headers: { Authorization: `Bearer ${process.env.PPT_API_KEY}` }, cache: "no-store" });
  recordStatus(r);
  return { ok: r.ok, ms: Date.now() - started, code: r.status, creditsLeft: status.creditsLeft };
}

// ---------- cache: memory first, then the shared database table ----------
const mem = globalThis.__tcgCatalog ?? (globalThis.__tcgCatalog = new Map());
const MISS = Symbol("miss");
// cachedOnly: return MISS instead of calling the API (no credits spent).
async function cached(key, maxAgeMs, fetcher, cachedOnly = false) {
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.data;
  if (cachedOnly && !db) return MISS;
  if (db) {
    const [row] = await db.select().from(schema.catalogCache).where(eq(schema.catalogCache.key, key)).limit(1);
    if (row && Date.now() - row.fetchedAt.getTime() < maxAgeMs) {
      mem.set(key, { at: row.fetchedAt.getTime(), data: row.data });
      return row.data;
    }
  }
  if (cachedOnly) return MISS;
  const data = await fetcher();
  mem.set(key, { at: Date.now(), data });
  if (db) {
    await db.insert(schema.catalogCache).values({ key, data, fetchedAt: new Date() })
      .onConflictDoUpdate({ target: schema.catalogCache.key, set: { data, fetchedAt: new Date() } });
  }
  return data;
}

async function ppt(path, params, maxAgeMs = 12 * HOUR, cachedOnly = false) {
  const url = `${PPT}${path}?${new URLSearchParams(params)}`;
  return cached(url, maxAgeMs, async () => {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.PPT_API_KEY}` }, cache: "no-store" });
    recordStatus(r);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`Price service error ${r.status}`);
    return r.json();
  }, cachedOnly);
}

/**
 * Drop price points that can't be real: new cards often start with a placeholder (e.g. $5 on a $3,700 card) before
 * real sales, which would show as a +74,000% "change". Anything under a tenth or over 10x the typical price goes.
 */
function cleanHistory(points) {
  const vals = points.map((p) => p.price).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (vals.length < 3) return points.filter((p) => Number.isFinite(p.price) && p.price > 0);
  const median = vals[Math.floor(vals.length / 2)];
  return points.filter((p) => Number.isFinite(p.price) && p.price >= median / 10 && p.price <= median * 10);
}

const CONDITIONS = ["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"];
/** "Near Mint Holofoil" / "Near Mint" / "NM" -> "Near Mint" (null if it isn't a condition we know). */
function conditionName(raw) {
  const s = String(raw || "").trim().toLowerCase();
  return CONDITIONS.find((c) => s.startsWith(c.toLowerCase()))
    || ({ nm: "Near Mint", lp: "Lightly Played", mp: "Moderately Played", hp: "Heavily Played", dmg: "Damaged" })[s] || null;
}

function fromCard(c) {
  const prices = {};
  for (const [printing, byCond] of Object.entries(c.prices?.variants || {})) {
    prices[printing] = {};
    for (const [rawCond, v] of Object.entries(byCond || {})) {
      // Bulk set lookups label conditions with the printing added ("Near Mint Holofoil"): keep just the condition.
      const cond = conditionName(rawCond);
      if (!cond || v?.price == null) continue;
      prices[printing][cond] = {
        market: v.price,
        low: cond === "Near Mint" ? c.variants?.[printing]?.lowPrice ?? null : null,
      };
    }
  }
  // Some cards only carry an overall price: use it as Near Mint for the main printing.
  const main = c.prices?.primaryPrinting || Object.keys(prices)[0] || (c.printingsAvailable || [])[0] || "Normal";
  if (!prices[main]?.["Near Mint"] && c.prices?.market) {
    prices[main] = { ...(prices[main] || {}), "Near Mint": { market: c.prices.market, low: c.prices.low ?? c.variants?.[main]?.lowPrice ?? null } };
  }
  for (const k of Object.keys(prices)) if (!Object.keys(prices[k]).length) delete prices[k];
  const graded = {};
  for (const [key, g] of Object.entries(c.ebay?.salesByGrade || {})) {
    if (c.ebay?.smartPriceOutlierByGrade?.[key]) continue; // flagged as unreliable by the service
    const price = g?.smartMarketPrice?.price ?? g?.averagePrice ?? g?.medianPrice ?? null;
    if (!price) continue;
    const sales = g?.count ?? g?.totalSales ?? null;
    const lastSale = g?.lastSaleDate ? String(g.lastSaleDate).slice(0, 10) : null;
    const confidence = g?.smartMarketPrice?.confidence || null;
    graded[key] = { price: r2(price), sales, lastSale, confidence, reliable: gradedReliable({ sales, lastSale, confidence }) };
  }
  const primary = c.prices?.primaryPrinting || Object.keys(prices)[0];
  const byCond = c.priceHistory?.variants?.[primary] || {};
  const nmKey = Object.keys(byCond).find((k) => conditionName(k) === "Near Mint");
  const hist = (nmKey && byCond[nmKey]?.history) || [];
  return {
    id: String(c.tcgPlayerId), type: "card", name: c.name, setName: c.setName, setId: c.setId ? String(c.setId) : null,
    number: c.cardNumber, rarity: c.rarity || null,
    image: c.imageCdnUrl400 || c.imageCdnUrl200 || c.imageCdnUrl || null,
    tcgplayerUrl: c.tcgPlayerUrl || `https://www.tcgplayer.com/product/${c.tcgPlayerId}`,
    prices, graded, history: cleanHistory(hist.map((h) => ({ date: String(h.date).slice(0, 10), price: h.market }))),
  };
}

function fromSealed(s) {
  return {
    id: String(s.tcgPlayerId), type: "sealed", name: s.name, setName: s.setName, setId: s.setId ? String(s.setId) : null, number: null,
    image: s.imageCdnUrl400 || s.imageCdnUrl200 || s.imageCdnUrl || null,
    tcgplayerUrl: s.tcgPlayerUrl || `https://www.tcgplayer.com/product/${s.tcgPlayerId}`,
    prices: { market: s.prices?.market ?? s.marketPrice ?? null, low: s.prices?.low ?? s.lowPrice ?? null }, graded: {}, history: [],
  };
}

/**
 * One TCGplayer product (card or sealed) by TCGplayer product ID, with prices, slab values and 90 days of history.
 * With { cachedOnly: true } it returns undefined instead of spending API credits when the product isn't cached.
 */
export async function getProduct(id, { cachedOnly = false, language = "english" } = {}) {
  if (!catalogLive()) return SAMPLE.find((p) => p.id === String(id)) || null;
  // Same request (and cache entry) as the deal bot's price lookups; prices update about once a day.
  // Japanese cards are a separate catalog: the bot adds language=japanese, so we do too and share its copy.
  const japanese = language === "japanese";
  const card = await ppt(`/cards/${encodeURIComponent(id)}`,
    { includeHistory: "true", includeEbay: "true", days: "90", ...(japanese ? { language: "japanese" } : {}) }, PRICE_TTL, cachedOnly);
  if (card === MISS) return undefined;
  if (card?.data) return { ...fromCard(Array.isArray(card.data) ? card.data[0] : card.data), ...(japanese ? { language: "japanese" } : {}) };
  if (japanese) return null;
  const sealed = await ppt("/sealed-products", { tcgPlayerId: String(id), limit: "1" }, 12 * HOUR, cachedOnly);
  if (sealed === MISS) return undefined;
  const s = Array.isArray(sealed?.data) ? sealed.data[0] : sealed?.data;
  if (s) return fromSealed(s);
  // Not an English card or sealed product: Japanese cards (promos included) are a separate catalog, same IDs.
  return getProduct(id, { cachedOnly, language: "japanese" });
}

/** Search cards and sealed products by name (a few results each, to keep lookups cheap). */
export async function searchProducts(q) {
  const term = String(q || "").trim().slice(0, 80);
  if (term.length < 2) return [];
  if (!catalogLive()) {
    const words = term.toLowerCase().split(/\s+/);
    return SAMPLE.filter((p) => words.every((w) => `${p.name} ${p.setName} ${p.number || ""}`.toLowerCase().includes(w))).slice(0, 10);
  }
  const [cards, sealed, japanese] = await Promise.all([
    ppt("/cards", { search: term, limit: "8" }, 7 * 24 * HOUR),
    ppt("/sealed-products", { search: term, limit: "3" }, 7 * 24 * HOUR).catch(() => null),
    ppt("/cards", { search: term, limit: "4", language: "japanese" }, 7 * 24 * HOUR).catch(() => null),
  ]);
  return [...(cards?.data || []).map(fromCard), ...(japanese?.data || []).map((c) => ({ ...fromCard(c), language: "japanese" })),
    ...(sealed?.data || []).map(fromSealed)];
}

/** Every English set, newest first. The list rarely changes, so it's cached for a week. */
export async function listSets() {
  if (!catalogLive()) return SAMPLE_SETS.map((s) => ({ ...s, total: sampleCards[s.name].length }));
  const j = await ppt("/sets", { sortBy: "releaseDate", sortOrder: "desc", limit: "500" }, 7 * 24 * HOUR);
  return (j?.data || []).map((s) => ({
    id: String(s.id ?? s.tcgPlayerId ?? s.name), name: s.name, series: s.series || null, releaseDate: s.releaseDate || null,
    printedTotal: s.printedTotal ?? s.cardCount ?? null, total: s.totalCards ?? s.cardCount ?? null,
    image: s.imageCdnUrl || s.logoUrl || s.image || null,
  }));
}

/** Every card in a set, with prices (no history). Costs one credit per card, so it's cached for 3 days and shared. */
export async function getSetCards(setName) {
  if (!catalogLive()) return SAMPLE.filter((p) => p.type === "card" && p.setName === setName);
  const j = await ppt("/cards", { set: setName, fetchAllInSet: "true" }, 3 * 24 * HOUR);
  return (j?.data || []).map(fromCard);
}

export const sampleIds = () => SAMPLE.map((p) => p.id);

/** Preview catalog only: every sample card (the live catalog is far too big to list without a search). */
export const allSampleCards = () => (catalogLive() ? [] : SAMPLE.filter((p) => p.type === "card"));
