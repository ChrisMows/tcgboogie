import Link from "next/link";
import { compActive } from "@/lib/access";
import { billingLive, billingMode, hasLiveSubscription, trialDaysFor } from "@/lib/billing";
import { PLANS } from "@/lib/plans";
import { ULTRA_PERKS } from "@/lib/plan-copy";
import { requireUser } from "@/lib/session";
import { changePlanAction, startCheckout } from "../actions";

export const metadata = { title: "Ultra" };

const fmt = (d) => new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

/** The Ultra plan: join it, move up from Premium, or (already on it) see it and move down. */
export default async function Ultra({ searchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const price = PLANS.ultra.price;
  const subscribed = hasLiveSubscription(user);
  const onUltra = subscribed && Boolean(user.ultra);
  const payments = billingLive() && !user.demo;
  const trialing = subscribed && user.subscriptionStatus === "trialing";
  const trial = subscribed || compActive(user) ? 0 : trialDaysFor(user);
  const firstCharge = fmt(Date.now() + trial * 86400000);
  const included = user.isAdmin && !user.demo;

  return (
    <div className="premium-page">
      {sp?.from === "grading-finder" && <div className="notice accent-note">Grade &amp; Flip is part of Ultra.</div>}
      {sp?.billing === "declined" && <div className="notice bad">Your card didn&apos;t go through, so nothing changed. Update it under <Link href="/app/account#billing">Billing</Link> and try again.</div>}

      <div className="panel premium-card">
        <div className="premium-head">
          <div className="eyebrow-sm">TCG BOOGIE ULTRA</div>
          <div className="premium-price"><b>${price}</b><span>/month</span></div>
          <div className="small muted">plus sales tax · cancel anytime</div>
          {trial > 0 && <div className="premium-trial">Try it free for {trial} days</div>}
        </div>

        <div className="premium-body">
          <p className="premium-lead">Everything in <Link href="/app/premium">Premium</Link>, plus:</p>
          <ul className="premium-list">
            {ULTRA_PERKS.map((b) => <li key={b}><b>{b}</b></li>)}
          </ul>

          {onUltra ? (
            <div className="premium-state">
              <b>{trialing ? "Your free trial is on 🎉" : <>You&apos;re on Ultra 🎉</>}</b>
              <span className="muted">
                {user.cancelAtPeriodEnd ? <>Ends {fmt(user.currentPeriodEnd)}, then back to Free.</>
                  : trialing && user.currentPeriodEnd ? <>First charge ${price} on {fmt(user.currentPeriodEnd)}. Cancel before then in Settings and you pay nothing.</>
                  : user.currentPeriodEnd ? <>Renews {fmt(user.currentPeriodEnd)}.</> : null}
              </span>
              <div className="row" style={{ gap: 8, justifyContent: "center" }}>
                <Link href="/app/grade-and-flip" className="btn primary">Open Grade &amp; Flip</Link>
                <Link href="/app/account#billing" className="btn">Billing</Link>
              </div>
              <form action={changePlanAction}>
                <input type="hidden" name="plan" value="premium" />
                <button className="link-btn small">Move down to Premium (${PLANS.premium.price}/month)</button>
              </form>
            </div>
          ) : included ? (
            <div className="premium-state">
              <b>Ultra is included with your admin account</b>
              <Link href="/app/grade-and-flip" className="btn primary">Open Grade &amp; Flip</Link>
            </div>
          ) : subscribed ? (
            <form action={changePlanAction} className="premium-form" id="enroll">
              <input type="hidden" name="plan" value="ultra" />
              {sp?.agree === "missing" && <div className="notice bad">Tick the box to continue.</div>}
              <label className="premium-agree">
                <input type="checkbox" name="agree" required />
                <span>I agree to the <Link href="/terms#premium" target="_blank">Terms</Link>.{" "}
                  {trialing
                    ? <>My free trial carries on, then ${price}/month plus tax{user.currentPeriodEnd ? <> starting {fmt(user.currentPeriodEnd)}</> : null}, renewing monthly until I cancel.</>
                    : <>I&apos;m charged the difference for the rest of this billing month today, then ${price}/month plus tax, renewing monthly until I cancel.</>}
                </span>
              </label>
              <button className="btn primary premium-cta" disabled={!payments}>Upgrade to Ultra</button>
            </form>
          ) : (
            <form action={startCheckout} className="premium-form" id="enroll">
              <input type="hidden" name="plan" value="ultra" />
              {sp?.billing === "cancelled" && <div className="notice">Checkout cancelled. You weren&apos;t charged.</div>}
              {sp?.agree === "missing" && <div className="notice bad">Tick the box to continue.</div>}
              <label className="premium-agree">
                <input type="checkbox" name="agree" required />
                <span>I agree to the <Link href="/terms#premium" target="_blank">Terms</Link>.{" "}
                  {trial > 0 ? <>After {trial} free days, ${price}/month plus tax starting {firstCharge}, renewing monthly until I cancel.</> : "Renews monthly until I cancel."}</span>
              </label>
              <button className="btn primary premium-cta" disabled={!payments}>{trial > 0 ? `Start ${trial}-day free trial` : `Get Ultra · $${price}/mo`}</button>
              {trial > 0 && <p className="hint" style={{ margin: 0, textAlign: "center" }}><b>$0 today.</b> Card required. We email you 3 days before your first charge; cancel in one click before {firstCharge} and you pay nothing.</p>}
              {payments && billingMode() === "test" && <p className="hint" style={{ margin: 0 }}>Test mode: card 4242 4242 4242 4242.</p>}
            </form>
          )}
        </div>
      </div>

      <div className="premium-facts">
        <div><b>Cancel anytime</b><span>One click in Settings.</span></div>
        <div><b>Keep what you paid for</b><span>Ultra runs to the end of your paid month, then you&apos;re back on Free.</span></div>
        <div><b>Nothing is lost</b><span>Your collection and settings stay.</span></div>
      </div>

      <p className="premium-links small muted">
        <Link href="/#pricing">Compare plans</Link> · <Link href="/terms#premium">Billing &amp; cancellation terms</Link> · No refunds for partial months.
      </p>
    </div>
  );
}
