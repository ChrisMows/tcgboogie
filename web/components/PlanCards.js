import Link from "next/link";
import { billingLive } from "@/lib/billing";
import { PLANS } from "@/lib/plans";

const rows = [
  ["Deals", "After the auction ends, with the sale price", "Live, while you can still bid"],
  ["Instant alerts by text and Discord", "—", "✓"],
  ["Price alerts by email", "✓", "✓"],
  ["Filter profiles", "1", "15"],
  ["Lowest discount you can set", `${PLANS.free.minDiscountFloor}% below market`, `${PLANS.premium.minDiscountFloor}% below market`],
  ["How early before the auction ends", `Up to ${PLANS.free.maxWindowMinutes} minutes`, `Up to ${PLANS.premium.maxWindowMinutes} minutes`],
  ["Card values covered", `$${PLANS.free.minValueFloor}+`, `$${PLANS.premium.minValueFloor}+`],
  ["TCGplayer price-drop watches", "5", "Unlimited"],
  ["eBay listing alerts for watched cards", "✓", "✓"],
  ["Collection tracker (unlimited cards, daily values, sets, wishlist)", "✓", "✓"],
  ["Collection value history", `Last ${PLANS.free.collectionHistoryDays} days`, "All time"],
  ["Collection CSV export", "—", "✓"],
  ["Deals on cards missing from your sets, sell-high alerts", "—", "✓"],
  ["Graded and raw cards", "✓", "✓"],
  ["Japanese cards", "—", "✓"],
  ["Email recap", "Weekly", "Daily"],
  ["Community Discord", "✓", "✓"],
];

/** Free vs Premium cards plus the full comparison table (homepage #pricing). */
export default function PlanCards({ signedIn = false }) {
  const { free, premium } = PLANS;
  const upgrade = signedIn ? "/app/account#plan" : "/login?mode=signup&plan=premium";
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
              {rows.map(([name, a, b]) => (
                <tr key={name}><td>{name}</td><td className="muted">{a}</td><td>{b}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
