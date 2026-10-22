import Link from "next/link";
import { billingLive } from "@/lib/billing";
import { effectivePlans, planHighlights, planRows } from "@/lib/plan-copy";

/** Free vs Premium cards plus the full comparison table (homepage #pricing). */
// What each plan includes comes from lib/plan-copy.js (the plans as Admin → Features left them).
export default async function PlanCards({ signedIn = false }) {
  const plans = await effectivePlans();
  const { free, premium } = plans;
  const lists = planHighlights(plans);
  const upgrade = signedIn ? "/app/premium" : "/login?mode=signup&plan=premium";
  return (
    <>
      <div className="plans">
        <div className="plan">
          <h3>{free.label}</h3>
          <div className="price">$0</div>
          <div className="muted">{free.tagline}</div>
          <ul>{lists.free.map((f) => <li key={f}>{f}</li>)}</ul>
          <Link href={signedIn ? "/app/collection" : "/login?mode=signup"} className="btn block">{signedIn ? "Go to my collection" : "Start free"}</Link>
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
            {lists.premium.map((f) => <li key={f}>{f}</li>)}
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
              {planRows(plans).map(([name, a, b]) => (
                <tr key={name}><td>{name}</td><td className="muted">{a}</td><td>{b}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
