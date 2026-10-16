import { PLANS } from "@/lib/plans";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Plan and billing" };

export default async function Billing() {
  const user = await requireUser();
  const premium = user.tier === "premium";
  const p = PLANS.premium;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Plan and billing</h1>
          <p>You're on the <b>{user.plan.label}</b> plan.</p>
        </div>
      </div>
      <div className="plans" style={{ margin: 0, maxWidth: "none" }}>
        {[PLANS.free, p].map((plan) => {
          const current = plan.key === user.tier;
          return (
            <div key={plan.key} className={`plan ${plan.key === "premium" ? "featured" : ""}`}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h3 style={{ flex: "none" }}>{plan.label}</h3>
                {current && <span className="badge good" style={{ flex: "none" }}>Current plan</span>}
              </div>
              <div className="price">{plan.price ? `$${plan.price}` : "$0"}{plan.price ? <small> / month</small> : null}</div>
              <ul>{plan.features.map((f) => <li key={f}>{f}</li>)}</ul>
              {plan.key === "premium" && !premium && (
                <>
                  <button className="btn primary block" disabled>Upgrade to Premium</button>
                  <div className="hint" style={{ textAlign: "center" }}>Card payments launch soon.</div>
                </>
              )}
              {plan.key === "premium" && premium && (
                <>
                  <button className="btn block" disabled>Manage subscription</button>
                  <div className="hint" style={{ textAlign: "center" }}>Billing management launches with card payments.</div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
