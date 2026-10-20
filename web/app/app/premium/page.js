import Link from "next/link";
import { PLAN_ROWS } from "@/components/PlanCards";
import { compActive } from "@/lib/access";
import { billingLive, billingMode, hasLiveSubscription } from "@/lib/billing";
import { PLANS } from "@/lib/plans";
import { requireUser } from "@/lib/session";
import { TERMS_UPDATED } from "@/lib/terms";
import { openBillingPortal, startCheckout } from "../actions";

export const metadata = { title: "Premium" };

// Why someone landed here (the locked thing they tapped).
const FROM = {
  export: "CSV export of your collection is part of Premium.",
  history: "Your full collection value history is part of Premium.",
  alerts: "Text and Discord alerts are part of Premium.",
  "collection-alerts": "Deals on cards missing from your sets and sell-high alerts are part of Premium.",
  filters: "More deal filters, earlier and deeper deals are part of Premium.",
  watches: "Unlimited price alerts are part of Premium.",
  deals: "Live deals, while you can still bid, are part of Premium.",
};

// What each Premium feature means, in a sentence.
const PERKS = [
  ["⚡", "Every deal live", "See underpriced eBay auctions while you can still bid, not after they end."],
  ["📱", "Instant alerts everywhere", "Deals and price alerts by text message and Discord, as well as email."],
  ["🔔", "Unlimited price alerts", `Watch as many cards as you like for buying or selling (Free has ${PLANS.free.maxPriceWatches}).`],
  ["🎯", `${PLANS.premium.maxProfiles} deal filters`, "Japanese cards, earlier alerts before auctions end, and deeper discounts."],
  ["📈", "Full collection history", "Your collection's value over all time, CSV export, and sell-high alerts."],
  ["🧩", "Set-completion deals", "Deals on the exact cards missing from sets you're building or on your wishlist."],
];

export default async function Premium({ searchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { free, premium } = PLANS;
  const subscribed = hasLiveSubscription(user);
  const comped = compActive(user);
  const payments = billingLive() && !user.demo;
  const fmt = (d) => new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="premium-page">
      <section className="panel premium-hero">
        <div>
          <div className="eyebrow-sm">TCG BOOGIE PREMIUM</div>
          <h1>Every deal, while there&apos;s still time.</h1>
          <p className="muted">Everything in Free, plus live deals, instant alerts on every channel, and the full collection toolkit.</p>
          {FROM[sp?.from] && <div className="notice accent-note" style={{ marginTop: 12 }}>{FROM[sp.from]}</div>}
        </div>
        <div className="premium-price">
          <b>${premium.price}</b><span>/ month</span>
          <small>Plus applicable sales tax · Cancel anytime</small>
        </div>
      </section>

      <section className="premium-perks">
        {PERKS.map(([icon, title, body]) => (
          <div key={title} className="panel premium-perk">
            <span className="premium-perk-icon" aria-hidden="true">{icon}</span>
            <b>{title}</b>
            <p className="small muted">{body}</p>
          </div>
        ))}
      </section>

      <details className="panel compare-all premium-compare">
        <summary>Compare Free and Premium, feature by feature</summary>
        <div className="table-wrap">
          <table className="list">
            <thead><tr><th>Feature</th><th>{free.label}</th><th>{premium.label}</th></tr></thead>
            <tbody>{PLAN_ROWS.map(([name, a, b]) => <tr key={name}><td>{name}</td><td className="muted">{a}</td><td>{b}</td></tr>)}</tbody>
          </table>
        </div>
      </details>

      <section className="premium-grid">
        <div className="panel">
          <h2>How billing works</h2>
          <ul className="premium-terms">
            <li><b>${premium.price} a month, plus tax.</b> Sales tax depends on where you live; you see the exact total before you pay.</li>
            <li><b>Renews monthly.</b> You&apos;re charged today, then on the same date each month until you cancel.</li>
            <li><b>Secure checkout by Stripe.</b> We never see or store your card number.</li>
            <li><b>Cancel anytime</b> in Settings → Plan, in one click. No calls, no forms.</li>
          </ul>
        </div>
        <div className="panel">
          <h2>If you cancel</h2>
          <ul className="premium-terms">
            <li><b>You keep Premium until your paid period ends.</b> Cancel on day 3 or day 29: you still get the rest of the month you paid for.</li>
            <li><b>Then you&apos;re back on Free, automatically.</b> No further charges. Your collection, alerts and settings stay; Premium-only features switch off.</li>
            <li><b>No partial refunds</b> for the month you cancel in, except where the law requires one. Charged by mistake? Email <a href="mailto:support@tcgboogie.com">support@tcgboogie.com</a>.</li>
            <li><b>Change your mind?</b> Turn renewal back on anytime before the period ends.</li>
          </ul>
        </div>
      </section>

      <section className="panel premium-enroll" id="enroll">
        {subscribed ? (
          <>
            <h2>You&apos;re on Premium 🎉</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              {user.cancelAtPeriodEnd
                ? <>Cancelled: Premium stays on until <b>{fmt(user.currentPeriodEnd)}</b>, then you&apos;re on Free.</>
                : user.currentPeriodEnd ? <>Renews <b>{fmt(user.currentPeriodEnd)}</b>.</> : null}
            </p>
            <div className="row" style={{ gap: 8 }}>
              <Link href="/app/account#plan" className="btn" style={{ flex: "none" }}>Plan settings</Link>
              <form action={openBillingPortal} style={{ flex: "none" }}><button className="btn">Manage billing</button></form>
            </div>
          </>
        ) : comped || (user.isAdmin && !user.demo && user.tier === "premium") ? (
          <>
            <h2>You already have Premium</h2>
            <p className="muted" style={{ margin: 0 }}>
              {user.isAdmin ? "Admin account: Premium is included. Switch the admin bar to Free to try the sign-up." :
                user.compUnlimited ? "Complimentary Premium, no end date. You won't be charged." :
                  <>Complimentary Premium until <b>{fmt(user.compUntil)}</b>. You won&apos;t be charged.</>}
            </p>
          </>
        ) : (
          <form action={startCheckout}>
            <h2>Start Premium</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              ${premium.price}/month plus applicable sales tax, billed monthly until you cancel.
            </p>
            {sp?.billing === "cancelled" && <div className="notice">Checkout cancelled. You weren&apos;t charged.</div>}
            {sp?.agree === "missing" && <div className="notice bad">Please tick the box to agree to the terms first.</div>}
            <label className="check premium-agree">
              <input type="checkbox" name="agree" required />
              <span>
                I agree to the <Link href="/terms" target="_blank">Terms of Service</Link> (updated {TERMS_UPDATED}), including the
                subscription and cancellation terms above. I understand Premium renews every month until I cancel.
              </span>
            </label>
            <div className="row" style={{ gap: 12, alignItems: "center", marginTop: 14 }}>
              <button className="btn primary" style={{ flex: "none" }} disabled={!payments}>Continue to secure checkout →</button>
              <span className="small muted" style={{ flex: "1 1 200px" }}>
                {payments ? "You'll review the total, including tax, on Stripe before you pay." : "Card payments aren't available right now."}
              </span>
            </div>
            {payments && billingMode() === "test" && (
              <p className="hint" style={{ marginBottom: 0 }}>Test mode: no real money. Use card 4242 4242 4242 4242, any future date, any CVC.</p>
            )}
          </form>
        )}
      </section>
    </div>
  );
}
