import "server-only";
import { eq, inArray, like, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { log } from "@/lib/log";

// Card games priced from TCGCSV (tcgcsv.com): free daily copies of TCGplayer's prices, one category per game. Not the
// Pokémon price service, so no credits. Each game (lib/swu.js, lib/lorcana.js) is this engine with its own settings:
//
// - Products are TCGplayer products, IDs "<prefix><productId>" ("swu-565465", "lcr-649230"). Special versions are
//   their own products (Star Wars' Hyperspace and Showcase, Lorcana's Enchanted and Epic); Normal, Foil, Cold Foil and
//   Holofoil are a product's printings.
// - Prices are Near Mint market prices only (TCGCSV has no other conditions). History is our own: one point a day.
// - The import (refresh, from the price-alert cron) runs once a day after TCGCSV updates (~20:00 UTC) and saves
//   everything to swu_product (one table for every game, told apart by the ID prefix); pages read a copy held in
//   memory (no history), reloaded when a new import lands.
// - Without a database (the local demo) the catalog is read straight from TCGCSV and kept in memory.
// TCGCSV's rules: a custom User-Agent, ~100 ms between requests, under 10,000 requests a day, server side only.

const UA = process.env.TCGCSV_USER_AGENT || "card-collection-sync/1.0";
const HISTORY_DAYS = 400;
const CHECK_MS = 10 * 60 * 1000;
const DEMO_MS = 12 * 3600 * 1000;
const HISTORY_TTL = 3600 * 1000;

const r2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bigImage = (url) => (url ? String(url).replace(/_200w\.jpg$/, "_in_400x400.jpg") : null);
const ext = (p, name) => (p.extendedData || []).find((e) => e.name === name)?.value ?? null;
const words = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// The game's catalog in memory, shared across hot reloads: g[`__<key>Catalog`].
const g = globalThis;

/**
 * One TCGCSV game.
 * cfg: { key, category, prefix, series (the game's name), short ("Star Wars"), setPrefix ("Star Wars: "),
 *        foils (foil printings, best first), facts(ext) -> card facts, asks (RegExp: a search asks for this game),
 *        stop (search words to ignore), label (log name) }
 */
export function makeTcgcsvGame(cfg) {
  const BASE = `https://tcgcsv.com/tcgplayer/${cfg.category}`;
  const SETS_KEY = `${cfg.key}_sets`;
  const IMPORT_KEY = `${cfg.key}_import`;
  const MEM = `__${cfg.key}Catalog`;
  const LOADING = `__${cfg.key}Loading`;
  const PREFIX = cfg.prefix;
  const ID_RE = new RegExp(`^${PREFIX}\\d+$`);
  const isId = (id) => ID_RE.test(String(id));
  const PRINTINGS = ["Normal", ...cfg.foils];
  const STOP = new Set([...(cfg.stop || []), "card", "the", "of"]);
  const T = schema.swuProducts;

  async function get(path) {
    const r = await fetch(`${BASE}${path}`, { headers: { "User-Agent": UA }, cache: "no-store" });
    if (!r.ok) throw new Error(`TCGCSV ${path}: HTTP ${r.status}`);
    const j = await r.json();
    return j.results || [];
  }

  const factsOf = (p) => {
    const f = cfg.facts((name) => ext(p, name));
    return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== null && v !== undefined && v !== ""));
  };

  /** One TCGCSV group as our set. */
  function toSet(grp, products) {
    const cards = products.filter((p) => p.type === "card").length;
    // The set's picture: its booster pack (else its booster box or any sealed product), as TCGplayer shows it.
    const sealed = products.filter((p) => p.type === "sealed" && p.image);
    const art = sealed.find((p) => /booster pack$/i.test(p.name)) || sealed.find((p) => /booster (display|box)$/i.test(p.name)) || sealed[0] || null;
    return {
      id: String(grp.groupId), groupId: grp.groupId, name: `${cfg.setPrefix}${grp.name}`, code: grp.abbreviation || null, series: cfg.series,
      releaseDate: grp.publishedOn ? String(grp.publishedOn).slice(0, 10) : null, total: cards, printedTotal: cards,
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

  /** Every set and product of the game from TCGCSV: { sets, rows }. Two requests a set, 100+ ms apart. */
  async function fetchAll() {
    const groups = await get("/groups");
    const sets = [];
    const rows = [];
    for (const grp of groups) {
      await sleep(150);
      const products = await get(`/${grp.groupId}/products`);
      await sleep(150);
      const prices = await get(`/${grp.groupId}/prices`).catch(() => []); // a brand-new set can have no prices yet
      const mine = toRows(products, prices);
      sets.push(toSet(grp, mine));
      rows.push(...mine);
    }
    sets.sort((a, b) => String(b.releaseDate || "").localeCompare(String(a.releaseDate || "")));
    return { sets, rows };
  }

  // The day's point: Normal's market price, and the best foil printing's.
  const pointOf = (prices, date) => {
    const foil = cfg.foils.map((k) => prices[k]?.market).find((v) => v != null) ?? null;
    return { date, normal: prices.Normal?.market ?? null, foil };
  };

  // ---------- the daily import ----------
  const HISTORY_SQL = (today) => sql`(SELECT coalesce(jsonb_agg(x ORDER BY n), '[]'::jsonb) FROM (
      SELECT x, n FROM jsonb_array_elements(
        (SELECT coalesce(jsonb_agg(y ORDER BY m), '[]'::jsonb) FROM jsonb_array_elements(coalesce(swu_product.history, '[]'::jsonb))
          WITH ORDINALITY AS o(y, m) WHERE y->>'date' <> ${today}) || excluded.history
      ) WITH ORDINALITY AS h(x, n) ORDER BY n DESC LIMIT ${sql.raw(String(HISTORY_DAYS))}) last)`;

  /**
   * Copy today's prices into swu_product, once a day after TCGCSV updates (around 20:00 UTC). Called every cron run;
   * returns quickly when there's nothing new. force: run now whatever the time.
   */
  async function refresh({ force = false } = {}) {
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
        const point = pointOf(r.prices, today);
        return { ...r, history: point.normal != null || point.foil != null ? [point] : [], updatedAt: now };
      });
      await db.insert(T).values(batch).onConflictDoUpdate({
        target: T.productId,
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
    void log("prices", "info", `${cfg.series} prices imported: ${rows.length} products in ${sets.length} sets (${secs}s)`);
    return { products: rows.length, sets: sets.length, seconds: secs };
  }

  // ---------- the copy in memory ----------
  // { sets, byId: Map(productId -> row without history), stamp, checkedAt }.
  async function load() {
    const mem = g[MEM];
    if (mem && Date.now() - mem.checkedAt < (db ? CHECK_MS : DEMO_MS)) return mem;
    if (g[LOADING]) return g[LOADING];
    g[LOADING] = (async () => {
      try {
        if (!db) {
          const { sets, rows } = await fetchAll();
          return (g[MEM] = { sets, byId: new Map(rows.map((r) => [r.productId, r])), stamp: "demo", checkedAt: Date.now() });
        }
        // Only reread the products when a new import has landed since the last read.
        const [imp] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, IMPORT_KEY)).limit(1);
        const stamp = imp?.value?.at || null;
        if (mem && mem.stamp === stamp) return (g[MEM] = { ...mem, checkedAt: Date.now() });
        if (!stamp) return (g[MEM] = { sets: [], byId: new Map(), stamp: null, checkedAt: Date.now() });
        const [setRow] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, SETS_KEY)).limit(1);
        const rows = await db.select({ // everything but the history (most of a row), this game's rows only
          productId: T.productId, groupId: T.groupId, type: T.type, name: T.name, number: T.number,
          rarity: T.rarity, image: T.image, url: T.url, facts: T.facts, prices: T.prices,
        }).from(T).where(like(T.productId, `${PREFIX}%`));
        return (g[MEM] = { sets: setRow?.value || [], byId: new Map(rows.map((r) => [r.productId, r])), stamp, checkedAt: Date.now() });
      } catch (e) {
        // TCGCSV or the database is down: keep what we had.
        if (!mem) console.error(`[${cfg.key}] catalog didn't load:`, e.message);
        return (g[MEM] = mem ? { ...mem, checkedAt: Date.now() - CHECK_MS + 60000 } : { sets: [], byId: new Map(), stamp: null, checkedAt: Date.now() - CHECK_MS + 60000 });
      } finally {
        g[LOADING] = null;
      }
    })();
    return g[LOADING];
  }

  // Saved price histories, read in one go for a page's products (prefetch) or one at a time.
  const histories = new Map(); // productId -> { at, points }
  async function prefetch(ids) {
    const want = [...new Set(ids.map(String))].filter((id) => isId(id) && !(Date.now() - (histories.get(id)?.at || 0) < HISTORY_TTL));
    if (!db || !want.length) return;
    try {
      const rows = await db.select({ productId: T.productId, history: T.history }).from(T).where(inArray(T.productId, want));
      const found = new Map(rows.map((r) => [r.productId, r.history || []]));
      for (const id of want) histories.set(id, { at: Date.now(), points: found.get(id) || [] });
      if (histories.size > 20000) histories.clear();
    } catch { /* no history: the card still shows today's price */ }
  }
  async function historyOf(id) {
    if (!histories.has(id) || Date.now() - histories.get(id).at >= HISTORY_TTL) await prefetch([id]);
    return histories.get(id)?.points || [];
  }

  // ---------- products ----------
  const setOf = (cat, groupId) => cat.sets.find((s) => s.groupId === groupId) || null;

  /** A swu_product row as a catalog product, in the same shape as lib/catalog.js's. */
  function toProduct(cat, r, points = []) {
    const set = setOf(cat, r.groupId);
    const base = {
      id: r.productId, type: r.type, name: r.name, setName: set?.name || cfg.setPrefix.replace(/:\s*$/, ""), setId: String(r.groupId),
      number: r.number || null, rarity: r.rarity || null, language: "english", image: r.image || null, tcgplayerUrl: r.url,
      graded: {}, recentSales: [],
      // Which game (any TCGCSV game), and its own facts under its key (p.swu, p.lorcana).
      tcg: { game: cfg.key, series: cfg.series, short: cfg.short },
      [cfg.key]: { code: set?.code || null, ...(r.facts || {}) },
    };
    // The printing with a Near Mint price goes first (Hyperspace Foil, Enchanted and Epic cards only come in a foil).
    const printings = [...PRINTINGS, ...Object.keys(r.prices || {})].filter((k, i, a) => a.indexOf(k) === i && r.prices?.[k]);
    const lead = printings.find((k) => r.prices[k].market != null) || printings[0] || null;
    const key = cfg.foils.includes(lead) ? "foil" : "normal";
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

  /** One product by ID ("swu-565465"), with its price history, or null. */
  async function product(id) {
    const cat = await load();
    const r = cat.byId.get(String(id));
    return r ? toProduct(cat, r, await historyOf(r.productId)) : null;
  }

  /** Every set, newest first, in listSets()'s shape (series = the game's name). */
  const sets = async () => (await load()).sets;
  async function setByName(name) {
    if (!String(name || "").startsWith(cfg.setPrefix)) return null;
    return (await load()).sets.find((s) => s.name === name) || null;
  }

  /** Every card in a set (no history), or null for an unknown set. sealed: its sealed products instead. */
  async function setCards(name, { sealed = false } = {}) {
    const cat = await load();
    const set = cat.sets.find((s) => s.name === name);
    if (!set) return null;
    const out = [];
    for (const r of cat.byId.values()) if (r.groupId === set.groupId && (r.type === "sealed") === sealed) out.push(toProduct(cat, r));
    return out;
  }

  /** Does a search ask for this game's cards? */
  const asks = (q) => cfg.asks.test(String(q || ""));

  /**
   * Products whose name, set, set code or number contain every search word ("vader", "elsa enchanted", "sor 10").
   * Exact name starts first, then priciest.
   */
  async function search(q, limit = 8) {
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
    const price = (r) => PRINTINGS.map((k) => r.prices?.[k]?.market).find((v) => v != null) ?? 0;
    hits.sort((a, b) => Number(words(b.name).startsWith(first)) - Number(words(a.name).startsWith(first)) || price(b) - price(a));
    return hits.slice(0, limit).map((r) => toProduct(cat, r));
  }

  /** Admin → Status: when the last import ran and how big it was. */
  async function importStatus() {
    if (!db) return null;
    const [row] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, IMPORT_KEY)).limit(1).catch(() => []);
    return row?.value || null;
  }

  return { key: cfg.key, series: cfg.series, short: cfg.short, setPrefix: cfg.setPrefix, isId, refresh, prefetch, product, sets, setByName, setCards, asks, search, importStatus };
}
