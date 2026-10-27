import "server-only";
import { loadPictures, pictureFor } from "@/lib/card-images";
import { creditsLow, getProduct, prefetchProducts } from "@/lib/catalog";
import { change, marketValue, summarize } from "@/lib/collection";
import * as store from "@/lib/store";

// Products looked up live (spending API credits) per page view; the rest use cached prices or the last saved value,
// and catch up on the next views. Keeps a 2,000-card collection from burning a day's credits in one page load.
const MAX_LIVE_LOOKUPS = 40;
const STALE_MS = 20 * 3600 * 1000;

/** A product trimmed to what pages and client components need. */
export const slim = (p) => p && {
  id: p.id, type: p.type, name: p.name, setName: p.setName, setId: p.setId || null, number: p.number, rarity: p.rarity || null,
  image: p.image, tcgplayerUrl: p.tcgplayerUrl, prices: p.prices, graded: p.graded || {}, recentSales: p.recentSales || [], history: p.history || [],
  ...(p.language && p.language !== "english" ? { language: p.language } : {}),
  ...(p.memberAdded ? { memberAdded: true, sourceUrl: p.sourceUrl } : {}),
  ...(p.topps ? { topps: p.topps } : {}),
};

/** Fetch products for a list of IDs, at most `maxLive` of them from the API; the rest only if already cached. */
export async function loadProducts(ids, maxLive = MAX_LIVE_LOOKUPS) {
  if (maxLive && await creditsLow()) maxLive = 0; // today's credits nearly gone: saved prices (lib/catalog.js)
  const products = {};
  let live = 0;
  const sales = await prefetchProducts(ids).catch(() => null);
  for (const id of [...new Set(ids)]) {
    try {
      let p = await getProduct(id, { cachedOnly: true, sales });
      if (p === undefined && live < maxLive) { live++; p = await getProduct(id); }
      if (p) products[id] = slim(p);
    } catch { /* price service unavailable: fall back to saved values */ }
  }
  return products;
}

const RANGES = [1, 7, 30, 90, 365];
/** A graded copy's change per range from its own saved daily values (store.itemHistories); null without history. */
function itemRangeChanges(hist, now) {
  const today = new Date().toISOString().slice(0, 10);
  const past = (hist || []).filter((h) => h.day < today && h.value > 0);
  if (!past.length || !(now > 0)) return null;
  const at = (d) => {
    const cutoff = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
    const base = [...past].reverse().find((h) => h.day <= cutoff);
    return base ? (now - base.value) / base.value : null;
  };
  return Object.fromEntries([...RANGES.map((d) => [d, d === 1 ? (now - past[past.length - 1].value) / past[past.length - 1].value : at(d)]), [0, (now - past[0].value) / past[0].value]]);
}

export function rangeChanges(p) {
  const n = (p?.history || []).filter((h) => Number.isFinite(h.price)).length;
  if (n < 2) return null;
  return Object.fromEntries([...RANGES.map((d) => [d, n > d ? change(p, d) : null]), [0, change(p, n - 1)]]);
}

/** A member's whole collection, valued, with today's snapshot recorded. */
export async function loadCollection(user) {
  const [items, binders, prefs] = await Promise.all([store.listItems(user.id), store.listBinders(user.id), store.getCollectionPrefs(user.id)]);
  const products = await loadProducts(items.map((it) => it.productId));
  const now = Date.now();
  await loadPictures();
  const hist = await store.itemHistories(items.filter((it) => it.kind === "graded" && it.list === "owned").map((it) => it.id)).catch(() => ({}));
  const enriched = [];
  const fresh = []; // values to save, in one database write
  for (const it of items) {
    const p = products[it.productId];
    const mv = p ? marketValue(p, it) : null;
    // Save fresh market values so totals still work if the price service is down later.
    if (p && mv !== null && (mv !== it.unitValue || !it.valueUpdatedAt || now - new Date(it.valueUpdatedAt).getTime() > STALE_MS)) {
      fresh.push({ id: it.id, unitValue: mv });
      it.unitValue = mv;
      it.valueUpdatedAt = new Date();
    }
    enriched.push({
      ...it,
      // A picture saved because TCGplayer has none comes first: the copy's own saved link is TCGplayer's missing one.
      image: pictureFor(it.productId) || it.image || p?.image || null,
      tcgplayerUrl: it.tcgplayerUrl || p?.tcgplayerUrl || null,
      change7: it.kind === "graded" ? null : change(p, 7),
      // Each chart range's price change (key 0 = all the history we have), so the list follows the chart's range.
      // Only when the history covers the range: no "1Y" figure from 90 days of prices. Graded copies use their own
      // saved daily values (they have no price-service history).
      changes: it.kind === "graded" ? itemRangeChanges(hist[it.id], it.unitValue ?? it.customValue) : rangeChanges(p),
      createdAt: String(it.createdAt),
      valueUpdatedAt: it.valueUpdatedAt ? String(it.valueUpdatedAt) : null,
    });
  }
  const owned = enriched.filter((it) => it.list === "owned");
  const summary = summarize(owned);
  await Promise.all([
    store.updateItemValues(user.id, fresh),
    store.recordItemValues(user.id, items).catch(() => {}), // graded copies' values for today (their % changes)
    store.recordSnapshot(user.id, Math.round(summary.value * 100) / 100, Math.round(summary.cost * 100) / 100),
  ]);
  const snapshots = (await store.listSnapshots(user.id)).map((s) => ({ day: String(s.day).slice(0, 10), value: s.value, cost: s.cost }));
  return { items: enriched, owned, wishlist: enriched.filter((it) => it.list === "wishlist"), binders, prefs, products, summary, snapshots };
}
