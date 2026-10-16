import "server-only";
import { getProduct } from "@/lib/catalog";
import { change, marketValue, summarize } from "@/lib/collection";
import * as store from "@/lib/store";

// Products looked up live (spending API credits) per page view; the rest use cached prices or the last saved value,
// and catch up on the next views. Keeps a 2,000-card collection from burning a day's credits in one page load.
const MAX_LIVE_LOOKUPS = 40;
const STALE_MS = 20 * 3600 * 1000;

/** A product trimmed to what pages and client components need. */
export const slim = (p) => p && {
  id: p.id, type: p.type, name: p.name, setName: p.setName, setId: p.setId || null, number: p.number, rarity: p.rarity || null,
  image: p.image, tcgplayerUrl: p.tcgplayerUrl, prices: p.prices, graded: p.graded || {}, history: p.history || [],
};

/** Fetch products for a list of IDs, at most `maxLive` of them from the API; the rest only if already cached. */
export async function loadProducts(ids, maxLive = MAX_LIVE_LOOKUPS) {
  const products = {};
  let live = 0;
  for (const id of [...new Set(ids)]) {
    try {
      let p = await getProduct(id, { cachedOnly: true });
      if (p === undefined && live < maxLive) { live++; p = await getProduct(id); }
      if (p) products[id] = slim(p);
    } catch { /* price service unavailable: fall back to saved values */ }
  }
  return products;
}

/** A member's whole collection, valued, with today's snapshot recorded. */
export async function loadCollection(user) {
  const [items, binders, prefs] = await Promise.all([store.listItems(user.id), store.listBinders(user.id), store.getCollectionPrefs(user.id)]);
  const products = await loadProducts(items.map((it) => it.productId));
  const now = Date.now();
  const enriched = [];
  for (const it of items) {
    const p = products[it.productId];
    const mv = p ? marketValue(p, it) : null;
    // Save fresh market values so totals still work if the price service is down later.
    if (p && mv !== null && (mv !== it.unitValue || !it.valueUpdatedAt || now - new Date(it.valueUpdatedAt).getTime() > STALE_MS)) {
      await store.updateItem(user.id, it.id, { unitValue: mv, valueUpdatedAt: new Date() });
      it.unitValue = mv;
      it.valueUpdatedAt = new Date();
    }
    enriched.push({
      ...it,
      image: it.image || p?.image || null,
      tcgplayerUrl: it.tcgplayerUrl || p?.tcgplayerUrl || null,
      change7: it.kind === "graded" ? null : change(p, 7),
      createdAt: String(it.createdAt),
      valueUpdatedAt: it.valueUpdatedAt ? String(it.valueUpdatedAt) : null,
    });
  }
  const owned = enriched.filter((it) => it.list === "owned");
  const summary = summarize(owned);
  await store.recordSnapshot(user.id, Math.round(summary.value * 100) / 100, Math.round(summary.cost * 100) / 100);
  const snapshots = (await store.listSnapshots(user.id)).map((s) => ({ day: String(s.day).slice(0, 10), value: s.value, cost: s.cost }));
  return { items: enriched, owned, wishlist: enriched.filter((it) => it.list === "wishlist"), binders, prefs, products, summary, snapshots };
}
