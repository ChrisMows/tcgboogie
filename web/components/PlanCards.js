import Link from "next/link";
import { billingLive } from "@/lib/billing";
import ComparePlans from "@/components/ComparePlans";
import { effectivePlans, planGroups, planHighlights, trialDays, ULTRA_PERKS } from "@/lib/plan-copy";

/** Free, Premium and Ultra cards plus the full comparison in a pop-up (homepage #pricing). */
// What each plan includes comes from lib/plan-copy.js (the plans as Admin → Features left them).
export default async function PlanCards({ signedIn = false }) {
  const plans = await effectivePlans();
  const { free, premium, ultra } = plans;
  const lists = planHighlights(plans);
  const trial = billingLive() ? trialDays(plans) : 0;
  const upgrade = signedIn ? "/app/premium" : "/login?mode=signup&plan=premium";
  const toUltra = signedIn ? "/app/ultra" : "/login?mode=signup&next=%2Fapp%2Fultra";
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
          {trial > 0 && <div className="premium-trial">{trial} days free for new members</div>}
          <ul>
            <li className="plus-all">Everything in Free, plus:</li>
            {lists.premium.map((f) => <li key={f}>{f}</li>)}
          </ul>
          <Link href={upgrade} className="btn primary block">{trial > 0 ? `Try Premium free for ${trial} days` : "Get Premium"}</Link>
          <div className="hint" style={{ textAlign: "center" }}>
            {trial > 0 ? `$0 today, card required. Cancel before day ${trial} and you pay nothing; we email you 3 days before.` : "Cancel anytime."}
            {billingLive() ? " Secure checkout by Stripe." : " Card payments launch soon."}
          </div>
        </div>
        <div className="plan">
          <h3>{ultra.label}</h3>
          <div className="price">${ultra.price}<small> / month</small></div>
          <div className="tax-note">Plus applicable sales tax</div>
          <div className="muted">{ultra.tagline}</div>
          {trial > 0 && <div className="premium-trial">{trial} days free for new members</div>}
          <ul>
            <li className="plus-all">Everything in Premium, plus:</li>
            {ULTRA_PERKS.map((f) => <li key={f}>{f}</li>)}
          </ul>
          <Link href={toUltra} className="btn block">{trial > 0 ? `Try Ultra free for ${trial} days` : "Get Ultra"}</Link>
        </div>
      </div>
      <div className="compare-all">
        <ComparePlans groups={planGroups(plans)} free={{ label: free.label }} premium={{ label: premium.label, price: premium.price }} ultra={{ label: ultra.label, price: ultra.price, perks: ULTRA_PERKS }}
          trial={trial} signedIn={signedIn} label="Compare every feature" />
      </div>
    </>
  );
}
