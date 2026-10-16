import { enabledProviders } from "@/auth";
import { demoMode, requireUser } from "@/lib/session";
import { connectProvider, deleteAccount, disconnectProvider, savePreferences } from "../actions";

export const metadata = { title: "Account" };

const PROVIDER_LABELS = { google: "Google", discord: "Discord", email: "Email link" };
const METHODS = ["google", "discord", "email"];

export default async function Account({ searchParams }) {
  const user = await requireUser();
  const params = await searchParams;
  const premium = user.tier === "premium";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Account</h1>
          <p>Your profile, sign-in methods and how alerts reach you.</p>
        </div>
      </div>
      {params?.saved && <div className="notice good">Saved.</div>}

      <form action={savePreferences}>
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

        <div className="panel">
          <h2>Alerts</h2>
          {!premium && <div className="notice">Instant alerts are a Premium feature. These settings switch on when you upgrade.</div>}
          <label className="check">
            <input type="checkbox" name="alertDiscord" defaultChecked={user.alertDiscord} /> Discord: your private alerts channel
          </label>
          {!user.discordConnected && <div className="hint" style={{ marginLeft: 27 }}>Connect Discord below to receive these.</div>}
          <label className="check" style={{ marginTop: 10 }}>
            <input type="checkbox" name="alertWebPush" defaultChecked={user.alertWebPush} /> Phone and browser notifications
          </label>
          <div className="hint" style={{ marginLeft: 27 }}>Coming soon.</div>
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

      <div className="panel">
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
          Permanently deletes your account, filter profiles, price watches, collection and alert history. If you're on Premium, cancel your
          subscription first.
        </p>
        {params?.delete === "confirm" && <div className="notice bad">Type DELETE to confirm.</div>}
        <form action={deleteAccount} className="row" style={{ maxWidth: 440 }}>
          <input name="confirm" type="text" placeholder="Type DELETE to confirm" aria-label="Type DELETE to confirm" />
          <button className="btn danger" style={{ flex: "none" }}>Delete account</button>
        </form>
      </div>
    </>
  );
}
