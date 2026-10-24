import Link from "next/link";
import RevealSetting from "@/components/RevealSetting";
import { enabledProviders } from "@/auth";
import { demoMode, requireUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { logError } from "@/lib/log";
import { ebayAccount, ebaySellReady } from "@/lib/ebay-sell";
import { billingDetails, billingLive, billingMode, confirmCheckout, hasLiveSubscription, trialDaysFor } from "@/lib/billing";
import { changeRenewal, connectProvider, deleteAccount, disconnectEbay, openBillingPortal, disconnectProvider, refreshPicture, removePhone, saveName, savePreferences, sendPhoneCode, setAvatar, verifyPhoneCode } from "../actions";
import { channelsReady } from "@/lib/notify";
import { AVATAR_SOURCES, avatarFor, avatarOptions, initials } from "@/lib/avatar";
import { PLANS } from "@/lib/plans";
import { effectivePlans, planHighlights } from "@/lib/plan-copy";
import { compActive } from "@/lib/access";

export const metadata = { title: "Settings" };

const SMS_NOTES = {
  sent: "Code sent. It expires in 10 minutes.",
  verified: "Number confirmed. Text alerts are on.",
  removed: "Number removed. No more texts.",
  badcode: "That code didn't match or has expired. Try again, or send a new one.",
  badnumber: "That doesn't look like a US or Canadian mobile number. Use 10 digits, like (555) 123-4567.",
  consent: "Tick the box to agree to receive texts.",
  wait: "A code was just sent. Wait a minute before asking for another.",
  failed: "We couldn't send a text to that number. Check it and try again.",
  toomany: "That's a lot of codes for one day. Try again tomorrow, or email support@tcgboogie.com.",
  unavailable: "Text alerts aren't switched on yet.",
  premium: "Text alerts are a Premium feature.",
};

const PROVIDER_LABELS = { google: "Google", discord: "Discord", email: "Email link" };
const METHODS = ["google", "discord", "email"];

const fmt = (d) => new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const EBAY_NOTES = {
  connected: ["good", "eBay connected. Open any card in your collection and tap Sell on eBay."],
  declined: ["warn", "eBay wasn't connected (access wasn't allowed). You can try again anytime."],
  failed: ["bad", "We couldn't connect eBay. Please try again; if it keeps failing, email support@tcgboogie.com."],
  unavailable: ["warn", "eBay selling isn't available yet."],
  disconnected: ["good", "eBay disconnected. We've deleted the access eBay gave us."],
};
const BILLING_NOTES = {
  welcome: ["good", "Welcome to Premium! Stripe emails your receipt, and every receipt is under Billing below."],
  pending: ["warn", "Payment received by Stripe. Your Premium switches on within a minute; refresh this page if it hasn't yet."],
  cancelled: ["", "Checkout cancelled. You weren't charged."],
  already: ["", "You already have Premium. Change your card or cancel under Billing below."],
  "cancelled-renewal": ["good", "Done. Premium stays on until the end of the month you've paid for, and you won't be charged again."],
  "cancelled-trial": ["good", "Done. Your trial is cancelled and you won't be charged. Premium stays on until the trial's last day."],
  renewing: ["good", "Great, your Premium will keep renewing."],
  slow: ["warn", "Too many tries in a short time. Please wait a few minutes."],
  off: ["warn", "Card payments aren't available right now."],
  error: ["bad", "We couldn't reach our payment provider. Please try again in a minute."],
};

export default async function Account({ searchParams }) {
  const user = await requireUser();
  const premiumPerks = planHighlights(await effectivePlans()).premium; // what Premium adds, as Admin → Features set it
  const params = await searchParams;
  const premium = user.tier === "premium";
  const canDiscord = user.plan.watchAlertChannels.includes("discord"); // Admin → Features
  const canSms = user.plan.watchAlertChannels.includes("sms");
  const pictures = avatarOptions(user);
  const smsReady = channelsReady().sms;
  const current = avatarFor(user);

  // Back from Stripe Checkout: confirm the payment right away (the webhook does the same a moment later).
  if (params?.billing === "success" && params?.session_id && !user.demo) {
    let ok = false;
    try { ok = await confirmCheckout(user, params.session_id); } catch (e) { await logError("payments", "Couldn't confirm checkout", e, { session: params.session_id }, user.id); }
    redirect(`/app/account?billing=${ok ? "welcome" : "pending"}#plan`);
  }
  const payments = billingLive() && !user.demo;
  const ebay = user.demo ? null : await ebayAccount(user.id).catch(() => null);
  const ebayReady = ebaySellReady() && !user.demo;
  const testMode = billingMode() === "test";
  const subscribed = hasLiveSubscription(user);
  // Admins can test checkout while previewing as Free; comped members don't need to pay.
  const showUpgrade = !premium && !compActive(user);
  const periodEnd = user.currentPeriodEnd ? fmt(user.currentPeriodEnd) : null;
  const trialing = subscribed && user.subscriptionStatus === "trialing";
  const trialOffer = showUpgrade && payments ? trialDaysFor(user) : 0;
  const bill = payments && user.stripeCustomerId ? await billingDetails(user) : null;
  const money = (v) => `$${Number(v || 0).toFixed(2)}`;
  const billingNote = params?.billing === "welcome" && trialing
    ? ["good", `Your free trial has started! Your first charge is ${periodEnd}; cancel before then and you pay nothing. We'll email you 3 days before.`]
    : BILLING_NOTES[params?.billing];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Your plan, how alerts reach you, connected accounts and your profile.</p>
        </div>
      </div>

      <div className={`panel plan-panel ${premium ? "is-premium" : ""}`} id="plan">
        <div className="plan-panel-head">
          <div>
            <div className="small muted">Your plan</div>
            <div className="plan-panel-name">
              {subscribed ? "Premium" : user.plan.label}{" "}
              {subscribed && user.subscriptionStatus === "past_due" ? <span className="badge warn">Payment due</span>
                : subscribed && user.cancelAtPeriodEnd ? <span className="badge">Ending</span>
                : trialing ? <span className="badge accent">Free trial</span>
                : premium || subscribed ? <span className="badge accent">Active</span> : null}
            </div>
            <div className="small muted">
              {subscribed ? (
                user.cancelAtPeriodEnd
                  ? <>Cancelled. You keep Premium until <b>{periodEnd}</b>, then you&apos;re on Free. No more charges.</>
                  : trialing ? <>Free until <b>{periodEnd}</b>, then ${PLANS.premium.price}/month + tax</>
                  : <>${PLANS.premium.price}/month + tax{periodEnd ? <> · renews <b>{periodEnd}</b></> : null}</>
              ) : user.isAdmin && !user.demo ? <>Admin account: Premium included. Previewing as <b>{user.plan.label}</b> (switch in the admin bar).</>
                : compActive(user) ? <>Complimentary Premium{user.compUnlimited ? ", no end date" : ` until ${fmt(user.compUntil)}`}. You won&apos;t be charged.</>
                : premium ? `$${PLANS.premium.price}/month` : "Free forever."}
              {subscribed && user.isAdmin && !user.demo && !premium ? <> · previewing the site as <b>Free</b></> : null}
            </div>
          </div>
          {subscribed ? (
            <div className="row" style={{ flex: "none", gap: 8, justifyContent: "flex-end" }}>
              {user.cancelAtPeriodEnd && (
                <form action={changeRenewal}><input type="hidden" name="renew" value="on" /><button className="btn primary">Keep Premium</button></form>
              )}
              <a href="#billing" className="btn">Billing</a>
            </div>
          ) : showUpgrade ? (
            <div style={{ textAlign: "right" }}>
              <Link href="/app/premium" className="btn primary">{trialOffer ? `Try Premium free for ${trialOffer} days` : `Upgrade to Premium · $${PLANS.premium.price}/mo`}</Link>
              <div className="hint">{trialOffer ? `Then $${PLANS.premium.price}/mo plus tax. Cancel anytime.` : "Plus applicable sales tax. Cancel anytime."}</div>
            </div>
          ) : null}
        </div>
        {subscribed && user.subscriptionStatus === "past_due" && (
          <div className="notice warn" style={{ marginTop: 12 }}>
            Your last payment didn&apos;t go through. Stripe will try again over the next few days; update your card under <a href="#billing">Billing</a> to keep Premium.
          </div>
        )}
        {payments && testMode && !subscribed && showUpgrade && (
          <div className="hint" style={{ marginTop: 8 }}>Test mode: no real money. Pay with card 4242 4242 4242 4242, any future date, any CVC.</div>
        )}
        {billingNote && (
          <div className={`notice ${billingNote[0]}`} style={{ marginTop: 12 }}>{billingNote[1]}</div>
        )}
        {!premium && !subscribed && (
          <ul className="plan-perks">{premiumPerks.map((f) => <li key={f}>{f}</li>)}</ul>
        )}
      </div>
      {payments && user.stripeCustomerId && (subscribed || bill?.invoices?.length > 0) && (
        <div className="panel billing" id="billing">
          <h2>Billing</h2>
          {!bill && <p className="small muted" style={{ marginTop: -6 }}>We couldn&apos;t reach our payment provider just now, so some details are missing. Refresh in a minute.</p>}
          <div className="bill-facts">
            <div>
              <span className="small muted">Plan</span>
              <b>{subscribed ? `Premium · $${PLANS.premium.price}/month` : "Free"}</b>
              <span className="small muted">
                {trialing ? "Free trial" : subscribed && user.subscriptionStatus === "past_due" ? "Payment due" : subscribed ? "Active" : "No subscription"}
                {bill?.started ? ` · since ${fmt(bill.started)}` : ""}
              </span>
            </div>
            <div>
              <span className="small muted">{subscribed && !user.cancelAtPeriodEnd ? "Next charge" : "Next charge"}</span>
              {subscribed && !user.cancelAtPeriodEnd ? (
                <>
                  <b>{bill?.next ? money(bill.next.amount) : `$${PLANS.premium.price}`}{bill?.next?.exact ? "" : " + tax"}</b>
                  <span className="small muted">on {bill?.next ? fmt(bill.next.date) : periodEnd}{trialing ? " (when your trial ends)" : ""}</span>
                </>
              ) : subscribed ? (
                <><b>None</b><span className="small muted">Premium ends {periodEnd}</span></>
              ) : <><b>None</b><span className="small muted">You&apos;re not subscribed</span></>}
            </div>
            <div>
              <span className="small muted">Payment method</span>
              {bill?.card ? (
                <>
                  <b style={{ textTransform: "capitalize" }}>{bill.card.brand}{bill.card.last4 ? ` •••• ${bill.card.last4}` : ""}</b>
                  {bill.card.expMonth && <span className="small muted">Expires {String(bill.card.expMonth).padStart(2, "0")}/{String(bill.card.expYear).slice(-2)}</span>}
                </>
              ) : <b>None on file</b>}
              <form action={openBillingPortal}><button className="link-btn small">{bill?.card ? "Update card" : "Add a card"}</button></form>
            </div>
          </div>

          {subscribed && user.subscriptionStatus === "past_due" && (
            <div className="notice warn">Your last payment didn&apos;t go through. Update your card to keep Premium; we&apos;ll retry automatically.</div>
          )}

          <h3>Billing history</h3>
          {bill?.invoices?.length ? (
            <div className="table-wrap">
              <table className="bill-table">
                <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Status</th><th><span className="sr-only">Receipt</span></th></tr></thead>
                <tbody>
                  {bill.invoices.map((i) => (
                    <tr key={i.id}>
                      <td>{fmt(i.date)}</td>
                      <td>{i.trial ? "Free trial started" : "Premium, monthly"}{i.number ? <span className="small muted"> · {i.number}</span> : null}</td>
                      <td>{money(i.amount)}</td>
                      <td><span className={`badge ${i.status === "paid" ? "good" : i.status === "open" ? "warn" : ""}`}>{i.status === "paid" ? "Paid" : i.status === "open" ? "Due" : i.status === "void" ? "Void" : "Unpaid"}</span></td>
                      <td>
                        {i.url && <a href={i.url} target="_blank" rel="noopener noreferrer">{i.status === "open" ? "Pay" : "Receipt"}</a>}
                        {i.pdf && <> · <a href={i.pdf} target="_blank" rel="noopener noreferrer">PDF</a></>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="small muted">No payments yet.{trialing ? " Your first one is when your trial ends." : ""}</p>}

          {subscribed && (
            user.cancelAtPeriodEnd ? (
              <div className="bill-cancel">
                <p className="small muted" style={{ margin: 0 }}>Cancelled: Premium ends <b>{periodEnd}</b> and you won&apos;t be charged again. Changed your mind?</p>
                <form action={changeRenewal}><input type="hidden" name="renew" value="on" /><button className="btn primary sm">Keep Premium</button></form>
              </div>
            ) : (
              <details className="bill-cancel">
                <summary>{trialing ? "Cancel free trial" : "Cancel Premium"}</summary>
                <p className="small" style={{ marginBottom: 10 }}>
                  {trialing
                    ? <>You won&apos;t be charged anything. Premium stays on until <b>{periodEnd}</b>, then you&apos;re on Free.</>
                    : <>You keep Premium until <b>{periodEnd}</b> (the end of the month you&apos;ve paid for) and won&apos;t be charged again. No refunds for partial months.</>}
                  {" "}Your collection, filters and settings stay; anything over the Free limits is paused, not deleted.
                </p>
                <form action={changeRenewal}><button className="btn danger sm">{trialing ? "Yes, cancel my trial" : "Yes, cancel Premium"}</button></form>
              </details>
            )
          )}
          <p className="hint" style={{ marginBottom: 0 }}>
            Payments are handled by Stripe; we never see your full card number. Receipts are also emailed to {user.email}.
          </p>
        </div>
      )}
      <form action={savePreferences} key={`${user.phoneVerifiedAt ? "sms" : "no-sms"}-${user.alertSms ? 1 : 0}-${user.tier}`}>
        <div className="panel" id="alerts">
          <h2>How we reach you</h2>
          <p className="small muted" style={{ marginTop: -6 }}>Deal alerts, price alerts and collection alerts come to every channel you turn on here.</p>
          <label className="check">
            <input type="checkbox" name="alertEmail" defaultChecked={user.alertEmail !== false} /> ✉️ Email <span className="muted">· {user.email}</span>
          </label>
          <label className={`check ${canDiscord ? "" : "dim"}`} style={{ marginTop: 6 }}>
            <input type="checkbox" name="alertDiscord" defaultChecked={user.alertDiscord} disabled={!canDiscord} /> 💬 Discord message from BoogieBot <span className="badge good" style={{ marginLeft: 6 }}>Fastest</span>
            {!canDiscord && <span className="badge" style={{ marginLeft: 6 }}>Premium</span>}
          </label>
          {canDiscord && !user.discordConnected && <div className="hint" style={{ marginLeft: 27 }}>Connect Discord under Connected accounts to get these.</div>}
          <label className={`check ${canSms && smsReady && user.phoneVerifiedAt ? "" : "dim"}`} style={{ marginTop: 6 }}>
            <input type="checkbox" name="alertSms" defaultChecked={Boolean(user.alertSms)} disabled={!canSms || !smsReady || !user.phoneVerifiedAt} /> 📱 Text message
            {!smsReady && !user.demo ? <span className="badge" style={{ marginLeft: 6 }}>Coming soon</span> : !canSms && <span className="badge" style={{ marginLeft: 6 }}>Premium</span>}
            {canSms && user.phoneVerifiedAt && <span className="muted"> · {user.phone}</span>}
          </label>
          {canSms && (smsReady || user.demo) && !user.phoneVerifiedAt && <div className="hint" style={{ marginLeft: 27 }}>Add your number just below to get texts.</div>}
          <div style={{ maxWidth: 320, marginTop: 16 }}>
            <label className="field" htmlFor="emailRecap">Email recap</label>
            <select id="emailRecap" name="emailRecap" defaultValue={user.emailRecap || "weekly"} aria-describedby="recap-hint">
              <option value="off">Off</option>
              <option value="weekly">Weekly (Mondays)</option>
              <option value="daily" disabled={user.plan.emailRecap !== "daily"}>Daily{user.plan.emailRecap === "daily" ? "" : " (Premium)"}</option>
            </select>
            <div className="hint" id="recap-hint">Your collection value and biggest movers, deals that matched your filters, and alerts that hit. Sent early morning.</div>
          </div>
          <button className="btn primary" style={{ marginTop: 16 }}>Save alert settings</button>
          {params?.saved === "alerts" && <span className="small good" style={{ marginLeft: 10 }}>Saved.</span>}
        </div>
      </form>

      {canSms && (
        <div className="panel" id="phone">
          <h2>Text alerts</h2>
          {SMS_NOTES[params?.sms] && <div className={`notice ${["verified", "sent", "removed"].includes(params.sms) ? "good" : "warn"}`}>{SMS_NOTES[params.sms]}{params?.demo ? ` (Demo code: ${params.demo})` : ""}</div>}
          {!smsReady && !user.demo ? (
            <p className="muted" style={{ margin: 0 }}>Text alerts are coming soon. We&apos;ll let you know when you can add your number.</p>
          ) : user.phoneVerifiedAt ? (
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
              <span style={{ flex: "none" }}>📱 <b>{user.phone}</b> <span className="badge good">Confirmed</span></span>
              <form action={removePhone} style={{ flex: "none" }}><button className="btn sm ghost">Remove number</button></form>
            </div>
          ) : params?.sms === "sent" || params?.sms === "badcode" ? (
            <form action={verifyPhoneCode} className="row" style={{ maxWidth: 420, alignItems: "flex-end" }}>
              <div>
                <label className="field" htmlFor="code">Enter the 6-digit code we texted you</label>
                <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" required />
              </div>
              <button className="btn primary" style={{ flex: "none" }}>Confirm</button>
            </form>
          ) : (
            <form action={sendPhoneCode} style={{ maxWidth: 460 }}>
              <label className="field" htmlFor="phone">Mobile number</label>
              <div className="row">
                <input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="(555) 123-4567" required />
                <button className="btn primary" style={{ flex: "none" }}>Text me a code</button>
              </div>
              <label className="check small" style={{ marginTop: 10, alignItems: "flex-start" }}>
                <input type="checkbox" name="consent" required style={{ marginTop: 3 }} />
                <span className="muted">Yes, text me TCG Boogie alerts for the cards I choose. Message frequency varies. Msg &amp; data rates may apply. Reply STOP to opt out, HELP for help.</span>
              </label>
            </form>
          )}
        </div>
      )}

      <div className="panel" id="connections">
        <h2>Connected accounts</h2>
        <p className="small muted" style={{ marginTop: -6 }}>Ways to sign in, Discord for alerts, and eBay for selling.</p>
        {params?.linked && <div className="notice good">{PROVIDER_LABELS[params.linked] || "Account"} connected.{params.linked === "discord" ? " You can now sign in with Discord, and Discord alerts can reach you." : ""}</div>}
        {params?.unlinked && <div className="notice good">{PROVIDER_LABELS[params.unlinked] || "Account"} disconnected.</div>}
        {params?.link === "last" && <div className="notice warn">That&apos;s your only way to sign in, so it can&apos;t be disconnected. Connect another method first.</div>}
        {params?.link === "unavailable" && <div className="notice warn">That connection isn&apos;t available yet.</div>}
        {params?.link === "failed" && (
          <div className="notice bad">
            {params.reason === "OAuthAccountNotLinked"
              ? "That Discord account is already connected to a different TCG Boogie account. Sign in with it and disconnect it there first."
              : "Connecting didn't work. Please try again in a minute, and contact support@tcgboogie.com if it keeps happening."}
          </div>
        )}
        <ul className="checklist">
          {METHODS.filter((p) => p !== "email" || user.providers.includes("email")).map((p) => {
            const connected = user.providers.includes(p);
            const available = demoMode || enabledProviders.includes(p);
            return (
              <li key={p}>
                <span className={`dot ${connected ? "done" : ""}`}>{connected ? "✓" : ""}</span>
                <span style={{ flex: 1 }}>
                  {PROVIDER_LABELS[p]}
                  {p === "discord" && <span className="hint" style={{ display: "block", marginTop: 2 }}>
                    {connected ? "Sign in with Discord and get alerts as Discord messages." : "Connect to sign in with Discord and get alerts as Discord messages."}
                  </span>}
                </span>
                {connected ? (
                  <>
                    <span className="badge good">Connected</span>
                    {user.providers.length > 1 && p !== "email" && (
                      <form action={disconnectProvider.bind(null, p)}><button className="btn sm ghost">Disconnect</button></form>
                    )}
                  </>
                ) : available ? (
                  <form action={connectProvider.bind(null, p)}><button className="btn sm primary">Connect {PROVIDER_LABELS[p]}</button></form>
                ) : (
                  <span className="badge">Coming soon</span>
                )}
              </li>
            );
          })}
          <li id="ebay">
            <span className={`dot ${ebay ? "done" : ""}`}>{ebay ? "✓" : ""}</span>
            <span style={{ flex: 1 }}>
              eBay
              <span className="hint" style={{ display: "block", marginTop: 2 }}>
                {ebay ? <>Connected{ebay.ebayUsername ? <> as <b>{ebay.ebayUsername}</b></> : ""}. Use Sell on eBay on any card in your collection.</>
                  : "List cards from your collection in a minute: we fill in the details and a price, you add photos. We never see your eBay password."}
              </span>
            </span>
            {ebay ? (
              <>
                <span className="badge good">Connected</span>
                <form action={disconnectEbay}><button className="btn sm ghost">Disconnect</button></form>
              </>
            ) : ebayReady ? <a className="btn sm primary" href="/api/ebay/connect">Connect eBay</a> : <span className="badge">Coming soon</span>}
          </li>
        </ul>
        {EBAY_NOTES[params?.ebay] && <div className={`notice ${EBAY_NOTES[params.ebay][0]}`} style={{ marginTop: 10 }}>{EBAY_NOTES[params.ebay][1]}</div>}
      </div>

      {params?.saved === "avatar" && <div className="notice good">Profile picture updated.</div>}
      {params?.refreshed && (
        <div className={`notice ${params.refreshed === "failed" ? "warn" : "good"}`}>
          {params.refreshed === "failed"
            ? "We couldn't reach Discord just now. Try again in a minute, or disconnect and reconnect Discord."
            : `Picture refreshed from ${params.refreshed === "google" ? "Google" : "Discord"}.`}
        </div>
      )}

      <div className="panel" id="profile">
        <h2>Profile</h2>
        <form action={saveName}>

          <div className="form-grid">
            <div>
              <label className="field" htmlFor="name">Name</label>
              <input id="name" name="name" type="text" defaultValue={user.name || ""} maxLength={60} />
            </div>
            <div>
              <label className="field" htmlFor="email">Email</label>
              <input id="email" type="email" value={user.email || ""} readOnly />
              <div className="hint">Your email comes from how you signed in.</div>
            </div>
          </div>
                  <button className="btn sm primary">Save name</button>
          {params?.saved === "profile" && <span className="small good" style={{ marginLeft: 10 }}>Saved.</span>}
        </form>
        <h3 id="picture" style={{ marginTop: 22 }}>Profile picture</h3>
        <form action={setAvatar}>
          <div className="avatar-choice" role="radiogroup" aria-label="Profile picture">
            {Object.entries(AVATAR_SOURCES).map(([key, label]) => {
              const url = key === "initials" ? null : pictures[key];
              const usable = key === "initials" || Boolean(url);
              return (
                <label key={key} className={usable ? "" : "disabled"}>
                  <input type="radio" name="avatar" value={key} defaultChecked={current.source === key} disabled={!usable} />
                  <span className="avatar-btn lg" aria-hidden="true">
                    {url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={url} alt="" referrerPolicy="no-referrer" />
                      : <span>{key === "initials" ? initials(user) : "?"}</span>}
                  </span>
                  {label}
                  {!usable && <span className="hint" style={{ margin: 0 }}>{user.providers.includes(key) ? "Sign in with it once" : "Not connected"}</span>}
                </label>
              );
            })}
          </div>
          <button className="btn sm primary" style={{ marginTop: 14 }}>Use this picture</button>
        </form>
        <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap", justifyContent: "flex-start" }}>
          {user.providers.includes("google") && (
            <form action={refreshPicture.bind(null, "google")} style={{ flex: "none" }}><button className="btn sm">↻ Refresh from Google</button></form>
          )}
          {user.providers.includes("discord") && (
            <form action={refreshPicture.bind(null, "discord")} style={{ flex: "none" }}><button className="btn sm">↻ Refresh from Discord</button></form>
          )}
        </div>
        <p className="hint" style={{ marginBottom: 0 }}>
          Changed your picture on Google or Discord? Discord pictures update on their own about once a day, and Google
          pictures each time you sign in with Google. Use Refresh to pick up a change right away.
        </p>
        <RevealSetting />
      </div>

      <div className="panel" style={{ borderColor: "rgba(248,81,73,0.35)" }}>
        <h2>Delete account</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Permanently deletes your account, deal filters, price alerts, collection and alert history.
          {subscribed || (premium && !user.isAdmin)
            ? " Your Premium subscription is cancelled at the same moment, and you won't be charged again."
            : " If you have a subscription, it's cancelled at the same moment, and you won't be charged again."}
        </p>
        {params?.delete === "confirm" && <div className="notice bad">Type DELETE to confirm.</div>}
        {params?.delete === "billing" && (
          <div className="notice bad">
            We couldn&apos;t confirm your subscription was cancelled, so your account was <b>not</b> deleted (that way you can&apos;t be
            charged for an account that no longer exists). Please try again in a few minutes, or email support@tcgboogie.com and we&apos;ll
            cancel it and delete your account for you.
          </div>
        )}
        <form action={deleteAccount} className="row" style={{ maxWidth: 440 }}>
          <input name="confirm" type="text" placeholder="Type DELETE to confirm" aria-label="Type DELETE to confirm" />
          <button className="btn danger" style={{ flex: "none" }}>Delete account</button>
        </form>
      </div>
    </>
  );
}
