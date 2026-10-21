import Link from "next/link";
import { billingLive } from "@/lib/billing";
import { PLANS } from "@/lib/plans";

export const PLAN_ROWS = [
  ["Deals", "After the auction ends, with the last bid", "Live, while you can still bid"],
  ["How early you hear about a deal", "—", `Up to ${PLANS.premium.maxWindowMinutes} minutes before it ends`],
  ["Smallest discount we alert", `${PLANS.free.minDiscountFloor}% below market`, `${PLANS.premium.minDiscountFloor}% below market`],
  ["Card values covered", `$${PLANS.free.minValueFloor}+`, `$${PLANS.premium.minValueFloor}+`],
  ["Deal filters", String(PLANS.free.maxProfiles), String(PLANS.premium.maxProfiles)],
  ["Deal alerts by text, Discord and email", "—", "✓"],
  ["Price alerts (buying or selling)", String(PLANS.free.maxPriceWatches), "Unlimited"],
  ["Price alerts by email", "✓", "✓"],
  ["Price alerts by text and Discord", "—", "✓"],
  ["eBay listing alerts: when a watched card is listed at or under your price", "✓", "✓"],
  ["Photo check on every deal", "✓", "✓"],
  ["Collection tracker (unlimited cards, daily values, sets, wishlist)", "✓", "✓"],
  ["Deal alerts on cards missing from your sets or on your wishlist", "—", "✓"],
  ["Collection value history", `Last ${PLANS.free.collectionHistoryDays} days`, "All time"],
  ["Collection import from CSV (TCGplayer, Collectr, PriceCharting)", "✓", "✓"],
  ["Collection CSV export", "—", "✓"],
  ["Grading check: which of your cards are worth grading", "Top 3", "✓"],
  ["Photo appraiser: snap your cards, get names and values, add them in one tap", "—", "✓"],
  ["Sell on eBay from your collection", "✓", "✓"],
  ["Graded and raw cards", "✓", "✓"],
  ["Japanese cards", "—", "✓"],
  ["Sell-high alerts when cards you own jump in price", "—", "✓"],
  ["Email recap: collection value, movers, deals and alerts", "Weekly", "Daily or weekly"],
];

/** Free vs Premium cards plus the full comparison table (homepage #pricing). */
export default function PlanCards({ signedIn = false }) {
  const { free, premium } = PLANS;
  const upgrade = signedIn ? "/app/premium" : "/login?mode=signup&plan=premium";
  return (
    <>
      <div className="plans">
        <div className="plan">
          <h3>{free.label}</h3>
          <div className="price">$0</div>
          <div className="muted">{free.tagline}</div>
          <ul>{free.features.map((f) => <li key={f}>{f}</li>)}</ul>
          <Link href={signedIn ? "/app" : "/login?mode=signup"} className="btn block">{signedIn ? "Go to dashboard" : "Start free"}</Link>
        </div>
        <div className="plan featured">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 style={{ flex: "none" }}>{premium.label}</h3>
            <span className="badge accent" style={{ flex: "none" }}>Most popular</span>
          </div>
          <div className="price">${premium.price}<small> / month</small></div>
          <div className="tax-note">Plus applicable sales tax</div>
          <div className="muted">{premium.tagline}</div>
          <ul>
            <li className="plus-all">Everything in Free, plus:</li>
            {premium.features.map((f) => <li key={f}>{f}</li>)}
          </ul>
          <Link href={upgrade} className="btn primary block">Get Premium</Link>
          <div className="hint" style={{ textAlign: "center" }}>Cancel anytime.{billingLive() ? " Secure checkout by Stripe." : " Card payments launch soon."}</div>
        </div>
      </div>
      <details className="compare-all">
        <summary>Compare every feature</summary>
        <div className="table-wrap">
          <table className="list">
            <thead><tr><th>Feature</th><th>Free</th><th>Premium</th></tr></thead>
            <tbody>
              {PLAN_ROWS.map(([name, a, b]) => (
                <tr key={name}><td>{name}</td><td className="muted">{a}</td><td>{b}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
