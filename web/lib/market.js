import "server-only";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getProduct, prefetchProducts } from "@/lib/catalog";
import { gradeKey, money } from "@/lib/collection";
import { db, schema } from "@/lib/db";
import { credible, realOff, recentDeals } from "@/lib/deals";
import { slim } from "@/lib/portfolio";
import { RELEASES } from "@/lib/release-notes";
import { setLabel } from "@/lib/sets";

// The market feed (public /sales page, share images, Admin -> Sales posts to X), from sales the bot saw end on eBay:
//   - "high": a graded card sold for more than any sale of that card and grade we know of (our own tracked sales
//     plus the price service's last 90 days), with at least 3 earlier sales to compare against, at most 1.5x the old
//     high, and not a special version (stamped, error, misprint...);
//   - "big": the biggest sales of the week (special versions left out);
//   - "deal": deals we alerted that really sold well under market (the homepage's "caught" deals).
// Each item carries what its page tile, share image and X post need. Cached 15 minutes.
const { sales } = schema;
const DAY = 86400000;
const SITE = (process.env.AUTH_URL || "https://tcgboogie.com").replace(/\/$/, "");
const HIGH_MIN = 200; // a "new high" worth posting
const BIG_MIN = 1000; // a "big sale" worth posting
const HIGH_MAX = 1.5; // a record beats the old high by at most this much; more usually means a different version sold
// Special versions the bot can mistake for the regular card (a stamped Gengar sold as "Gengar"): their sales aren't
// records or big sales of the card we'd name. A word that's part of the product's own name or set doesn't count.
const VARIANT_WORDS = ["stamped", "stamp", "error", "misprint", "miscut", "mis cut", "test print", "prerelease", "pre release", "staff",
  "promo", "league", "championship", "worlds", "trophy", "1st edition", "first edition", "shadowless", "no symbol", "no rarity",
  "jumbo", "oversized", "proxy", "custom", "lot", "w stamp", "illustrator", "ink error", "crimp", "wrong back"];
const norm = (t) => ` ${String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
function specialVersion(title, p) {
  const t = norm(title), own = norm(`${p?.name || ""} ${p?.setName || ""}`);
  return VARIANT_WORDS.some((w) => t.includes(` ${w} `) && !own.includes(` ${w} `));
}
const shortName = (name) => String(name || "").replace(/\s*\(.*\)$/, "").replace(/\s+-\s+\S+$/, "").trim();
const gradeText = (grader, grade) => (grader && grade ? `${grader} ${grade}` : "");
const hashtags = (name, grader, grade) => {
  const mon = shortName(name).split(/\s+/)[0].replace(/[^A-Za-z]/g, "");
  const n = String(grade || "").match(/^\d+(\.\d)?/)?.[0];
  const g = grader ? `#${grader}${n && !n.includes(".") ? n : ""}` : ""; // #psa10, #cgc10; half grades just #bgs
  return ["#pokemon", "#pokemontcg", mon ? `#${mon.toLowerCase()}` : "", g.toLowerCase(), "#tcgboogie"].filter(Boolean).join(" ");
};

function item(kind, p, fields) {
  const name = shortName(p?.name || fields.title);
  const set = p?.setName ? setLabel(p.setName).name : null;
  return {
    kind, name, fullName: p?.name || fields.title, set, number: p?.number || null, image: p?.image || null, productId: p?.id || null,
    ...fields, ...(fields.soldAt ? { soldAt: new Date(fields.soldAt).toISOString() } : {}),
  };
}

function captionFor(x) {
  const what = `${x.grade ? `${gradeText(x.grader, x.grade)} ` : ""}${x.name}${x.set ? ` from ${x.set}` : ""}`;
  const line = x.kind === "high" ? `📈 New high: a ${what} just sold on eBay for ${money(x.price, 0)}, beating the last high of ${money(x.prevHigh, 0)}.`
    : x.kind === "deal" ? `⚡ Caught it: a ${what} sold on eBay for ${money(x.price, 0)}, ${x.off}% under its ${money(x.market, 0)} market value. Our members got the alert before it ended.`
      : `💰 A ${what} just sold on eBay for ${money(x.price, 0)}.`;
  return `${line}\n\n${hashtags(x.name, x.grader, x.grade)}\n${SITE}/sales`;
}

// Cards looked up live per feed rebuild when no copy was ever saved (each costs price-service credits). One that
// still isn't found isn't tried again for a day.
const LIVE_LOOKUPS = 12;
const notFound = globalThis.__tcgMarketMissing ?? (globalThis.__tcgMarketMissing = new Map());

/**
 * Each card's name, set, number and picture for the feed. A saved copy of any age will do (prices age, names and
 * pictures don't); a card nobody ever looked up is looked up live, a few per rebuild, biggest sales first.
 */
async function products(ids) {
  const sold = await prefetchProducts(ids, { light: true }).catch(() => null);
  const out = {};
  let live = 0;
  for (const id of [...new Set(ids)]) {
    try {
      let p = await getProduct(id, { cachedOnly: true, anyAge: true, sales: sold || undefined });
      if (!p && live < LIVE_LOOKUPS && !(Date.now() - (notFound.get(id) || 0) < DAY)) {
        live++;
        p = await getProduct(id);
        if (!p) notFound.set(id, Date.now());
      }
      if (p) out[id] = slim(p);
    } catch { /* price service down: the tile shows the eBay title until the next rebuild */ }
  }
  return out;
}

// The local preview has no sales database: a few clearly sample items so the page and images can be checked.
async function sample() {
  const p = await products(["246723", "517045", "42382", "84186"]);
  const ago = (d) => new Date(Date.now() - d * DAY);
  const list = [
    item("high", p["246723"], { id: "high-demo1", itemId: "demo1", grader: "PSA", grade: "10", price: 2580, prevHigh: 2410, sales: 14, soldAt: ago(1), url: "https://www.ebay.com" }),
    item("big", p["84186"], { id: "big-demo2", itemId: "demo2", grader: "CGC", grade: "10 Pristine", price: 14250, soldAt: ago(2), url: "https://www.ebay.com" }),
    item("deal", p["517045"], { id: "deal-demo3", itemId: "demo3", grader: "BGS", grade: "9.5", price: 612, market: 980, off: 38, soldAt: ago(1), url: "https://www.ebay.com" }),
    item("deal", p["42382"], { id: "deal-demo4", itemId: "demo4", grader: null, grade: null, condition: "Near Mint", price: 289, market: 420, off: 31, soldAt: ago(3), url: "https://www.ebay.com" }),
  ].map((x) => ({ ...x, caption: captionFor(x) }));
  return { highs: list.filter((x) => x.kind === "high"), big: list.filter((x) => x.kind === "big"), deals: list.filter((x) => x.kind === "deal") };
}

async function build() {
  if (!db) return sample();
  const rows = await db.select().from(sales)
    .where(and(eq(sales.kind, "graded"), gte(sales.soldAt, new Date(Date.now() - 14 * DAY)), gte(sales.price, HIGH_MIN)))
    .orderBy(desc(sales.price)).limit(600);
  const byId = await products(rows.map((r) => r.productId));

  // Earlier sales of the same card and grade: our own (any age) and the price service's last 90 days.
  const ours = rows.length ? await db.select({ productId: sales.productId, grader: sales.grader, grade: sales.grade, price: sales.price, soldAt: sales.soldAt })
    .from(sales).where(and(eq(sales.kind, "graded"), inArray(sales.productId, [...new Set(rows.map((r) => r.productId))]))) : [];
  const highs = [];
  for (const r of rows) {
    const p = byId[r.productId];
    const key = gradeKey(r.grader, r.grade);
    const before = [
      ...ours.filter((o) => o.productId === r.productId && o.grader === r.grader && o.grade === r.grade && o.soldAt < r.soldAt).map((o) => o.price),
      ...(p?.recentSales || []).filter((s) => s.grade === key && s.date < r.soldAt.toISOString().slice(0, 10)).map((s) => s.price),
    ].filter((v) => Number.isFinite(v) && v > 0);
    const prev = before.length ? Math.max(...before) : 0;
    // A real record: enough history, beats it, isn't a special version, and isn't so far above the old high that a
    // different version probably sold.
    if (before.length >= 3 && r.price > prev && r.price <= prev * HIGH_MAX && !specialVersion(r.title, p)) {
      highs.push(item("high", p, { id: `high-${r.itemId}`, itemId: r.itemId, title: r.title, grader: r.grader, grade: r.grade, price: r.price, prevHigh: prev, sales: before.length, soldAt: r.soldAt, url: r.url }));
    }
  }

  const seen = new Set();
  const big = rows.filter((r) => r.price >= BIG_MIN && r.soldAt > new Date(Date.now() - 7 * DAY) && !specialVersion(r.title, byId[r.productId]))
    .filter((r) => (seen.has(`${r.productId}:${r.grader}:${r.grade}`) ? false : seen.add(`${r.productId}:${r.grader}:${r.grade}`)))
    .slice(0, 24)
    .map((r) => item("big", byId[r.productId], { id: `big-${r.itemId}`, itemId: r.itemId, title: r.title, grader: r.grader, grade: r.grade, price: r.price, soldAt: r.soldAt, url: r.url }));

  const caught = (await recentDeals({ days: 14, limit: 2000 }).catch(() => [])).filter((d) => d.ended && credible(d) && d.marketValue >= 50)
    .sort((a, b) => realOff(b) - realOff(a)).slice(0, 24);
  const dealProducts = await products(caught.map((d) => d.productId).filter(Boolean));
  const deals = caught.map((d) => item("deal", dealProducts[d.productId] || { name: d.name, setName: d.setName, number: d.number, image: d.image, id: d.productId }, {
    id: `deal-${d.id}`, itemId: d.id, title: d.title, grader: d.kind === "graded" ? d.grader : null, grade: d.kind === "graded" ? d.grade : null,
    condition: d.kind === "raw" ? d.condition || "Raw" : d.kind === "sealed" ? "Sealed" : null,
    price: d.soldFor, market: d.marketValue, off: realOff(d), soldAt: d.endsAt, url: d.url,
  }));

  const withCaption = (list) => list.map((x) => ({ ...x, caption: captionFor(x) }));
  return { highs: withCaption(highs.slice(0, 24)), big: withCaption(big), deals: withCaption(deals) };
}

const g = globalThis;
g.__tcgMarket ??= { at: 0, data: null };

/** { highs, big, deals }: the market feed, newest information within 15 minutes. */
export async function marketFeed() {
  if (g.__tcgMarket.data && Date.now() - g.__tcgMarket.at < 15 * 60000) return g.__tcgMarket.data;
  const data = await build().catch(() => ({ highs: [], big: [], deals: [] }));
  g.__tcgMarket = { at: Date.now(), data };
  return data;
}

/**
 * Release notes as posts (Admin -> Social media): one per release in lib/release-notes.js, with its share image
 * (lib/sale-image.js draws kind "release") and a caption listing what's new.
 */
export function releasePosts() {
  return RELEASES.map((r) => {
    const fresh = r.items.filter((i) => i.tag === "New");
    const rest = r.items.length - fresh.length;
    const caption = [`🆕 New on TCG Boogie: ${r.title}`, "", ...fresh.map((i) => `• ${i.title}`),
      ...(rest ? [`• Plus ${rest} ${rest === 1 ? "improvement" : "improvements and fixes"}`] : []), "", `All the details: ${SITE}/updates`, "#pokemon #pokemontcg #tcgboogie"].join("\n");
    return { kind: "release", id: `release-${r.date}`, date: r.date, title: r.title, items: r.items.map(({ tag, title }) => ({ tag, title })), caption };
  });
}

/** One post by its id ("high-123", "big-123", "deal-123", "release-2026-10-25"), for its share image and X post. */
export async function marketItem(id) {
  if (String(id).startsWith("release-")) return releasePosts().find((x) => x.id === String(id)) || null;
  const f = await marketFeed();
  return [...f.highs, ...f.big, ...f.deals].find((x) => x.id === String(id)) || null;
}
