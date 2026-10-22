import Link from "next/link";
import AlertChannels from "@/components/AlertChannels";
import WatchManager from "@/components/WatchManager";
import WatchPerformance from "@/components/WatchPerformance";
import { listingsByWatch } from "@/lib/watch-listings";
import { getProduct } from "@/lib/catalog";
import { ownedCounts } from "@/lib/collection";
import { requireUser } from "@/lib/session";
import * as store from "@/lib/store";

export const metadata = { title: "Price alerts" };

export default async function WatchesPage({ searchParams }) {
  const user = await requireUser();
  const tab = (await searchParams)?.tab === "performance" ? "performance" : "alerts";
  const watches = await store.listWatches(user.id);
  // Current prices and history for each watched product (cached; one lookup per product).
  const ids = [...new Set(watches.map((w) => w.productId))];
  const products = {};
  await Promise.all(ids.map(async (id) => {
    try {
      const p = await getProduct(id);
      if (p) products[id] = { id: p.id, type: p.type, prices: p.prices, history: p.history, name: p.name, setName: p.setName, number: p.number, image: p.image, tcgplayerUrl: p.tcgplayerUrl, language: p.language || "english" };
    } catch { /* show the saved snapshot if the price service is unavailable */ }
  }));

  const listings = user.demo ? {} : await listingsByWatch(user.id);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Price alerts</h1>
          <p>Buying or selling? Pick a card and your price. We&apos;ll tell you when it gets there.</p>
        </div>
      </div>
      <div className="tabs-row" role="tablist">
        <Link href="/app/watches" role="tab" aria-selected={tab === "alerts"} className={tab === "alerts" ? "on" : ""}>Alerts <span>{watches.length}</span></Link>
        <Link href="/app/watches?tab=performance" role="tab" aria-selected={tab === "performance"} className={tab === "performance" ? "on" : ""}>Performance</Link>
      </div>
      {tab === "performance" ? (
        <WatchPerformance watches={watches} listings={listings} plan={user.plan} />
      ) : (
        <>
          <WatchManager
            side={<AlertChannels user={{
              email: user.email, alertEmail: user.alertEmail, alertDiscord: user.alertDiscord, alertSms: user.alertSms, phone: user.phone,
              phoneVerifiedAt: Boolean(user.phoneVerifiedAt), discordConnected: Boolean(user.discordConnected),
              plan: { watchAlertChannels: user.plan.watchAlertChannels },
            }} />}
            watches={watches.map((w) => ({ ...w, createdAt: String(w.createdAt), lastCheckedAt: w.lastCheckedAt ? String(w.lastCheckedAt) : null, triggeredAt: w.triggeredAt ? String(w.triggeredAt) : null }))}
            products={products}
            plan={user.plan}
            isDemo={user.demo}
            owned={ownedCounts(await store.listItems(user.id))}
            listings={listings}
          />
        </>
      )}
    </>
  );
}
