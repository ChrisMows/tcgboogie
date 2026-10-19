import { enabledProviders } from "@/auth";
import { demoMode, requireUser } from "@/lib/session";
import { connectProvider, deleteAccount, disconnectProvider, refreshPicture, removePhone, savePreferences, sendPhoneCode, setAvatar, verifyPhoneCode } from "../actions";
import { channelsReady } from "@/lib/notify";
import { AVATAR_SOURCES, avatarFor, avatarOptions, initials } from "@/lib/avatar";
import { PLANS } from "@/lib/plans";
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

export default async function Account({ searchParams }) {
  const user = await requireUser();
  const params = await searchParams;
  const premium = user.tier === "premium";
  const pictures = avatarOptions(user);
  const smsReady = channelsReady().sms;
  const current = avatarFor(user);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Your plan, profile, sign-ins and how alerts reach you.</p>
        </div>
      </div>

      <div className={`panel plan-panel ${premium ? "is-premium" : ""}`} id="plan">
        <div className="plan-panel-head">
          <div>
            <div className="small muted">Your plan</div>
            <div className="plan-panel-name">{user.plan.label} {premium ? <span className="badge accent">Active</span> : null}</div>
            <div className="small muted">
              {user.isAdmin && !user.demo ? <>Admin account: Premium included. Previewing as <b>{user.plan.label}</b> (switch in the admin bar).</>
                : compActive(user) ? <>Complimentary Premium{user.compUnlimited ? ", no end date" : ` until ${new Date(user.compUntil).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`}. You won&apos;t be charged.</>
                : premium ? `$${PLANS.premium.price}/month` : "Free forever."}
            </div>
          </div>
          {premium ? (
            <button className="btn" disabled title="Billing management launches with card payments">Manage subscription</button>
          ) : (
            <div style={{ textAlign: "right" }}>
              <button className="btn primary" disabled>Upgrade to Premium · ${PLANS.premium.price}/mo</button>
              <div className="hint">Card payments launch soon.</div>
            </div>
          )}
        </div>
        {!premium && (
          <ul className="plan-perks">{PLANS.premium.features.map((f) => <li key={f}>{f}</li>)}</ul>
        )}
      </div>
      {params?.saved && <div className="notice good">{params.saved === "avatar" ? "Profile picture updated." : "Saved."}</div>}
      {params?.refreshed && (
        <div className={`notice ${params.refreshed === "failed" ? "warn" : "good"}`}>
          {params.refreshed === "failed"
            ? "We couldn't reach Discord just now. Try again in a minute, or disconnect and reconnect Discord."
            : `Picture refreshed from ${params.refreshed === "google" ? "Google" : "Discord"}.`}
        </div>
      )}

      <div className="panel" id="picture">
        <h2>Profile picture</h2>
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
      </div>

      <form action={savePreferences} key={`${user.phoneVerifiedAt ? "sms" : "no-sms"}-${user.alertSms ? 1 : 0}-${user.tier}`}>
        <div className="panel">
          <h2>Profile</h2>
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
        </div>

        <div className="panel" id="alerts">
          <h2>Where alerts go</h2>
          <p className="small muted" style={{ marginTop: -6 }}>Price alerts and deal alerts reach you on every channel you turn on.</p>
          <label className="check">
            <input type="checkbox" name="alertEmail" defaultChecked={user.alertEmail !== false} /> ✉️ Email <span className="muted">· {user.email}</span>
          </label>
          <label className={`check ${premium ? "" : "dim"}`} style={{ marginTop: 6 }}>
            <input type="checkbox" name="alertDiscord" defaultChecked={user.alertDiscord} disabled={!premium} /> 💬 Discord message from BoogieBot
            {!premium && <span className="badge" style={{ marginLeft: 6 }}>Premium</span>}
          </label>
          {premium && !user.discordConnected && <div className="hint" style={{ marginLeft: 27 }}>Connect Discord below to get these.</div>}
          <label className={`check ${premium && user.phoneVerifiedAt ? "" : "dim"}`} style={{ marginTop: 6 }}>
            <input type="checkbox" name="alertSms" defaultChecked={Boolean(user.alertSms)} disabled={!premium || !user.phoneVerifiedAt} /> 📱 Text message
            {!premium && <span className="badge" style={{ marginLeft: 6 }}>Premium</span>}
            {premium && user.phoneVerifiedAt && <span className="muted"> · {user.phone}</span>}
          </label>
          {premium && !user.phoneVerifiedAt && <div className="hint" style={{ marginLeft: 27 }}>Add your number below to get texts.</div>}
          <div style={{ maxWidth: 320, marginTop: 16 }}>
            <label className="field" htmlFor="emailRecap">Email recap</label>
            <select id="emailRecap" name="emailRecap" defaultValue={user.emailRecap}>
              <option value="off">Off</option>
              <option value="weekly">Weekly</option>
              <option value="daily" disabled={!premium}>Daily{premium ? "" : " (Premium)"}</option>
            </select>
          </div>
        </div>
        <button className="btn primary" style={{ marginBottom: 16 }}>Save changes</button>
      </form>

      {premium && (
        <div className="panel" id="phone">
          <h2>Text alerts</h2>
          {SMS_NOTES[params?.sms] && <div className={`notice ${["verified", "sent", "removed"].includes(params.sms) ? "good" : "warn"}`}>{SMS_NOTES[params.sms]}{params?.demo ? ` (Demo code: ${params.demo})` : ""}</div>}
          {!smsReady && !user.demo ? (
            <p className="muted" style={{ margin: 0 }}>Text alerts are coming soon.</p>
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
        <h2>Sign-in methods and connections</h2>
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
                    {connected ? "Sign in with Discord, get alerts in your private channel, and join the members' server." : "Connect to sign in with Discord, get alerts in your private channel, and join the members' server."}
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
        </ul>
      </div>

      <div className="panel" style={{ borderColor: "rgba(248,81,73,0.35)" }}>
        <h2>Delete account</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Permanently deletes your account, filter profiles, price alerts, collection and alert history.
          {premium && !user.isAdmin
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
