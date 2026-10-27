import "server-only";
import { withPicture } from "@/lib/card-images";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { log } from "@/lib/log";
import { getMemberCard, isMemberId } from "@/lib/member-cards";
import { isToppsId, toppsCard } from "@/lib/topps";
import { FAMILIES } from "@/lib/pokemon-families";

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

/**
 * Are today's price credits nearly gone (under `floor` left, by the website's last lookup or the bot's shared
 * count)? Then card pages and collections use saved prices instead of buying new ones, and the last credits go to
 * price alerts. Read at most once a minute.
 */
const low = globalThis.__tcgCreditsLow ?? (globalThis.__tcgCreditsLow = { at: 0, left: null });
export async function creditsLow(floor = 1000) {
  if (!catalogLive()) return false;
  if (db && Date.now() - low.at > 60000) {
    low.at = Date.now();
    try {
      const [row] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, "ppt_credits")).limit(1);
      const v = row?.value;
      if (v && Number.isFinite(Number(v.remaining)) && Date.now() - new Date(v.at).getTime() < 3 * 3600000) low.left = Number(v.remaining);
    } catch { /* keep the last reading */ }
  }
  const lefts = [status.creditsLeft, low.left].filter((x) => Number.isFinite(x));
  return lefts.length > 0 && Math.min(...lefts) < floor;
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
  const justRead = hit?.checked && Date.now() - hit.checked < 60000; // prefetchProducts just read the table: nothing newer there
  if (db && !justRead) {
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

const PRICE_PARAMS = { includeHistory: "true", includeEbay: "true", days: "90" };
const pptKey = (path, params) => `${PPT}${path}?${new URLSearchParams(params)}`;

async function ppt(path, params, maxAgeMs = 12 * HOUR, cachedOnly = false) {
  const url = pptKey(path, params);
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
  // Graded sales by day (last 90 days): { psa10: { "2026-08-31": { average, count } } }. salesByGrade.count is all-time,
  // so the recent count (what the 90-day price is based on) comes from here.
  const byDay = c.ebay?.priceHistory || {};
  const recentSales = [];
  for (const [key, g] of Object.entries(c.ebay?.salesByGrade || {})) {
    if (c.ebay?.smartPriceOutlierByGrade?.[key]) continue; // flagged as unreliable by the service
    const price = g?.smartMarketPrice?.price ?? g?.averagePrice ?? g?.medianPrice ?? null;
    if (!price) continue;
    const days = Object.entries(byDay[key] || {}).map(([date, d]) => ({ date: date.slice(0, 10), grade: key, price: r2(d?.average), count: d?.count || 1 }))
      .filter((d) => d.price > 0 && Date.now() - new Date(d.date).getTime() < 90 * 24 * HOUR);
    recentSales.push(...days);
    const sales = byDay[key] ? days.reduce((n, d) => n + d.count, 0) : g?.count ?? g?.totalSales ?? null;
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
    prices, graded, recentSales: recentSales.sort((a, b) => b.date.localeCompare(a.date)), // trimmed in withOurSales
    history: cleanHistory(hist.map((h) => ({ date: String(h.date).slice(0, 10), price: h.market }))),
  };
}

// Sealed history is ours: today's price is saved on every lookup (once a day per product), and the page gets the
// last 90 days we've saved. Charts, movers and sell-high alerts then work for sealed like they do for cards.
const sealedSaved = globalThis.__tcgSealedSaved ?? (globalThis.__tcgSealedSaved = new Set());
async function withSealedHistory(p) {
  if (!db) return p;
  const { sealedPrices } = schema;
  const day = new Date().toISOString().slice(0, 10);
  try {
    if (p.prices.market && !sealedSaved.has(`${p.id}:${day}`)) {
      await db.insert(sealedPrices).values({ productId: p.id, day, price: p.prices.market })
        .onConflictDoUpdate({ target: [sealedPrices.productId, sealedPrices.day], set: { price: p.prices.market } });
      sealedSaved.add(`${p.id}:${day}`);
      if (sealedSaved.size > 20000) sealedSaved.clear();
    }
    const since = new Date(Date.now() - 90 * 24 * HOUR).toISOString().slice(0, 10);
    const rows = await db.select().from(sealedPrices).where(and(eq(sealedPrices.productId, p.id), gte(sealedPrices.day, since))).orderBy(asc(sealedPrices.day));
    return { ...p, history: rows.map((r) => ({ date: String(r.day).slice(0, 10), price: r.price })) };
  } catch {
    return p; // history is a nice-to-have; never fail a page over it
  }
}

/** Daily (with the price-alert check): save today's price for every sealed product members own, wishlist or watch. */
export async function recordSealedPrices(max = 500) {
  if (!db || !catalogLive()) return { products: 0 };
  const owned = await db.selectDistinct({ id: schema.collectionItems.productId }).from(schema.collectionItems).where(eq(schema.collectionItems.productType, "sealed"));
  const watched = await db.selectDistinct({ id: schema.priceWatches.productId }).from(schema.priceWatches).where(eq(schema.priceWatches.productType, "sealed"));
  const ids = [...new Set([...owned, ...watched].map((r) => r.id))].slice(0, max);
  let n = 0;
  for (const id of ids) { try { if (await getProduct(id)) n++; } catch { /* try again tomorrow */ } }
  return { products: n };
}

// ---------- graded values: the price service's sales + real eBay sales we verified ourselves (see `sale`) ----------
const DAY_MS = 24 * HOUR;
const gradeKeyOf = (grader, grade) => `${String(grader || "").toLowerCase()}${String(grade || "").replace(" Pristine", "_pristine").replace(" Black Label", "_black").replace(".", "_")}`;

/** Median where each sale counts by weight (newer sales and days with several sales count more). */
function weightedMedian(points) {
  const pts = points.filter((p) => p.price > 0 && p.w > 0).sort((a, b) => a.price - b.price);
  const total = pts.reduce((s, p) => s + p.w, 0);
  let run = 0;
  for (const p of pts) { run += p.w; if (run >= total / 2) return p.price; }
  return null;
}

/**
 * Graded values from every known sale in the last 90 days: the price service's (by day) plus real eBay sales we
 * verified ourselves (`sale`), each sale counted once and newer sales counting more. With 3+ sales the value is the
 * weighted median; with 1-2 it's the weighted average (a median of two sales would just pick one of them). Every
 * grade with a recent sale gets a value; `sales` says how many it rests on. Grades with no recent sales keep the
 * service's own figure (and its reliability rule).
 */
async function withOurSales(p, prefetched) {
  const trim = (x) => ({ ...x, recentSales: (x.recentSales || []).slice(0, 40) }); // the card page filters these by grade
  if (p.type !== "card") return trim(p);
  let rows = [];
  if (prefetched) rows = prefetched.get(p.id) || [];
  else if (db) {
    try {
      rows = await db.select().from(schema.sales).where(and(eq(schema.sales.productId, p.id), eq(schema.sales.kind, "graded"),
        gte(schema.sales.soldAt, new Date(Date.now() - 90 * DAY_MS))));
    } catch { rows = []; }
  }
  const graded = { ...p.graded };
  const recent = [...(p.recentSales || [])];
  const ours = {};
  for (const r of rows) (ours[gradeKeyOf(r.grader, r.grade)] ||= []).push(r);
  const keys = new Set([...recent.map((d) => d.grade), ...Object.keys(ours)]);
  const ageW = (d) => 0.5 ** ((Date.now() - new Date(d.date).getTime()) / (30 * DAY_MS)); // a month old counts half
  for (const key of keys) {
    if (p.graded?.[key] === undefined && !ours[key]) continue; // the service flagged this grade's data as unreliable
    const service = recent.filter((d) => d.grade === key);
    const mine = (ours[key] || []).filter((r) => {
      const day = r.soldAt.toISOString().slice(0, 10);
      return !service.some((d) => d.date === day && d.count === 1 && Math.abs(d.price - r.price) < 1); // already counted
    }).map((r) => ({ date: r.soldAt.toISOString().slice(0, 10), grade: key, price: r.price, count: 1, source: "ebay", url: r.url }));
    const all = [...service, ...mine];
    if (!all.length) continue;
    const pts = all.map((d) => ({ price: d.price, w: (d.count || 1) * ageW(d) }));
    const sales = all.reduce((n, d) => n + (d.count || 1), 0);
    const value = sales >= 3 ? weightedMedian(pts) : pts.reduce((s, x) => s + x.price * x.w, 0) / pts.reduce((s, x) => s + x.w, 0);
    if (!value) continue;
    graded[key] = {
      price: r2(value), sales, lastSale: all.map((d) => d.date).sort().pop(),
      low: r2(Math.min(...all.map((d) => d.price))), high: r2(Math.max(...all.map((d) => d.price))),
      confidence: sales >= 5 ? "medium" : "low", reliable: true, few: sales < 3, ourSales: mine.length,
    };
    recent.push(...mine);
  }
  return trim({ ...p, graded, recentSales: recent.sort((a, b) => b.date.localeCompare(a.date)) });
}

function fromSealed(s) {
  return {
    id: String(s.tcgPlayerId), type: "sealed", name: s.name, setName: s.setName, setId: s.setId ? String(s.setId) : null, number: null,
    image: s.imageCdnUrl400 || s.imageCdnUrl200 || s.imageCdnUrl || null,
    tcgplayerUrl: s.tcgPlayerUrl || `https://www.tcgplayer.com/product/${s.tcgPlayerId}`,
    // The service reports a sealed product's price as `unopenedPrice` (older responses used prices.market).
    prices: { market: s.prices?.market ?? s.marketPrice ?? s.unopenedPrice ?? null, low: s.prices?.low ?? s.lowPrice ?? null }, graded: {}, history: [],
  };
}

/**
 * One product (card or sealed) by TCGplayer product ID, with prices, slab values and 90 days of history.
 * With { cachedOnly: true } it returns undefined instead of spending API credits when the product isn't cached.
 * Cards members added that the price service doesn't have (lib/member-cards.js) come back without prices; one with a
 * TCGplayer number gets the service's prices by itself once the service adds it.
 */
export async function getProduct(id, opts = {}) {
  const p = await findProduct(id, opts);
  return p ? withPicture(p) : p; // a picture saved for a card TCGplayer has none for (lib/card-images.js)
}

async function findProduct(id, opts) {
  if (isToppsId(id)) return toppsCard(id);
  if (isMemberId(id)) {
    const m = await getMemberCard(id);
    return m && withOurSales(m, opts.sales);
  }
  const p = await pricedProduct(id, opts);
  if (p !== null) return p;
  const m = await getMemberCard(id);
  return m ? withOurSales(m, opts.sales) : null;
}

/**
 * Many products' cached prices and our graded sales in two database reads, instead of two or more reads per product
 * one after another (a 50-card collection was 100+ trips to the database). Fills the memory cache that getProduct
 * reads; returns the graded sales to pass to getProduct as { sales }.
 *
 * light (the sales feed, with getProduct's anyAge): each card is read once per server, without its price history
 * (most of a card's ~85 KB), and kept as an old copy so pages that need fresh prices still read the full one.
 * Re-reading full cards every 15 minutes used the database's whole monthly network allowance.
 */
const LIGHT_DATA = sql`case when jsonb_typeof(${schema.catalogCache.data}->'data') = 'array'
  then ${schema.catalogCache.data} #- '{data,0,priceHistory}' else ${schema.catalogCache.data} #- '{data,priceHistory}' end`;
export async function prefetchProducts(ids, { light = false } = {}) {
  const unique = [...new Set(ids.map(String))].filter((id) => !isMemberId(id) && !isToppsId(id));
  if (!db || !unique.length) return null;
  const now = Date.now();
  const keys = catalogLive() ? unique.flatMap((id) => [
    pptKey(`/cards/${encodeURIComponent(id)}`, PRICE_PARAMS),
    pptKey("/sealed-products", { tcgPlayerId: id, limit: "1" }),
    pptKey(`/cards/${encodeURIComponent(id)}`, { ...PRICE_PARAMS, language: "japanese" }),
  ]).filter((k) => { const h = mem.get(k); return light ? !h : !h || now - h.at >= PRICE_TTL; }) : [];
  const sales = new Map();
  try {
    const [rows, sold] = await Promise.all([
      !keys.length ? []
        : light ? db.select({ key: schema.catalogCache.key, fetchedAt: schema.catalogCache.fetchedAt, data: LIGHT_DATA, light: sql`true` })
          .from(schema.catalogCache).where(inArray(schema.catalogCache.key, keys))
          : db.select().from(schema.catalogCache).where(inArray(schema.catalogCache.key, keys)),
      db.select().from(schema.sales).where(and(inArray(schema.sales.productId, [...new Set(ids.map(String))]), eq(schema.sales.kind, "graded"),
        gte(schema.sales.soldAt, new Date(now - 90 * DAY_MS)))),
    ]);
    const found = new Map(rows.map((r) => [r.key, r]));
    for (const k of keys) {
      const r = found.get(k);
      mem.set(k, r?.light ? { at: 0, data: r.data } // "old": anyAge uses it, everything else reads the full copy
        : r ? { at: r.fetchedAt.getTime(), data: r.data, checked: now } : { at: 0, data: undefined, checked: now });
    }
    for (const s of sold) (sales.get(s.productId) || sales.set(s.productId, []).get(s.productId)).push(s);
  } catch { return null; } // fall back to one product at a time
  return sales;
}

// anyAge: use a saved copy however old (pages that only need a card's name, set and picture, like the sales feed).
async function pricedProduct(id, { cachedOnly = false, language = "english", sales, anyAge = false } = {}) {
  if (!catalogLive()) return SAMPLE.find((p) => p.id === String(id)) || null;
  // Same request (and cache entry) as the deal bot's price lookups; prices update about once a day.
  // Japanese cards are a separate catalog: the bot adds language=japanese, so we do too and share its copy.
  const japanese = language === "japanese";
  const card = await ppt(`/cards/${encodeURIComponent(id)}`, { ...PRICE_PARAMS, ...(japanese ? { language: "japanese" } : {}) }, anyAge ? Infinity : PRICE_TTL, cachedOnly);
  if (card === MISS) return undefined;
  if (card?.data) return withOurSales({ ...fromCard(Array.isArray(card.data) ? card.data[0] : card.data), ...(japanese ? { language: "japanese" } : {}) }, sales);
  if (japanese) return null;
  const sealed = await ppt("/sealed-products", { tcgPlayerId: String(id), limit: "1" }, anyAge ? Infinity : 12 * HOUR, cachedOnly);
  if (sealed === MISS) return undefined;
  const s = Array.isArray(sealed?.data) ? sealed.data[0] : sealed?.data;
  if (s) return withSealedHistory(fromSealed(s));
  // Not an English card or sealed product: Japanese cards (promos included) are a separate catalog, same IDs.
  return pricedProduct(id, { cachedOnly, language: "japanese", sales, anyAge });
}

/**
 * "Black Kyurem 020/027" -> { name: "Black Kyurem", number: "020/027" }. The number is the last word when it looks like a
 * collector number (020, 020/027, SWSH180, TG01/TG30, 239/XY-P, #4); everything before it is the name.
 */
export function splitQuery(term) {
  const words = String(term || "").trim().split(/\s+/);
  const last = words[words.length - 1] || "";
  if (words.length > 1 && /\d/.test(last) && /^#?[a-z]{0,5}-?\d+[a-z]?(\/[a-z0-9-]*)?$/i.test(last)) {
    return { name: words.slice(0, -1).join(" "), number: last.replace(/^#/, "") };
  }
  if (words.length === 1 && /^\d+\/\d+$/.test(last)) return { name: "", number: last }; // just "020/027"
  return { name: words.join(" "), number: "" };
}

const numBare = (s) => String(s || "").toUpperCase().replace(/\s|\(.*\)/g, "").replace(/^0+(?=\w)/, "");
const numHead = (s) => numBare(s).split("/")[0].replace(/^0+(?=\w)/, "");
const NAME_SKIP = new Set(["ex", "gx", "v", "the", "of"]);
const nameWords = (s) => String(s || "").toLowerCase().replace(/\(.*?\)|\s-\s.*$/g, " ").split(/[^a-z0-9']+/).filter((w) => w.length > 1 && !NAME_SKIP.has(w));

/** Edit distance between two short words (for typos like "nagandel" -> "naganadel"). */
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
/** A typed word matches a name word: the same, the start of it (still typing), or a small typo in a longer word. */
const wordMatches = (typed, word) => typed === word || word.startsWith(typed)
  || (typed.length >= 5 && editDistance(typed, word) <= (typed.length >= 8 ? 2 : 1));

// Each Pokémon -> the rest of its evolution family ("buneary" -> ["lopunny"]).
const RELATIVES = new Map();
for (const f of FAMILIES) {
  const names = f.split("|");
  for (const n of names) RELATIVES.set(n, names.filter((x) => x !== n));
}
// "&", "and" or "tag team" in a search means a TAG TEAM card ("Mega Lopunny & Jigglypuff GX"). Those words aren't
// sent to the price service (it would search them as names and return TAG TEAM tins and code cards).
const TAG_WORDS = /\s*(&|\band\b|\btag\s*team\b|\btag\b)\s*/gi;
const isTagSearch = (s) => /&|\band\b|\btag\s*team\b/i.test(s);

/**
 * How well a product matches what was typed: the number counts most (exact, then the part before the slash, then a
 * number still being typed), then how many of the name's words it has. A card with the right number but another
 * name (Eiscue 020/108 for "Black Kyurem 020") ranks below every card with the right name.
 */
// Sealed products: the abbreviations people type, and the product types that mean "sealed, not a card". The price
// service's search only matches words in order ("charizard ultra-premium" finds nothing, though "Sword & Shield
// Ultra-Premium Collection: Charizard" exists) and spells some types two ways, so a sealed search also looks up the
// type on its own and keeps the products that have the member's other words anywhere in the name.
const SEALED_ABBR = [[/\bpc\s*etb\b/gi, "pokemon center elite trainer box"], [/\betbs?\b/gi, "elite trainer box"], [/\bbbs?\b/gi, "booster box"],
  [/\bupcs?\b/gi, "ultra premium collection"], [/\bspcs?\b/gi, "super premium collection"]];
const SEALED_TYPES = ["elite trainer box", "booster box", "booster bundle", "booster pack", "sleeved booster", "ultra premium collection",
  "super premium collection", "premium collection", "collection box", "build & battle", "blister", "tin", "bundle", "booster display", "case"];
const typeSpellings = (t) => (/ultra premium|super premium/.test(t) ? [t, t.replace(/(ultra|super) premium/, "$1-premium")] : [t]);
export const expandSealed = (s) => SEALED_ABBR.reduce((t, [re, to]) => t.replace(re, to), String(s || ""));
const typeRe = (t) => new RegExp(`\\b${t}s?\\b`, "i");
const sealedTypeIn = (s) => SEALED_TYPES.find((t) => typeRe(t).test(s)) || null;

function matchScore(p, { name, number, tag }) {
  const want = nameWords(name.replace(TAG_WORDS, " "));
  const have = [...new Set(nameWords(p.name))];
  // A word matches the name directly, or through its evolution family (Buneary -> Mega Lopunny), which counts a bit less.
  const wordScore = (w) => (have.some((h) => wordMatches(w, h)) ? 1 : (RELATIVES.get(w) || []).some((r) => have.includes(r)) ? 0.8 : 0);
  const nameScore = want.length ? want.reduce((t, w) => t + wordScore(w), 0) / want.length : 0;
  const tagBonus = tag && p.type === "card" && p.name.includes("&") && nameScore > 0 ? 4 : 0;
  let numScore = 0;
  if (number && p.number) {
    if (number.includes("/") && numBare(p.number) === numBare(number)) numScore = 3;
    else if (numHead(p.number) === numHead(number)) numScore = 2;
    else if (numHead(p.number).startsWith(numHead(number))) numScore = 1; // still typing the number
  }
  return numScore * 10 * (nameScore > 0 || !want.length ? 1 : 0.05) + nameScore * 5 + tagBonus;
}

/**
 * Search cards and sealed products. Built for how people type: the card's name, then its number. English and
 * Japanese are searched together every time (Japanese cards carry English names in the catalog), and the number is
 * matched by us, so "black kyurem 020" puts Black Kyurem 020/027 first even though the price service ranks cards
 * that only share the number higher.
 *   - The name alone is searched first (cached, so typing the number reuses it).
 *   - Once the number looks complete (3+ characters, or a slash and the set total), name + number is searched too,
 *     and a full "020/027" is also searched on its own (it's usually unique).
 * Language words ("japanese", "jp", "english") pick the catalog instead of being searched as part of the name.
 */
export async function searchProducts(q) {
  const raw = String(q || "").trim().slice(0, 80);
  const wantsJapanese = /\b(japanese|japan|jp|jpn)\b/i.test(raw);
  const wantsEnglish = /\b(english|eng)\b/i.test(raw);
  const term = expandSealed(spellVariants(raw.replace(/\b(japanese|japan|jp|jpn|english|eng)\b/gi, " "))).replace(/\s+/g, " ").trim();
  if (term.length < 2) return [];
  // Named a sealed product type ("surging sparks etb", "151 booster box"): sealed only, and a number like 151 is part
  // of the name, not a card number.
  const sealedType = wantsJapanese ? null : sealedTypeIn(term);
  if (sealedType && catalogLive()) {
    const found = await searchSealed(term, sealedType);
    if (found.length) return found; // nothing sealed by that name: the usual search below (cards and sealed)
  }
  const tag = isTagSearch(term);
  const parsed = { ...splitQuery(term), tag };
  if (!catalogLive()) {
    const words = parsed.name.toLowerCase().split(/\s+/).filter(Boolean);
    return SAMPLE.filter((p) => words.every((w) => `${p.name} ${p.setName} ${p.number || ""}`.toLowerCase().includes(w)))
      .map((p, i) => ({ p, i, s: matchScore(p, parsed) })).sort((x, y) => y.s - x.s || x.i - y.i).map((x) => x.p).slice(0, 10);
  }
  // TAG TEAM searches: the tag words aren't searched as names (see TAG_WORDS).
  const name = tag ? parsed.name.replace(TAG_WORDS, " ").replace(/\s+/g, " ").trim() : parsed.name;
  const { number } = parsed;
  const complete = number && (number.includes("/") ? /\/[a-z0-9-]{2,}$/i.test(number) : number.replace(/\D/g, "").length >= 3 || /[a-z]/i.test(number));
  const week = 7 * 24 * HOUR;
  const en = !wantsJapanese, jp = !wantsEnglish;
  const cards = (search, limit, language) => ppt("/cards", { search: search.slice(0, 80), limit: String(limit), ...(language ? { language } : {}) }, week)
    .then((j) => (j?.data || []).map((c) => ({ ...fromCard(c), ...(language ? { language } : {}) }))).catch(() => []);
  const lookups = [];
  if (name.length >= 2) {
    if (en) lookups.push(cards(name, 8));
    if (jp) lookups.push(cards(name, 8, "japanese"));
    if (en && !number) lookups.push(ppt("/sealed-products", { search: name, limit: "5" }, week).then((j) => (j?.data || []).map(fromSealed)).catch(() => []));
  }
  if (complete && name.length >= 2) {
    if (en) lookups.push(cards(`${name} ${number}`, 8));
    if (jp) lookups.push(cards(`${name} ${number}`, 8, "japanese"));
  }
  // TAG TEAM cards are always "… & … GX", and a Pokémon is often in one as its evolution (Buneary -> Mega Lopunny &
  // Jigglypuff GX), so a TAG TEAM search also looks up "<name> gx" and "<relative> gx" for the first relatives.
  if (tag && name.length >= 2) {
    const typed = nameWords(name);
    const extra = [...new Set(typed.flatMap((w) => [w, ...(RELATIVES.get(w) || []).slice(0, 3)]))].slice(0, 4);
    for (const n of extra) {
      if (en) lookups.push(cards(`${n} gx`, 8));
      if (jp) lookups.push(cards(`${n} gx`, 8, "japanese"));
    }
  }
  if (complete && number.includes("/")) {
    if (en) lookups.push(cards(number, 5));
    if (jp) lookups.push(cards(number, 5, "japanese"));
  }
  const first = (await Promise.all(lookups)).flat();
  // The service only finds a number when it's part of a product's name, so "eevee 074" finds the Pokémon Day promo
  // "Eevee - 074/131" but not Prismatic Evolutions' Eevee 074/131 and its Poke Ball and Master Ball patterns. When a
  // result shows the full number ("074/131"), search name + that full number too: that finds every version.
  if (complete && !number.includes("/") && name.length >= 2) {
    const head = (n) => String(n || "").toUpperCase().split("/")[0].replace(/^0+(?=\w)/, "");
    const fulls = [...new Set(first.filter((p) => String(p.number || "").includes("/") && head(p.number) === head(number)).map((p) => p.number))].slice(0, 2);
    const more = [];
    for (const full of fulls) {
      if (en) more.push(cards(`${name} ${full}`, 8));
      if (jp) more.push(cards(`${name} ${full}`, 8, "japanese"));
    }
    first.push(...(await Promise.all(more)).flat());
  }
  const seen = new Set();
  const all = first.filter((p) => {
    const k = `${p.id}:${p.language || "english"}`;
    return seen.has(k) ? false : seen.add(k);
  });
  // Best match first. Equal matches alternate English and Japanese (each in the service's order), so both
  // languages show on the first page instead of every English result coming first.
  const pos = { english: 0, japanese: 0 };
  return all.map((p) => {
    const lang = p.language === "japanese" ? "japanese" : "english";
    return { p, s: matchScore(p, parsed), at: pos[lang]++, jp: lang === "japanese" ? 1 : 0 };
  }).sort((x, y) => y.s - x.s || x.at - y.at || x.jp - y.jp).map((x) => x.p).slice(0, 24);
}

/** Sealed products for a search that names a product type: the whole search, plus the type alone filtered by the rest. */
async function searchSealed(term, type) {
  const week = 7 * 24 * HOUR;
  const sealed = (search, limit) => ppt("/sealed-products", { search: search.slice(0, 80), limit: String(limit) }, week)
    .then((j) => (j?.data || []).map(fromSealed)).catch(() => []);
  const rest = nameWords(term.replace(typeRe(type), " "));
  const lookups = [sealed(term, 10)];
  if (rest.length) for (const t of typeSpellings(type)) lookups.push(sealed(t, 50));
  const seen = new Set();
  const found = (await Promise.all(lookups)).flat().filter((p) => (seen.has(p.id) ? false : seen.add(p.id)));
  const has = (p) => {
    const w = nameWords(`${p.name} ${p.setName || ""}`.replace(/-/g, " "));
    return rest.every((r) => w.some((x) => wordMatches(r, x)));
  };
  return found.filter((p) => !rest.length || has(p))
    // A case (several boxes) comes after the box itself, unless the member asked for a case; then the service's order.
    .map((p, i) => ({ p, s: /\bcase\b/i.test(p.name) && !/\bcase\b/i.test(term) ? 0 : 1, i }))
    .sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.p).slice(0, 24);
}

/** One-word spellings of pattern variants, as TCGplayer names them: "masterball" -> "master ball". */
export const spellVariants = (s) => String(s || "").replace(/\bmaster\s*ball\b/gi, "master ball").replace(/\bpok[eé]\s*ball\b/gi, "poke ball");

/**
 * One card from what's printed on it (photo appraiser, imports, card requests): small searches by name and number
 * (cached a week), trying the full number first ("Black Kyurem 020/027"), then the number before the slash, then the
 * name alone. A result only counts if its name shares a word with the card's and, when a number was read, its number
 * matches. Never "the closest result": no match returns null, so a wrong card is never added.
 * Several products can share a name and number (Eevee 074/131 is a Prismatic Evolutions card, its Poke Ball and
 * Master Ball patterns, and a Pokémon Day promo), so when we know the set or the variant they decide: a variant
 * ("Master Ball Pattern") must be in the product's name, the same set wins, and with no variant the plain card wins.
 */
export async function findCard(args) {
  return (await cardMatches(args, false))[0] || null;
}

/**
 * Every version that fits what was read (best first, up to `max`): the photo appraiser shows them all when there's
 * more than one (Centiskorch VMAX is a regular, a full art and a rainbow rare) and lets the member pick.
 */
export async function findCardOptions(args, max = 8) {
  return (await cardMatches(args, true)).slice(0, max);
}

async function cardMatches({ name, number, language = "english", setName = "", variant = "" }, all) {
  if (!catalogLive()) {
    const n = String(name || "").toLowerCase();
    return SAMPLE.filter((p) => p.type === "card" && p.name.toLowerCase().includes(n) && (!number || p.number === number));
  }
  const japanese = language === "japanese";
  const num = String(number || "").trim().replace(/\s+/g, "");
  // Printed symbols the catalog spells out: Gold Star "☆" is "Star"; the δ (Delta Species) mark isn't in names.
  const printed = String(name || "").replace(/\s*\(.*\)$/, "").replace(/[☆★]/g, " Star").replace(/δ/g, "").replace(/\s+/g, " ").trim();
  if (printed.length < 2) return [];
  const bare = (s) => String(s || "").toUpperCase().replace(/\s/g, "").replace(/^0+(?=\w)/, "");
  const head = (s) => bare(s).split("/")[0].replace(/^0+(?=\w)/, "");
  const SUFFIX = new Set(["ex", "gx", "v", "vmax", "vstar", "lv", "x", "break", "prime", "star", "the", "of"]);
  const words = (s) => String(s || "").toLowerCase().replace(/\(.*?\)|-\s*[\w/]+$/g, " ").split(/[^a-z0-9']+/).filter((w) => w.length > 1 && !SUFFIX.has(w));
  const want = new Set(words(printed));
  const sameName = (p) => want.size > 0 && words(p.name).some((w) => want.has(w));
  // No usable name (e.g. read in Japanese script): only the exact full number (with the set total) counts.
  const numberOk = (p) => (sameName(p) || (!want.size && num.includes("/"))) && num && bare(p.number) === bare(num)
    || (sameName(p) && num && head(p.number) === head(num)) || (!num && sameName(p));
  const GENERIC = new Set(["pattern", "holo", "holofoil", "foil", "version", "edition", "card", "the", "of", "sv", "swsh", "sm", "xy", "set", "series"]);
  const plainWords = (s) => normalizeWords(spellVariants(s)).filter((w) => !GENERIC.has(w));
  const wantVariant = plainWords(variant);
  const setWords = new Set(plainWords(setName));
  const hasVariant = (p) => /\(.+\)/.test(p.name) || / - [\w/]+/.test(p.name);
  const variantOk = (p) => !wantVariant.length || wantVariant.every((w) => plainWords(p.name).includes(w));
  const sameSet = (p) => setWords.size > 0 && plainWords(p.setName).some((w) => setWords.has(w));
  // Higher is better: the right set, then the plain card when no variant was asked for, then the exact full number.
  const score = (p) => (sameSet(p) ? 4 : 0) + (!wantVariant.length && !hasVariant(p) ? 2 : 0) + (num && (bare(p.number) === bare(num) || (!num.includes("/") && head(p.number) === head(num))) ? 1 : 0);
  const best = (setWords.size ? 4 : 0) + (wantVariant.length ? 0 : 2) + (num ? 1 : 0);

  const tries = [...new Set([wantVariant.length && num && `${printed} ${wantVariant.join(" ")} ${num}`, num && `${printed} ${num}`,
    num.includes("/") && `${printed} ${num.split("/")[0]}`, printed].filter(Boolean))];
  const found = [];
  for (let i = 0; i < tries.length && i < 5; i++) {
    const j = await ppt("/cards", { search: tries[i].slice(0, 80), limit: all ? "10" : "5", ...(japanese ? { language: "japanese" } : {}) }, 7 * 24 * HOUR);
    const list = (j?.data || []).map((c) => ({ ...fromCard(c), ...(japanese ? { language: "japanese" } : {}) }));
    for (const p of list) if (!found.some((x) => x.id === p.id) && numberOk(p) && variantOk(p)) found.push(p);
    // A number read without its set total: a result showing the full number ("074/131") leads to every version.
    if (num && !num.includes("/")) {
      for (const p of list) {
        const t = `${printed} ${p.number}`;
        if (String(p.number || "").includes("/") && head(p.number) === head(num) && sameName(p) && !tries.includes(t)) tries.splice(i + 1, 0, t);
      }
    }
    const top = [...found].sort((a, b) => score(b) - score(a))[0];
    if (!all && top && score(top) >= best) return [top]; // findCard: the exact card, stop searching
  }
  return [...found].sort((a, b) => score(b) - score(a));
}

const normalizeWords = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 1);

// The set list's card counts can be off by one from the cards a set actually has, so once a set's cards have been
// loaded we remember that count and show it everywhere (set list, "Your sets", the set page).
const SET_COUNTS = "set_card_counts";
let setCounts = globalThis.__tcgSetCounts ?? null;
async function loadedCounts() {
  if (setCounts || !db) return setCounts || {};
  const [row] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, SET_COUNTS)).limit(1).catch(() => []);
  setCounts = globalThis.__tcgSetCounts = row?.value || {};
  return setCounts;
}
async function rememberCount(name, n) {
  const counts = await loadedCounts();
  if (!db || !n || counts[name] === n) return;
  counts[name] = n;
  await db.insert(schema.appSettings).values({ key: SET_COUNTS, value: counts })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: counts, updatedAt: new Date() } }).catch(() => {});
}

/** Every English set, newest first. The list rarely changes, so it's cached for a week. */
export async function listSets() {
  if (!catalogLive()) return SAMPLE_SETS.map((s) => ({ ...s, total: sampleCards[s.name].length }));
  const [j, counts] = await Promise.all([ppt("/sets", { sortBy: "releaseDate", sortOrder: "desc", limit: "500" }, 7 * 24 * HOUR), loadedCounts()]);
  return (j?.data || []).map((s) => ({
    id: String(s.id ?? s.tcgPlayerId ?? s.name), name: s.name, series: s.series || null, releaseDate: s.releaseDate || null,
    printedTotal: s.printedTotal ?? s.cardCount ?? null, total: counts[s.name] || (s.totalCards ?? s.cardCount ?? null),
    image: s.imageCdnUrl || s.logoUrl || s.image || null,
  }));
}

/** Every card in a set, with prices (no history). Costs one credit per card, so it's cached for 3 days and shared. */
export async function getSetCards(setName) {
  if (!catalogLive()) return SAMPLE.filter((p) => p.type === "card" && p.setName === setName);
  const j = await ppt("/cards", { set: setName, fetchAllInSet: "true" }, 3 * 24 * HOUR);
  const cards = (j?.data || []).map(fromCard);
  void rememberCount(setName, cards.length);
  return cards;
}

/** A set's sealed products (booster boxes, ETBs, tins...), priced. Up to 50, cached 3 days and shared (50 credits). */
export async function getSetSealed(setName) {
  if (!catalogLive()) return SAMPLE.filter((p) => p.type === "sealed" && p.setName === setName);
  const j = await ppt("/sealed-products", { set: setName, limit: "50" }, 3 * 24 * HOUR);
  return (j?.data || []).map(fromSealed).sort((a, b) => (b.prices.market ?? 0) - (a.prices.market ?? 0));
}

export const sampleIds = () => SAMPLE.map((p) => p.id);

/** Preview catalog only: every sample card (the live catalog is far too big to list without a search). */
export const allSampleCards = () => (catalogLive() ? [] : SAMPLE.filter((p) => p.type === "card"));
