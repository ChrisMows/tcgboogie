import Link from "next/link";
import AddCards from "@/components/AddCards";
import BinderTab from "@/components/BinderTab";
import CollectionHero from "@/components/CollectionHero";
import CollectionView from "@/components/CollectionView";
import { catalogLive } from "@/lib/catalog";
import { chartSeries, itemLabel, ownedCounts, unitValue } from "@/lib/collection";
import { loadCollection } from "@/lib/portfolio";
import { quotaStatus } from "@/lib/quota";
import { requireUser } from "@/lib/session";
import * as store from "@/lib/store";
import { hideSetup } from "./actions";

export const metadata = { title: "Collection" };

export default async function CollectionPage({ searchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab = sp?.tab === "wishlist" ? "wishlist" : sp?.tab === "binders" ? "binders" : "owned";
  const adding = sp?.add === "1";
  const c = await loadCollection(user);
  const [watches, profiles] = await Promise.all([store.listWatches(user.id), store.listProfiles(user.id)]);
  const { summary } = c;

  const movers = c.owned.filter((it) => it.change7 !== null && Math.abs(it.change7) >= 0.005 && unitValue(it) !== null)
    .sort((a, b) => Math.abs(b.change7 * unitValue(b) * b.quantity) - Math.abs(a.change7 * unitValue(a) * a.quantity)).slice(0, 5)
    .map((it) => ({ id: it.id, productId: it.productId, image: it.image, number: it.number, productType: it.productType, kind: it.kind, grader: it.grader, grade: it.grade,
      name: it.name.replace(/\s*\(.*\)$/, ""), label: itemLabel(it), change7: it.change7 }));
  const list = tab === "wishlist" ? c.wishlist : c.owned;
  // Opened from a binder tile: the Collection tab starts filtered to that binder.
  const binderParam = String(sp?.binder || "");
  const startBinder = binderParam === "none" || c.binders.some((b) => String(b.id) === binderParam) ? binderParam : "all";

  // This week's change: today's total against the last snapshot from at least 7 days ago.
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const then = [...c.snapshots].filter((p) => String(p.day) <= weekAgo).pop();
  const week = then && then.value > 0 ? { change: summary.value - then.value, pct: (summary.value - then.value) / then.value } : null;

  // Collection is the member area's home page, so new members' setup steps and price alerts that hit show here.
  const steps = [
    ["Add a few cards to your collection", c.owned.length > 0, "/app/collection?add=1"],
    ["Set up a deal filter", profiles.some((p) => p.updatedAt > p.createdAt), "/app/deals"],
    ["Set a price alert", watches.length > 0, "/app/watches"],
  ];
  const hit = watches.filter((w) => w.status === "triggered").length;

  return (
    <>
      <h1 className="sr-only">Collection</h1>
      <CollectionHero summary={summary} week={week} adding={adding} exportAllowed={!!user.plan.collectionExport} tradeAllowed={!!user.plan.tradeAnalyzer} movers={movers}
        chart={chartSeries(c.snapshots, null)} historyDays={user.plan.collectionHistoryDays} plan={user.plan} prefs={c.prefs}
        hasCards={c.owned.length > 0} />

      {hit > 0 && (
        <Link href="/app/watches" className="notice coll-alert-hit">
          🔔 <b>{hit} price {hit === 1 ? "alert" : "alerts"}</b> hit your price. See {hit === 1 ? "it" : "them"} →
        </Link>
      )}
      {/* Shown until every step is done, or the member hides it. */}
      {steps.some((s) => !s[1]) && !c.prefs?.hideSetup && (
        <div className="start-here">
          <b>Get set up</b>
          <ol>
            {steps.map(([label, done, href], i) => (
              <li key={label} className={done ? "done" : ""}>
                <span className="start-num">{done ? "✓" : i + 1}</span>
                {done ? <span>{label}</span> : <Link href={href}>{label} →</Link>}
              </li>
            ))}
          </ol>
          <form action={hideSetup} className="start-hide"><button className="link-btn small" title="Hide this checklist">Hide</button></form>
        </div>
      )}

      {adding && (
        <div className="panel">
          <h2>Add cards</h2>
          <AddCards binders={c.binders} owned={ownedCounts(c.items)} isDemo={user.demo || !catalogLive()} autoFocus photoSearch={user.plan.photoSearch ? true : "locked"}
            photoQuota={user.plan.photoSearch ? await quotaStatus("photoSearch", user) : null} />
          {/* Other ways to add a lot at once: one short chip each (the hover title says a little more). */}
          <div className="add-more">
            <span className="small muted">More ways to add</span>
            <Link href="/app/collection/sets" className="add-chip" title="Open a set and tap every card you own"><span aria-hidden="true">▦</span> Tap cards in a set</Link>
            <Link href="/app/collection/photo" className="add-chip" title="Photograph a binder page or a spread: we find every card"><span aria-hidden="true">🖼</span> Photo of many cards</Link>
            {user.plan.collectionImport && (
              <Link href="/app/collection/import" className="add-chip" title="Bring your collection from another app or a spreadsheet"><span aria-hidden="true">⤒</span> Import a file</Link>
            )}
          </div>
        </div>
      )}

      <div className="tabs-row" role="tablist">
        <Link href="/app/collection" role="tab" aria-selected={tab === "owned"} className={tab === "owned" ? "on" : ""}>Collection <span>{c.owned.length}</span></Link>
        <Link href="/app/collection?tab=wishlist" role="tab" aria-selected={tab === "wishlist"} className={tab === "wishlist" ? "on" : ""}>♡ Wishlist <span>{c.wishlist.length}</span></Link>
        <Link href="/app/collection?tab=binders" role="tab" aria-selected={tab === "binders"} className={tab === "binders" ? "on" : ""}>▤ Binders <span>{c.binders.length}</span></Link>
      </div>
      {tab === "binders" ? <BinderTab binders={c.binders} items={c.owned} />
        : <CollectionView key={`${tab}-${startBinder}`} tab={tab} items={list} binders={c.binders} products={c.products} watched={watches.map((w) => w.productId)} isDemo={user.demo}
          initialBinder={tab === "owned" ? startBinder : "all"} />}

    </>
  );
}
