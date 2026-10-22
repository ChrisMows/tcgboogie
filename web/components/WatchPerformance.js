import Link from "next/link";
import CardThumb from "@/components/CardThumb";
import { money } from "@/lib/collection";
import { isRising, targetPrice } from "@/lib/watches";

const day = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const short = (name) => name.replace(/\s*\(.*\)$/, "");

/** How far the price still has to move to reach the target, as a share of today's price (0 = there). */
function gapOf(w) {
  const t = targetPrice(w);
  if (w.status === "triggered") return 0;
  if (!w.lastPrice || !t) return null;
  return Math.max(0, (isRising(w) ? t - w.lastPrice : w.lastPrice - t) / w.lastPrice);
}

/** Price alerts → Performance: the numbers that used to sit above the list, plus how close each alert is. */
export default function WatchPerformance({ watches, listings, plan }) {
  if (!watches.length) {
    return (
      <div className="panel muted">
        No alerts yet, so nothing to measure. <Link href="/app/watches">Add your first price alert</Link> and this page shows how close each one is to your price.
      </div>
    );
  }
  const rows = watches.map((w) => ({ ...w, gap: gapOf(w), target: targetPrice(w), up: isRising(w) }))
    .sort((a, b) => (a.gap ?? 9) - (b.gap ?? 9));
  const hit = rows.filter((w) => w.status === "triggered");
  const open = rows.filter((w) => w.status !== "triggered" && w.gap !== null);
  const closest = open[0];
  const buying = rows.filter((w) => !w.up).length;
  const ebayWatching = rows.filter((w) => w.alsoEbay && !w.up).length;
  const found = Object.values(listings).reduce((n, l) => n + l.length, 0);
  const limit = plan.maxPriceWatches;
  const recentHits = [...hit].filter((w) => w.triggeredAt).sort((a, b) => new Date(b.triggeredAt) - new Date(a.triggeredAt)).slice(0, 5);

  return (
    <>
      <div className="stats wp-stats">
        <div className="stat"><b>{watches.length}{limit !== null ? ` / ${limit}` : ""}</b><span>price alerts · {buying} buying, {watches.length - buying} selling</span></div>
        <div className="stat"><b className={hit.length ? "up" : ""}>{hit.length}</b><span>hit your price</span></div>
        <div className="stat"><b>{closest ? `${Math.round(closest.gap * 100)}%` : "—"}</b><span>{closest ? `closest: ${short(closest.name)}` : "nothing still waiting"}</span></div>
        <div className="stat"><b>{found}</b><span>eBay listings at your price · {ebayWatching} {ebayWatching === 1 ? "alert" : "alerts"} watching eBay</span></div>
      </div>

      <section className="panel">
        <h2>How close each alert is</h2>
        <div className="wp-list">
          {rows.map((w) => {
            const pctClose = w.gap === null ? 0 : Math.max(0.02, 1 - Math.min(1, w.gap));
            return (
              <Link key={w.id} href={`/app/cards/${w.productId}`} className="wp-row">
                <CardThumb item={{ image: w.image, name: w.name, number: w.number, type: w.productType }} width={34} />
                <div className="wp-main">
                  <div className="wp-top">
                    <b className="wp-name">{short(w.name)}</b>
                    <span className="small muted">{w.up ? "📈 Selling" : "📉 Buying"}</span>
                  </div>
                  <div className={`wp-bar ${w.status === "triggered" ? "hit" : ""}`} aria-hidden="true"><i style={{ width: `${pctClose * 100}%` }} /></div>
                  <div className="small muted">
                    Now {money(w.lastPrice)} · target {money(w.target)}
                    {w.status === "triggered" ? <span className="up"> · ✓ Hit{w.triggeredAt ? ` ${day(w.triggeredAt)}` : ""}</span>
                      : w.gap !== null ? <> · {Math.round(w.gap * 100)}% to go</> : <> · no price yet</>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <h2>Recent hits</h2>
        {recentHits.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>None yet. When a price reaches your target it shows up here, and we tell you right away.</p>
        ) : recentHits.map((w) => (
          <Link key={w.id} href={`/app/cards/${w.productId}`} className="mini-row">
            <CardThumb item={{ image: w.image, name: w.name, number: w.number, type: w.productType }} width={30} />
            <span className="mini-text"><b>{short(w.name)}</b><span className="small muted">{w.up ? "Sell" : "Buy"} target {money(w.target)} · hit {day(w.triggeredAt)}</span></span>
            <span className="small up">{money(w.lastPrice)}</span>
          </Link>
        ))}
      </section>
      <p className="hint">Prices come from TCGplayer and update about once a day. “% to go” is how far today&apos;s price still has to move to reach your target.</p>
    </>
  );
}
