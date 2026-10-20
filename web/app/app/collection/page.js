import Link from "next/link";
import AddCards from "@/components/AddCards";
import CardThumb from "@/components/CardThumb";
import CollectionAlerts from "@/components/CollectionAlerts";
import CollectionView from "@/components/CollectionView";
import ValueChart from "@/components/ValueChart";
import { catalogLive, listSets } from "@/lib/catalog";
import { chartSeries, itemLabel, money, ownedCounts, pct, unitValue } from "@/lib/collection";
import { loadCollection } from "@/lib/portfolio";
import { requireUser } from "@/lib/session";
import * as store from "@/lib/store";

export const metadata = { title: "Collection" };

export default async function CollectionPage({ searchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab = sp?.tab === "wishlist" ? "wishlist" : "owned";
  const adding = sp?.add === "1";
  const c = await loadCollection(user);
  const watches = await store.listWatches(user.id);
  const sets = await listSets().catch(() => []);
  const { summary } = c;


  // Sets you've started, by how much of each you own (set sizes come from the set list, so this costs nothing).
  const bySet = {};
  for (const it of c.owned) if (it.productType === "card") (bySet[it.setName] ||= new Set()).add(it.productId);
  const started = Object.entries(bySet).map(([name, ids]) => {
    const s = sets.find((x) => x.name === name);
    const total = s?.total || s?.printedTotal || null;
    return { name, have: ids.size, total, pct: total ? Math.min(1, ids.size / total) : null };
  }).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0)).slice(0, 4);

  const movers = c.owned.filter((it) => it.change7 !== null && Math.abs(it.change7) >= 0.005 && unitValue(it) !== null)
    .sort((a, b) => Math.abs(b.change7 * unitValue(b) * b.quantity) - Math.abs(a.change7 * unitValue(a) * a.quantity)).slice(0, 4);
  const list = tab === "wishlist" ? c.wishlist : c.owned;
  const wishValue = c.wishlist.reduce((s, it) => s + (unitValue(it) ?? 0), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Collection</h1>
          <p>What you own, what it&apos;s worth, updated daily.</p>
        </div>
        <div className="head-actions">
          <Link href={adding ? "/app/collection" : "/app/collection?add=1"} className="btn primary">{adding ? "Done adding" : "+ Add cards"}</Link>
          <Link href="/app/collection/sets" className="btn">Browse sets</Link>
          {user.plan.collectionExport
            ? <a href="/app/collection/export" className="btn" download>Export CSV</a>
            : <Link href="/app/account#plan" className="btn" title="CSV export is a Premium feature">Export CSV 🔒</Link>}
        </div>
      </div>

      {adding && (
        <div className="panel">
          <h2>Add cards</h2>
          <AddCards binders={c.binders} owned={ownedCounts(c.items)} isDemo={user.demo || !catalogLive()} autoFocus />
          <p className="hint" style={{ marginBottom: 0 }}>
            Adding a lot from one set? <Link href="/app/collection/sets">Open the set</Link> and tap every card you own. It&apos;s much faster.
          </p>
        </div>
      )}

      <CollectionAlerts plan={user.plan} prefs={c.prefs} />

      {c.owned.length > 0 && (
        <>
          <div className="panel coll-chart">
            <ValueChart points={chartSeries(c.snapshots, null)} historyDays={user.plan.collectionHistoryDays} />
            {summary.unpriced > 0 && <p className="hint" style={{ marginBottom: 0 }}>{summary.unpriced} {summary.unpriced === 1 ? "copy has" : "copies have"} no market value yet, so {summary.unpriced === 1 ? "it isn't" : "they aren't"} counted. You can set your own value from Edit.</p>}
          </div>
          <div className="coll-cards">
            <div className="panel" style={{ marginBottom: 0 }}>
              <h2>Biggest movers · 7 days</h2>
              {movers.length === 0 ? <p className="small muted" style={{ margin: 0 }}>No big moves this week.</p> : movers.map((it) => (
                <Link key={it.id} href={`/app/cards/${it.productId}`} className="mini-row">
                  <CardThumb item={it} width={30} />
                  <span className="mini-text"><b>{it.name.replace(/\s*\(.*\)$/, "")}</b><span className="small muted">{itemLabel(it)}</span></span>
                  <span className={`small ${it.change7 >= 0 ? "up" : "down"}`}>{it.change7 >= 0 ? "▲" : "▼"} {pct(it.change7)}</span>
                </Link>
              ))}
            </div>
            <div className="panel" style={{ marginBottom: 0 }}>
              <h2>Your sets</h2>
              {started.length === 0 ? <p className="small muted" style={{ margin: 0 }}>Add a card to start tracking a set.</p> : started.map((s) => (
                <Link key={s.name} href={`/app/collection/sets/${encodeURIComponent(s.name)}`} className="set-progress">
                  <span className="row" style={{ justifyContent: "space-between" }}><b style={{ flex: "none" }}>{s.name}</b><span className="small muted" style={{ flex: "none" }}>{s.have}{s.total ? ` / ${s.total}` : ""}</span></span>
                  <span className="bar"><i style={{ width: `${Math.max(2, (s.pct ?? 0) * 100)}%` }} /></span>
                </Link>
              ))}
              <Link href="/app/collection/sets" className="small">All sets →</Link>
            </div>
            <div className="panel" style={{ marginBottom: 0 }}>
              <h2>Wishlist</h2>
              <p className="small muted" style={{ margin: "0 0 8px" }}>
                {c.wishlist.length === 0 ? "Nothing on it yet. Tap ♡ Wishlist on any card page."
                  : `${c.wishlist.length} ${c.wishlist.length === 1 ? "card" : "cards"} · ${money(wishValue, 0)} to get them all`}
              </p>
              <Link href="/app/collection?tab=wishlist" className="small">Open wishlist →</Link>
            </div>
          </div>
        </>
      )}

      <div className="tabs-row" role="tablist">
        <Link href="/app/collection" role="tab" aria-selected={tab === "owned"} className={tab === "owned" ? "on" : ""}>Collection <span>{c.owned.length}</span></Link>
        <Link href="/app/collection?tab=wishlist" role="tab" aria-selected={tab === "wishlist"} className={tab === "wishlist" ? "on" : ""}>♡ Wishlist <span>{c.wishlist.length}</span></Link>
      </div>
      <CollectionView key={tab} tab={tab} items={list} binders={c.binders} products={c.products} watched={watches.map((w) => w.productId)} isDemo={user.demo} />

    </>
  );
}
