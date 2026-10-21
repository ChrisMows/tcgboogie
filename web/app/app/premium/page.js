import Link from "next/link";
import { compActive } from "@/lib/access";
import { billingLive, billingMode, hasLiveSubscription } from "@/lib/billing";
import { PLANS } from "@/lib/plans";
import { requireUser } from "@/lib/session";
import { openBillingPortal, startCheckout } from "../actions";

export const metadata = { title: "Premium" };

// Why someone landed here (the locked thing they tapped).
const FROM = {
  export: "CSV export is part of Premium.",
  history: "Full value history is part of Premium.",
  alerts: "Text and Discord alerts are part of Premium.",
  "collection-alerts": "Collection alerts are part of Premium.",
  filters: "More deal filters are part of Premium.",
  watches: "Unlimited price alerts are part of Premium.",
  deals: "Live deals are part of Premium.",
  grading: "The full grading check is part of Premium.",
};

// The five things that matter, in a few words each.
const PERKS = [
  ["Every deal live", "while you can still bid"],
  ["Text & Discord alerts", "plus email"],
  ["Unlimited price alerts", `Free has ${PLANS.free.maxPriceWatches}`],
  [`${PLANS.premium.maxProfiles} deal filters`, "Japanese cards, earlier and deeper deals"],
  ["Full collection tools", "grading check, set-completion deals, all-time history"],
];

export default async function Premium({ searchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const price = PLANS.premium.price;
  const subscribed = hasLiveSubscription(user);
  const comped = compActive(user);
  const payments = billingLive() && !user.demo;
  const fmt = (d) => new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="premium-page">
      {FROM[sp?.from] && <div className="notice accent-note">{FROM[sp.from]}</div>}

      <div className="panel premium-card">
        <div className="premium-head">
          <div className="eyebrow-sm">TCG BOOGIE PREMIUM</div>
          <div className="premium-price"><b>${price}</b><span>/month</span></div>
          <div className="small muted">plus sales tax · cancel anytime</div>
        </div>

        <div className="premium-body">
          <p className="premium-lead">Everything in Free, plus:</p>
          <ul className="premium-list">
            {PERKS.map(([b, s]) => <li key={b}><b>{b}</b> <span className="muted">{s}</span></li>)}
          </ul>

          {subscribed ? (
            <div className="premium-state">
              <b>You&apos;re on Premium 🎉</b>
              <span className="muted">
                {user.cancelAtPeriodEnd ? <>Ends {fmt(user.currentPeriodEnd)}, then back to Free.</>
                  : user.currentPeriodEnd ? <>Renews {fmt(user.currentPeriodEnd)}.</> : null}
              </span>
              <form action={openBillingPortal}><button className="btn">Manage billing</button></form>
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
                <span>I agree to the <Link href="/terms#premium" target="_blank">Terms</Link>. Renews monthly until I cancel.</span>
              </label>
              <button className="btn primary premium-cta" disabled={!payments}>Get Premium · ${price}/mo</button>
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
