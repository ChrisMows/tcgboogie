import "server-only";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import DATA from "@/lib/data/topps.json";

// Topps Pokémon cards (1999-2004: the TV Animation series, the movie sets, Chrome, Johto and Advanced). They aren't
// Pokémon TCG cards, so the price service doesn't carry them: the checklist ships with the code (lib/data/topps.json,
// from Bulbapedia's set pages) and the deal bot finds each card's typical eBay asking price every few days
// (topps_price). Asking prices, not sold prices: eBay doesn't share sold prices with apps like ours. Values cover
// raw Near Mint copies only; graded copies keep the member's own value.

const SETS = DATA.sets.map((s) => ({ ...s, printing: /chrome/i.test(s.name) ? "Chrome" : "Normal" }));
const SET_BY_CODE = Object.fromEntries(SETS.map((s) => [s.code, s]));
const CARDS = DATA.cards.map(([id, code, number, name, section]) => ({ id, code, number, name, section }));
const BY_ID = new Map(CARDS.map((c) => [c.id, c]));

export const isToppsId = (id) => /^t-[a-z0-9]+-[a-z0-9]+$/.test(String(id)) && BY_ID.has(String(id));
export const toppsSets = () => SETS.map((s) => ({ ...s, cards: CARDS.filter((c) => c.code === s.code).length }));
export const toppsSetByName = (name) => SETS.find((s) => s.name === name) || null;

const words = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const SEARCH_TEXT = new Map(CARDS.map((c) => [c.id, ` ${words(`${c.name} ${SET_BY_CODE[c.code].name} topps ${c.number} #${c.number} ${c.section}`)} `]));

/** A checklist card and its eBay price row (or none yet) as a catalog product, in the same shape as lib/catalog.js. */
function toProduct(c, row) {
  const set = SET_BY_CODE[c.code];
  const query = `Topps Pokemon ${c.name} ${c.number} ${set.name.replace(/^Topps\s+/, "")}`;
  return {
    id: c.id, type: "card", name: c.name, setName: set.name, setId: null, number: c.number, rarity: c.section, language: "english",
    image: row?.image || null,
    tcgplayerUrl: `https://www.ebay.com/sch/i.html?${new URLSearchParams({ _nkw: query })}`,
    prices: row?.price ? { [set.printing]: { "Near Mint": { market: row.price, low: row.low ?? null } } } : {},
    graded: {}, recentSales: [],
    history: (row?.history || []).filter((h) => Number.isFinite(h?.price)),
    topps: { year: set.year, listings: row?.listings || 0, low: row?.low ?? null, high: row?.high ?? null, checkedAt: row?.checkedAt ? String(row.checkedAt) : null, query },
  };
}

async function priceRows(ids) {
  if (!db || !ids.length) return new Map();
  try {
    const rows = await db.select().from(schema.toppsPrices).where(inArray(schema.toppsPrices.productId, ids));
    return new Map(rows.map((r) => [r.productId, r]));
  } catch { return new Map(); } // table not there yet (before db:push) or the database is down: no prices
}

/** One Topps card by ID, or null. */
export async function toppsCard(id) {
  const c = BY_ID.get(String(id));
  if (!c) return null;
  return toProduct(c, (await priceRows([c.id])).get(c.id));
}

/**
 * Topps cards whose name, set, number or section contain every search word ("topps charizard", "chrome mew",
 * "tv5 misty"). Cards from the set the search names come first, then by set order and number.
 */
export async function searchTopps(q, limit = 8) {
  const ws = words(q).split(" ").filter((w) => w.length > 1 || /\d/.test(w)).filter((w) => w !== "pokemon");
  if (!ws.length) return [];
  const hits = CARDS.filter((c) => ws.every((w) => SEARCH_TEXT.get(c.id).includes(` ${w}`))).slice(0, limit);
  const rows = await priceRows(hits.map((c) => c.id));
  return hits.map((c) => toProduct(c, rows.get(c.id)));
}

/** Should a search show Topps cards? When it asks for them, or when the regular catalog found little. */
export const asksForTopps = (q) => /\b(topps|tv animation|chrome|johto league|advanced challenge)\b/i.test(String(q || ""));

/** Every card in a Topps set, priced, for the set page. */
export async function toppsSetCards(name) {
  const set = toppsSetByName(name);
  if (!set) return null;
  const cards = CARDS.filter((c) => c.code === set.code);
  const rows = await priceRows(cards.map((c) => c.id));
  return cards.map((c) => toProduct(c, rows.get(c.id)));
}
