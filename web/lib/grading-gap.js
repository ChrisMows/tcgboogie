import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { allSampleCards, fromCard, gradedReliable, listSets } from "@/lib/catalog";
import { db, schema } from "@/lib/db";
import { gradeKey, splitTen } from "@/lib/collection";
import { GRADE_TARGETS, GRADING_COMPANIES, flipScore, gapStateOn, gapTrail, gradingMath } from "@/lib/grading";

// Grade & Flip (Premium): cards anywhere in the catalog, not just the member's own, whose raw Near Mint price is far
// under what the same card sells for graded. Built only from price-service answers we already saved (catalog_cache:
// cards members own, watch or have opened), so it costs no lookups. Those answers are ~85 KB each, so the cron job
// copies the few numbers the finder needs into grading_gap (a few hundred bytes a card) as they're refreshed, and the
// finder searches that. The maths is Worth Grading's (lib/grading.js).

const { gradingGap, catalogCache, appSettings } = schema;
const WATERMARK = "grading_gap_watermark"; // fetched_at of the last saved answer copied in
// Raise this when toRow's rules change: every saved answer is copied in again. Those copies don't count as price changes,
// so cards don't all turn up as "New to your list" (quietUntil below).
const GAP_RULES = 2;
const BATCH = 500;
export const NEW_DAYS = 7; // "New to your list": passes the filters now but didn't this many days ago
const NEW_SHOWN = 12;
// The grades the finder uses: the only ones copied out. CGC Pristine and BGS Black Label sit inside the service's cgc10 and
// bgs10, in their labels (lib/collection.js splitTen).
const GRADE_KEYS = [...new Set(Object.values(GRADE_TARGETS).flatMap((t) => [gradeKey(t.grader, t.top), gradeKey(t.grader, t.next)]))]
  .filter((k) => !/_(pristine|black)$/.test(k));
const GRADE_LIST = sql.raw(`any(array[${GRADE_KEYS.map((k) => `'${k}'`).join(",")}])`); // fixed keys, not request data

/**
 * Copy newly saved card answers into grading_gap. Run by the cron job: a few batches a run, oldest first, so the first
 * run fills the table over a couple of runs and later runs only touch the cards the bot refreshed since.
 * Only the parts we use leave the database (a few KB a card): the prices, and for each grader's top two grades the sale
 * price, all-time count, last sale and how many sales the last 90 days had (reliability: lib/catalog.js gradedReliable, on all-time sales for every grader).
 */
export async function refreshGradingGaps({ batches = 8 } = {}) {
  if (!db) return { copied: 0 };
  await listSets().catch(() => null); // the era filter reads the saved set list: keep it from expiring (a lookup a week)
  const [mark] = await db.select().from(appSettings).where(eq(appSettings.key, WATERMARK)).limit(1);
  const current = mark?.value?.rules === GAP_RULES;
  let after = current && mark.value.at ? new Date(mark.value.at) : new Date(0);
  const quietUntil = current ? mark.value.quietUntil || null : new Date().toISOString();
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
                    'totalSales', g.value->'totalSales', 'lastSaleDate', g.value->'lastSaleDate', 'labels', g.value->'labels'))
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
    const fresh = rows.map(toRow).filter(Boolean);
    if (fresh.length) {
      // What each card looked like before this update, for its trail ("New to your list"). A card not here yet is new.
      const before = await db.select({ productId: gradingGap.productId, language: gradingGap.language, raw: gradingGap.raw, graded: gradingGap.graded, trail: gradingGap.trail, sourceAt: gradingGap.sourceAt })
        .from(gradingGap).where(inArray(gradingGap.productId, [...new Set(fresh.map((v) => v.productId))]));
      const known = new Map(before.map((o) => [`${o.productId}:${o.language}`, o]));
      const today = new Date().toISOString().slice(0, 10);
      const values = fresh.map((v) => {
        const old = known.get(`${v.productId}:${v.language}`);
        const rulesOnly = old && quietUntil && v.sourceAt <= new Date(quietUntil); // copied again because the rules changed
        return { ...v, firstSeen: old ? null : new Date(), trail: rulesOnly ? old.trail : old ? gapTrail(old, v, today) : [] }; // firstSeen is only written on a first insert
      });
      await db.insert(gradingGap).values(values).onConflictDoUpdate({
        target: [gradingGap.productId, gradingGap.language],
        set: { name: sql`excluded.name`, setName: sql`excluded.set_name`, number: sql`excluded.number`, image: sql`excluded.image`,
          printing: sql`excluded.printing`, raw: sql`excluded.raw`, graded: sql`excluded.graded`, sourceAt: sql`excluded.source_at`, trail: sql`excluded.trail`, updatedAt: new Date() },
      });
      copied += values.length;
    }
    after = new Date(rows[rows.length - 1].fetched_at);
    const value = { at: after.toISOString(), rules: GAP_RULES, quietUntil };
    await db.insert(appSettings).values({ key: WATERMARK, value })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
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
    const allSales = s?.count ?? s?.totalSales ?? null;
    const sales = c.recent?.[g] !== undefined ? c.recent[g] : allSales;
    const lastSale = s?.lastSaleDate ? String(s.lastSaleDate).slice(0, 10) : null;
    // CGC and BGS 10s: a price per slab label (the card page's rule).
    const split = splitTen(g, s, sales);
    if (split?.length) {
      for (const l of split) {
        graded[l.key] = { p: Math.round(l.price * 100) / 100, n: l.sales, r: gradedReliable({ sales: l.allSales, lastSale: l.lastSale, confidence: l.confidence }) };
      }
      continue;
    }
    // All-time sales, the same count CGC's and BGS's labelled 10s are judged on above, so every grader gets one rule. n stays recent.
    graded[g] = { p: Math.round(price * 100) / 100, n: sales, r: gradedReliable({ sales: allSales, lastSale, confidence: s?.smartMarketPrice?.confidence || null }) };
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
  for (const [id, t] of Object.entries(GRADE_TARGETS)) {
    const top = r.graded[gradeKey(t.grader, t.top)], next = r.graded[gradeKey(t.grader, t.next)];
    grades[id] = { top: top?.r ? top.p : null, next: next?.r ? next.p : null, topSales: top?.r ? top.n : null, nextSales: next?.r ? next.n : null };
  }
  return { productId: r.productId, language: r.language, name: r.name, setName: r.setName, number: r.number, image: r.image,
    printing: r.printing, copies: 1, raw: r.raw, grades };
}

// Demo mode (no database): the sample catalog, so the page can be tried locally.
function demoRows() {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  return allSampleCards().map((p, i) => {
    const printing = Object.keys(p.prices)[0];
    const raw = p.prices[printing]?.["Near Mint"]?.market;
    const graded = Object.fromEntries(Object.entries(p.graded || {}).map(([k, g]) => [k, { p: g.price, n: g.sales, r: g.reliable !== false }]));
    // A few sample cards "got cheaper yesterday" or "just joined", so the New to your list section can be seen.
    const trail = raw && i % 4 === 1 ? [{ d: yesterday, raw: raw * 20, g: graded }] : [];
    return raw && { productId: p.id, language: "english", name: p.name, setName: p.setName, number: p.number, image: p.image, printing, raw, graded, trail, firstSeen: i % 4 === 2 ? new Date() : null };
  }).filter(Boolean);
}

// Eras: vintage cards rarely come back a 10 (old printing, decades of handling), so the finder starts on modern. English
// cards go by their set's release date (the saved set list, lib/catalog.js listSets); Japanese set names carry the era's
// code instead: SM (Sun & Moon, 2016-19), S (Sword & Shield, 2019-22), SV (Scarlet & Violet, 2023-25), M (Mega, 2025-).
export const ERAS = {
  modern: { label: "Modern: Sun & Moon to today (2017 on)", since: "2017-02-01", jp: "^(sm|s|sv|m)[0-9]" },
  newest: { label: "Newest: Scarlet & Violet and Mega (2023 on)", since: "2023-03-01", jp: "^(sv|m)[0-9]" },
  all: { label: "All eras, vintage too (10s are much rarer)", since: null, jp: null },
};
const SETS_KEY = "/sets[?]sortBy=releaseDate"; // the saved set list's request (listSets)
const inEra = (era, r, released) => !ERAS[era]?.since || (r.language === "japanese"
  ? new RegExp(ERAS[era].jp, "i").test(r.setName || "") : Boolean(released[r.setName] && released[r.setName] >= ERAS[era].since));

// A handful of graded sales can still be junk the reliability rule lets through (a $66,000 "PSA 10" of a card whose
// 9 sells for $1,875, a $99,999 placeholder, an $18,600 10 of a $29 card). Real gem premiums stay inside these: the top
// grade at most 8x the grade below and 40x raw, the grade below at most 6x raw (checked on the live data, Nov 2026).
const TOP_X_NEXT = 8, TOP_X_RAW = 40, NEXT_X_RAW = 6;
// A real Black Label can sell for far more (Mega Charizard X ex: $27,950 against $2,051 as a BGS 10 Pristine, Nov 2026).
const RARE_X_NEXT = 40, RARE_X_RAW = 150;
// Those limits are for thin data. With this many recent top-grade sales the price is real, however far above the grade below
// it is: a Magikarp 203/193 sold 119 PSA 10s at about 10 times its PSA 9 (checked on the live data, Nov 2026).
const SOLID_SALES = 10;
const plausible = (c, rare, topSales) => (topSales ?? 0) >= SOLID_SALES
  || (c.top <= (rare ? RARE_X_RAW : TOP_X_RAW) * c.raw && (c.next === null || (c.top <= (rare ? RARE_X_NEXT : TOP_X_NEXT) * c.next && c.next <= (rare ? RARE_X_NEXT : NEXT_X_RAW) * c.raw)));

/**
 * Cards worth grading at a target grade (GRADE_TARGETS) and service level, best first. opts: target, tier (service level index), own (own
 * fee instead), shipping, minRaw / maxRaw (what the raw copy costs), minProfit, safeOnly (the grade below the top still
 * pays), language ("english" / "japanese" / "all"), era (ERAS key, "modern" by default), sort ("score" / "profit" / "return"), limit.
 * Returns { cards, fresh, total, remaining }: fresh is "New to your list", cards that pass these filters now but didn't
 * NEW_DAYS ago (best first, not repeated in cards); total is how many qualify; remaining how many are past the limit.
 */
export async function findGradingGaps(opts = {}) {
  const { target = "PSA", tier = 0, own = null, shipping = 5, minRaw = 0, maxRaw = null, minProfit = 25, safeOnly = false,
    language = "english", era = "modern", sort = "score", limit = 60 } = opts;
  const t = GRADE_TARGETS[target];
  const { grader } = t;
  const co = GRADING_COMPANIES[grader];
  const tk = gradeKey(grader, t.top), nk = gradeKey(grader, t.next);
  // The cheapest this grading can cost (a pricier card may need a higher level): rules out most cards in the database.
  const floor = (own ?? co.tiers[Math.min(tier, co.tiers.length - 1)].fee) + shipping;
  let rows;
  if (!db) {
    const released = Object.fromEntries((await listSets()).map((st) => [st.name, st.releaseDate]));
    rows = demoRows().filter((r) => (language === "all" || r.language === language) && inEra(era, r, released));
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
    const e = ERAS[era];
    if (e?.since) {
      // Set names and patterns come from ERAS, not the request.
      where.push(sql`((${gradingGap.language} = 'japanese' and ${gradingGap.setName} ~* ${sql.raw(`'${e.jp}'`)}) or (${gradingGap.language} <> 'japanese' and ${gradingGap.setName} in (
        select x->>'name' from ${catalogCache}, jsonb_array_elements(case when jsonb_typeof(${catalogCache.data}->'data') = 'array' then ${catalogCache.data}->'data' else '[]'::jsonb end) x
        where ${catalogCache.key} ~ ${sql.raw(`'${SETS_KEY}'`)} and ${catalogCache.key} !~ 'japanese' and left(x->>'releaseDate', 10) >= ${sql.raw(`'${e.since}'`)})))`);
    }
    if (safeOnly) where.push(sql`${g(nk, "r")}::boolean and ${next} - ${gradingGap.raw} - ${floor}::float >= 0`);
    // Believable prices only (see plausible below).
    where.push(sql`(coalesce(${g(tk, "n")}::float, 0) >= ${sql.raw(String(SOLID_SALES))} or (${top} <= ${sql.raw(String(t.rare ? RARE_X_RAW : TOP_X_RAW))} * ${gradingGap.raw}
      and (coalesce(${g(nk, "r")}::boolean, false) = false or (${top} <= ${sql.raw(String(t.rare ? RARE_X_NEXT : TOP_X_NEXT))} * ${next} and ${next} <= ${sql.raw(String(t.rare ? RARE_X_NEXT : NEXT_X_RAW))} * ${gradingGap.raw}))))`);
    rows = await db.select().from(gradingGap).where(sql.join(where, sql` and `))
      .orderBy(sql`${top} - ${gradingGap.raw} desc`).limit(600);
  }
  /** A row worked out for these filters, or null when it doesn't pass them. */
  const judge = (r) => {
    const c = candidate(r);
    const m = gradingMath(c, target, tier, { own, shipping });
    if (!m) return null;
    const card = { ...c, ...m, roi: m.profit10 / (c.raw + m.cost), flip: flipScore({ raw: c.raw, ...m }, c.grades[target].topSales) };
    return plausible(card, t.rare, c.grades[target].topSales) && card.verdict !== "skip" && card.profit10 >= minProfit && (!safeOnly || card.verdict === "safe")
      && card.raw >= minRaw && (maxRaw === null || card.raw <= maxRaw) ? card : null;
  };
  const since = new Date(Date.now() - NEW_DAYS * 86400000).toISOString().slice(0, 10);
  const whole = (v) => `$${Math.round(v).toLocaleString("en-US")}`;
  /** Why this card is new to the list, or null when it would have passed the same filters NEW_DAYS ago too. */
  const newBecause = (r, card) => {
    if (r.firstSeen && new Date(r.firstSeen).toISOString().slice(0, 10) >= since) return "Just added";
    const then = gapStateOn(r, since);
    if (!then || judge(then)) return null;
    const was = candidate(then).grades[target];
    if (then.raw > card.raw) return `Raw down from ${whole(then.raw)}`;
    if (!was.top) return `New ${card.topName} sales`;
    if (card.top > was.top) return `${card.topName} up from ${whole(was.top)}`;
    if (card.next !== null && was.next !== null && card.next > was.next) return `${card.nextName} up from ${whole(was.next)}`;
    return "Now qualifies";
  };
  const cards = rows.map((r) => {
    const card = judge(r);
    return card && { ...card, fresh: newBecause(r, card) };
  }).filter(Boolean);
  cards.sort(sort === "return" ? (a, b) => b.roi - a.roi : sort === "profit" ? (a, b) => b.profit10 - a.profit10
    : (a, b) => b.flip.score - a.flip.score || b.profit10 - a.profit10);
  const fresh = cards.filter((c) => c.fresh).slice(0, NEW_SHOWN);
  const rest = cards.filter((c) => !fresh.includes(c));
  return { cards: rest.slice(0, limit), fresh, total: cards.length, remaining: Math.max(0, rest.length - limit), capped: rows.length === 600 };
}

/** One card for its Grade & Flip page, every grade included (junk prices left out, like the finder), or null when we have no numbers for it. */
export async function gradingGapCard(productId, language = "english") {
  const id = String(productId);
  const [row] = db
    ? await db.select().from(gradingGap).where(and(eq(gradingGap.productId, id), eq(gradingGap.language, language))).limit(1)
    : demoRows().filter((r) => String(r.productId) === id && r.language === language);
  if (!row) return null;
  const card = candidate(row);
  for (const [target, t] of Object.entries(GRADE_TARGETS)) {
    const g = card.grades[target];
    if (g.top && !plausible({ top: g.top, next: g.next, raw: card.raw }, t.rare, g.topSales)) card.grades[target] = { top: null, next: null, topSales: null, nextSales: null };
  }
  return card;
}

/** How many cards the finder can check (Admin and the page footnote). */
export async function gradingGapCount() {
  if (!db) return demoRows().length;
  const [r] = await db.select({ n: sql`count(*)::int` }).from(gradingGap);
  return r?.n || 0;
}

