import Link from "next/link";
import { compActive } from "@/lib/access";
import { billingLive, billingMode, hasLiveSubscription, trialDaysFor } from "@/lib/billing";
import { PLANS } from "@/lib/plans";
import { effectivePlans, planHighlights } from "@/lib/plan-copy";
import { requireUser } from "@/lib/session";
import { startCheckout } from "../actions";

export const metadata = { title: "Premium" };

// Why someone landed here (the locked thing they tapped).
const FROM = {
  export: "CSV export is part of Premium.",
  history: "Full value history is part of Premium.",
  alerts: "Text and Discord alerts are part of Premium.",
  "collection-alerts": "Collection alerts are part of Premium.",
  filters: "More deal filters are part of Premium.",
  watches: "More price alerts are part of Premium.",
  deals: "Live deals are part of Premium.",
  grading: "The full grading check is part of Premium.",
  photo: "The photo appraiser is part of Premium.",
  "photo-search": "More search-by-picture photos are part of Premium.",
  sell: "Unlimited Sell on eBay listings are part of Premium.",
  "filter-cards": "More cards per deal filter are part of Premium.",
};


export default async function Premium({ searchParams }) {
  const user = await requireUser();
  // What Premium adds over Free, worked out from the plans as Admin → Features set them (lib/plan-copy.js).
  const perks = planHighlights(await effectivePlans()).premium.slice(0, 6);
  const sp = await searchParams;
  const price = PLANS.premium.price;
  const subscribed = hasLiveSubscription(user);
  const comped = compActive(user);
  const payments = billingLive() && !user.demo;
  const fmt = (d) => new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const trial = subscribed || comped ? 0 : trialDaysFor(user);
  const firstCharge = fmt(Date.now() + trial * 86400000);

  return (
    <div className="premium-page">
      {FROM[sp?.from] && <div className="notice accent-note">{FROM[sp.from]}</div>}

      <div className="panel premium-card">
        <div className="premium-head">
          <div className="eyebrow-sm">TCG BOOGIE PREMIUM</div>
          <div className="premium-price"><b>${price}</b><span>/month</span></div>
          <div className="small muted">plus sales tax · cancel anytime</div>
          {trial > 0 && <div className="premium-trial">Try it free for {trial} days</div>}
        </div>

        <div className="premium-body">
          <p className="premium-lead">Everything in Free, plus:</p>
          <ul className="premium-list">
            {perks.map((b) => <li key={b}><b>{b}</b></li>)}
          </ul>

          {subscribed ? (
            <div className="premium-state">
              <b>{user.subscriptionStatus === "trialing" ? "Your free trial is on 🎉" : <>You&apos;re on Premium 🎉</>}</b>
              <span className="muted">
                {user.cancelAtPeriodEnd ? <>Ends {fmt(user.currentPeriodEnd)}, then back to Free.</>
                  : user.subscriptionStatus === "trialing" && user.currentPeriodEnd ? <>First charge ${price} on {fmt(user.currentPeriodEnd)}. Cancel before then in Settings and you pay nothing.</>
                  : user.currentPeriodEnd ? <>Renews {fmt(user.currentPeriodEnd)}.</> : null}
              </span>
              <Link href="/app/account#billing" className="btn">Billing</Link>
            </div>
          ) : comped || (user.isAdmin && !user.demo && user.tier === "premium") ? (
            <div className="premium-state">
              <b>You already have Premium</b>
              <span className="muted">
                {user.isAdmin ? "Included with your admin account."
                  : user.compUnlimited ? "Complimentary, no end date." : <>Complimentary until {fmt(user.compUntil)}.</>}
              </span>
            </div>
          ) : (
            <form action={startCheckout} className="premium-form" id="enroll">
              {sp?.billing === "cancelled" && <div className="notice">Checkout cancelled. You weren&apos;t charged.</div>}
              {sp?.agree === "missing" && <div className="notice bad">Tick the box to continue.</div>}
              <label className="premium-agree">
                <input type="checkbox" name="agree" required />
                <span>I agree to the <Link href="/terms#premium" target="_blank">Terms</Link>.{" "}
                  {trial > 0 ? <>After {trial} free days, ${price}/month plus tax starting {firstCharge}, renewing monthly until I cancel.</> : "Renews monthly until I cancel."}</span>
              </label>
              <button className="btn primary premium-cta" disabled={!payments}>{trial > 0 ? `Start ${trial}-day free trial` : `Get Premium · $${price}/mo`}</button>
              {trial > 0 && <p className="hint" style={{ margin: 0, textAlign: "center" }}><b>$0 today.</b> Card required. We email you 3 days before your first charge; cancel in one click before {firstCharge} and you pay nothing.</p>}
              {payments && billingMode() === "test" && <p className="hint" style={{ margin: 0 }}>Test mode: card 4242 4242 4242 4242.</p>}
            </form>
          )}
        </div>
      </div>

      <div className="premium-facts">
        <div><b>Cancel anytime</b><span>One click in Settings.</span></div>
        <div><b>Keep what you paid for</b><span>Premium runs to the end of your paid month, then you&apos;re back on Free.</span></div>
        <div><b>Nothing is lost</b><span>Your collection and settings stay.</span></div>
      </div>

      <p className="premium-links small muted">
        <Link href="/#pricing">Compare plans</Link> · <Link href="/terms#premium">Billing &amp; cancellation terms</Link> · No refunds for partial months.
      </p>
    </div>
  );
}
