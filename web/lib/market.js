import "server-only";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getProduct, prefetchProducts } from "@/lib/catalog";
import { gradeKey, money } from "@/lib/collection";
import { db, schema } from "@/lib/db";
import { credible, realOff, recentDeals } from "@/lib/deals";
import { slim } from "@/lib/portfolio";
import { setLabel } from "@/lib/sets";

// The market feed (public /sales page, share images, Admin -> Sales posts to X), from sales the bot saw end on eBay:
//   - "high": a graded card sold for more than any sale of that card and grade we know of (our own tracked sales
//     plus the price service's last 90 days), with at least 3 earlier sales to compare against;
//   - "big": the biggest sales of the week;
//   - "deal": deals we alerted that really sold well under market (the homepage's "caught" deals).
// Each item carries what its page tile, share image and X post need. Cached 15 minutes.
const { sales } = schema;
const DAY = 86400000;
const SITE = (process.env.AUTH_URL || "https://tcgboogie.com").replace(/\/$/, "");
const HIGH_MIN = 200; // a "new high" worth posting
const BIG_MIN = 1000; // a "big sale" worth posting
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

async function products(ids) {
  const sold = await prefetchProducts(ids).catch(() => null);
  const out = {};
  for (const id of [...new Set(ids)]) {
    try {
      const p = await getProduct(id, { cachedOnly: true, sales: sold || undefined });
      if (p) out[id] = slim(p);
    } catch { /* not cached: the tile shows without a picture */ }
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
    // A real record: enough history, beats it, and not so far above it that it's likely a mislabeled listing.
    if (before.length >= 3 && r.price > prev && r.price <= prev * 3) {
      highs.push(item("high", p, { id: `high-${r.itemId}`, itemId: r.itemId, title: r.title, grader: r.grader, grade: r.grade, price: r.price, prevHigh: prev, sales: before.length, soldAt: r.soldAt, url: r.url }));
    }
  }

  const seen = new Set();
  const big = rows.filter((r) => r.price >= BIG_MIN && r.soldAt > new Date(Date.now() - 7 * DAY))
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

/** One feed item by its id ("high-123", "big-123", "deal-123"), for its share image and X post. */
export async function marketItem(id) {
  const f = await marketFeed();
  return [...f.highs, ...f.big, ...f.deals].find((x) => x.id === String(id)) || null;
}
