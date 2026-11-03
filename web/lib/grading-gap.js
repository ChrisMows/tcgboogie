import "server-only";
import { eq, sql } from "drizzle-orm";
import { allSampleCards, fromCard, gradedReliable } from "@/lib/catalog";
import { db, schema } from "@/lib/db";
import { GRADING_COMPANIES, gradingMath } from "@/lib/grading";

// Grading finder (Premium): cards anywhere in the catalog, not just the member's own, whose raw Near Mint price is far
// under what the same card sells for graded. Built only from price-service answers we already saved (catalog_cache:
// cards members own, watch or have opened), so it costs no lookups. Those answers are ~85 KB each, so the cron job
// copies the few numbers the finder needs into grading_gap (a few hundred bytes a card) as they're refreshed, and the
// finder searches that. The maths is Worth Grading's (lib/grading.js).

const { gradingGap, catalogCache, appSettings } = schema;
const WATERMARK = "grading_gap_watermark"; // fetched_at of the last saved answer copied in
const BATCH = 500;
const keyOf = (grader, grade) => `${grader.toLowerCase()}${grade.replace(".", "_")}`;
// The grades the finder uses (each grader's top grade and the one below): the only ones copied out.
const GRADE_KEYS = Object.entries(GRADING_COMPANIES).flatMap(([g, co]) => [keyOf(g, co.top), keyOf(g, co.next)]);
const GRADE_LIST = sql.raw(`any(array[${GRADE_KEYS.map((k) => `'${k}'`).join(",")}])`); // fixed keys, not request data

/**
 * Copy newly saved card answers into grading_gap. Run by the cron job: a few batches a run, oldest first, so the first
 * run fills the table over a couple of runs and later runs only touch the cards the bot refreshed since.
 * Only the parts we use leave the database (a few KB a card): the prices, and for each grader's top two grades the sale
 * price, all-time count, last sale and how many sales the last 90 days had (the card page's reliability rule, lib/catalog.js gradedReliable).
 */
export async function refreshGradingGaps({ batches = 8 } = {}) {
  if (!db) return { copied: 0 };
  const [mark] = await db.select().from(appSettings).where(eq(appSettings.key, WATERMARK)).limit(1);
  let after = mark?.value?.at ? new Date(mark.value.at) : new Date(0);
  let copied = 0, seen = 0;
  for (let b = 0; b < batches; b++) {
    const since = sql`to_char(now() - interval '90 days', 'YYYY-MM-DD')`;
    const { rows } = await db.execute(sql`
      select key, fetched_at, jsonb_build_object(
        'tcgPlayerId', d->'tcgPlayerId', 'name', d->'name', 'setName', d->'setName', 'cardNumber', d->'cardNumber',
        'imageCdnUrl400', d->'imageCdnUrl400', 'imageCdnUrl200', d->'imageCdnUrl200', 'imageCdnUrl', d->'imageCdnUrl',
        'prices', jsonb_build_object('primaryPrinting', d->'prices'->'primaryPrinting', 'market', d->'prices'->'market',
          'low', d->'prices'->'low', 'variants', d->'prices'->'variants'),
        'sales', (select jsonb_object_agg(g.key, jsonb_build_object(
                    'smartMarketPrice', jsonb_build_object('price', g.value->'smartMarketPrice'->'price', 'confidence', g.value->'smartMarketPrice'->'confidence'),
                    'averagePrice', g.value->'averagePrice', 'medianPrice', g.value->'medianPrice', 'count', g.value->'count',
                    'totalSales', g.value->'totalSales', 'lastSaleDate', g.value->'lastSaleDate'))
                  from jsonb_each(case when jsonb_typeof(d->'ebay'->'salesByGrade') = 'object' then d->'ebay'->'salesByGrade' else '{}'::jsonb end) g
                  where g.key = ${GRADE_LIST}),
        'outliers', d->'ebay'->'smartPriceOutlierByGrade',
        'recent', (select jsonb_object_agg(g.key, (select coalesce(sum(coalesce((x.value->>'count')::int, 1)), 0)
                     from jsonb_each(case when jsonb_typeof(g.value) = 'object' then g.value else '{}'::jsonb end) x
                     where left(x.key, 10) >= ${since}))
                   from jsonb_each(case when jsonb_typeof(d->'ebay'->'priceHistory') = 'object' then d->'ebay'->'priceHistory' else '{}'::jsonb end) g
                   where g.key = ${GRADE_LIST})
      ) as card
      from ${catalogCache}, lateral (select ${catalogCache.data}->'data' as d) s
      where ${catalogCache.key} ~ '/cards/[0-9]+[?]' and jsonb_typeof(d) = 'object' and ${catalogCache.fetchedAt} > ${after}
      order by ${catalogCache.fetchedAt} limit ${BATCH}`);
    if (!rows.length) break;
    seen += rows.length;
    const values = rows.map(toRow).filter(Boolean);
    if (values.length) {
      await db.insert(gradingGap).values(values).onConflictDoUpdate({
        target: [gradingGap.productId, gradingGap.language],
        set: { name: sql`excluded.name`, setName: sql`excluded.set_name`, number: sql`excluded.number`, image: sql`excluded.image`,
          printing: sql`excluded.printing`, raw: sql`excluded.raw`, graded: sql`excluded.graded`, sourceAt: sql`excluded.source_at`, updatedAt: new Date() },
      });
      copied += values.length;
    }
    after = new Date(rows[rows.length - 1].fetched_at);
    await db.insert(appSettings).values({ key: WATERMARK, value: { at: after.toISOString() } })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: { at: after.toISOString() }, updatedAt: new Date() } });
    if (rows.length < BATCH) break;
  }
  return { seen, copied };
}

/** One saved answer -> a grading_gap row, or null when it has no Near Mint price or no graded sales. */
function toRow({ key, fetched_at: fetchedAt, card: c }) {
  const productId = key.match(/\/cards\/(\d+)\?/)?.[1];
  if (!productId || !c?.tcgPlayerId) return null;
  const p = fromCard({ ...c, ebay: null }); // the card page's raw price rules: main printing first, Near Mint
  const printing = Object.keys(p.prices)[0];
  const raw = p.prices[printing]?.["Near Mint"]?.market;
  if (!raw) return null;
  const graded = {};
  for (const [g, s] of Object.entries(c.sales || {})) {
    if (c.outliers?.[g]) continue; // flagged as unreliable by the service
    const price = s?.smartMarketPrice?.price ?? s?.averagePrice ?? s?.medianPrice ?? null;
    if (!price) continue;
    const sales = c.recent?.[g] !== undefined ? c.recent[g] : s?.count ?? s?.totalSales ?? null;
    const lastSale = s?.lastSaleDate ? String(s.lastSaleDate).slice(0, 10) : null;
    graded[g] = { p: Math.round(price * 100) / 100, n: sales, r: gradedReliable({ sales, lastSale, confidence: s?.smartMarketPrice?.confidence || null }) };
  }
  if (!Object.keys(graded).length) return null;
  return {
    productId, language: /language=japanese/.test(key) ? "japanese" : "english",
    name: p.name, setName: p.setName || null, number: p.number || null, image: p.image, printing, raw, graded, sourceAt: new Date(fetchedAt),
  };
}

/** A grading_gap row in the shape Worth Grading's maths takes (lib/grading.js gradingCandidates). */
function candidate(r) {
  const grades = {};
  for (const [g, co] of Object.entries(GRADING_COMPANIES)) {
    const top = r.graded[keyOf(g, co.top)], next = r.graded[keyOf(g, co.next)];
    grades[g] = { top: top?.r ? top.p : null, next: next?.r ? next.p : null, topSales: top?.r ? top.n : null };
  }
  return { productId: r.productId, language: r.language, name: r.name, setName: r.setName, number: r.number, image: r.image,
    printing: r.printing, copies: 1, raw: r.raw, grades };
}

// Demo mode (no database): the sample catalog, so the page can be tried locally.
function demoRows() {
  return allSampleCards().map((p) => {
    const printing = Object.keys(p.prices)[0];
    const raw = p.prices[printing]?.["Near Mint"]?.market;
    const graded = Object.fromEntries(Object.entries(p.graded || {}).map(([k, g]) => [k, { p: g.price, n: g.sales, r: g.reliable !== false }]));
    return raw && { productId: p.id, language: "english", name: p.name, setName: p.setName, number: p.number, image: p.image, printing, raw, graded };
  }).filter(Boolean);
}

// A handful of graded sales can still be junk the reliability rule lets through (a $66,000 "PSA 10" of a card whose
// 9 sells for $1,875, a $99,999 placeholder, an $18,600 10 of a $29 card). Real gem premiums stay inside these: the top
// grade at most 8x the grade below and 40x raw, the grade below at most 6x raw (checked on the live data, Nov 2026).
const TOP_X_NEXT = 8, TOP_X_RAW = 40, NEXT_X_RAW = 6;
const plausible = (c) => c.top <= TOP_X_RAW * c.raw && (c.next === null || (c.top <= TOP_X_NEXT * c.next && c.next <= NEXT_X_RAW * c.raw));

/**
 * Cards worth grading at a grader and service level, best first. opts: grader, tier (service level index), own (own
 * fee instead), shipping, minRaw / maxRaw (what the raw copy costs), minProfit, safeOnly (the grade below the top still
 * pays), language ("english" / "japanese" / "all"), sort ("profit" / "return"), limit.
 * Returns { cards, total } (total: how many qualify before the limit).
 */
export async function findGradingGaps(opts = {}) {
  const { grader = "PSA", tier = 0, own = null, shipping = 5, minRaw = 0, maxRaw = null, minProfit = 25, safeOnly = false,
    language = "english", sort = "profit", limit = 60 } = opts;
  const co = GRADING_COMPANIES[grader];
  const tk = keyOf(grader, co.top), nk = keyOf(grader, co.next);
  // The cheapest this grading can cost (a pricier card may need a higher level): rules out most cards in the database.
  const floor = (own ?? co.tiers[Math.min(tier, co.tiers.length - 1)].fee) + shipping;
  let rows;
  if (!db) {
    rows = demoRows().filter((r) => language === "all" || r.language === language);
  } else {
    // Grade keys come from GRADING_COMPANIES (psa10, bgs9_5...), never from the request, so they can go in as text.
    const g = (k, f) => sql.raw(`(graded->'${k}'->>'${f}')`);
    const top = sql`${g(tk, "p")}::float`, next = sql`${g(nk, "p")}::float`;
    const where = [
      sql`${g(tk, "r")}::boolean`,
      sql`${gradingGap.raw} >= ${minRaw}::float`,
      sql`${top} - ${gradingGap.raw} - ${floor}::float >= ${minProfit}::float`,
    ];
    if (maxRaw !== null) where.push(sql`${gradingGap.raw} <= ${maxRaw}::float`);
    if (language !== "all") where.push(sql`${gradingGap.language} = ${language}`);
    if (safeOnly) where.push(sql`${g(nk, "r")}::boolean and ${next} - ${gradingGap.raw} - ${floor}::float >= 0`);
    // Believable prices only (see plausible below).
    where.push(sql`${top} <= ${sql.raw(String(TOP_X_RAW))} * ${gradingGap.raw}`);
    where.push(sql`(coalesce(${g(nk, "r")}::boolean, false) = false or (${top} <= ${sql.raw(String(TOP_X_NEXT))} * ${next} and ${next} <= ${sql.raw(String(NEXT_X_RAW))} * ${gradingGap.raw}))`);
    rows = await db.select().from(gradingGap).where(sql.join(where, sql` and `))
      .orderBy(sql`${top} - ${gradingGap.raw} desc`).limit(600);
  }
  const cards = rows.map(candidate).map((c) => {
    const m = gradingMath(c, grader, tier, { own, shipping });
    return m && { ...c, ...m, roi: m.profit10 / (c.raw + m.cost) };
  }).filter((c) => c && plausible(c) && c.verdict !== "skip" && c.profit10 >= minProfit && (!safeOnly || c.verdict === "safe")
    && c.raw >= minRaw && (maxRaw === null || c.raw <= maxRaw));
  cards.sort(sort === "return" ? (a, b) => b.roi - a.roi : (a, b) => b.profit10 - a.profit10);
  return { cards: cards.slice(0, limit), total: cards.length, capped: rows.length === 600 };
}

/** How many cards the finder can check (Admin and the page footnote). */
export async function gradingGapCount() {
  if (!db) return demoRows().length;
  const [r] = await db.select({ n: sql`count(*)::int` }).from(gradingGap);
  return r?.n || 0;
}

