import WatchManager from "@/components/WatchManager";
import { getProduct } from "@/lib/catalog";
import { ownedCounts } from "@/lib/collection";
import { requireUser } from "@/lib/session";
import * as store from "@/lib/store";

export const metadata = { title: "Price alerts" };

export default async function WatchesPage() {
  const user = await requireUser();
  const watches = await store.listWatches(user.id);
  // Current prices and history for each watched product (cached; one lookup per product).
  const ids = [...new Set(watches.map((w) => w.productId))];
  const products = {};
  await Promise.all(ids.map(async (id) => {
    try {
      const p = await getProduct(id);
      if (p) products[id] = { id: p.id, type: p.type, prices: p.prices, history: p.history, name: p.name, setName: p.setName, number: p.number, image: p.image, tcgplayerUrl: p.tcgplayerUrl };
    } catch { /* show the saved snapshot if the price service is unavailable */ }
  }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Price alerts</h1>
          <p>Pick a card and your price. We&apos;ll tell you when it drops.</p>
        </div>
      </div>
      <WatchManager
        watches={watches.map((w) => ({ ...w, createdAt: String(w.createdAt), lastCheckedAt: w.lastCheckedAt ? String(w.lastCheckedAt) : null, triggeredAt: w.triggeredAt ? String(w.triggeredAt) : null }))}
        products={products}
        plan={user.plan}
        isDemo={user.demo}
        owned={ownedCounts(await store.listItems(user.id))}
      />
    </>
  );
}
