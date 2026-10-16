import { enabledProviders } from "@/auth";
import { demoMode, requireUser } from "@/lib/session";
import { deleteAccount, savePreferences } from "../actions";
import { signInWith } from "@/app/login/actions";

export const metadata = { title: "Account" };

const PROVIDER_LABELS = { google: "Google", discord: "Discord", email: "Email link" };

export default async function Account({ searchParams }) {
  const user = await requireUser();
  const params = await searchParams;
  const premium = user.tier === "premium";
  const linkable = (demoMode ? ["google", "discord"] : enabledProviders.filter((p) => p !== "email"))
    .filter((p) => !user.providers.includes(p));

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
        <ul className="checklist">
          {user.providers.map((p) => (
            <li key={p}><span className="dot done">✓</span><span style={{ flex: 1 }}>{PROVIDER_LABELS[p] || p}</span><span className="badge good">Connected</span></li>
          ))}
          {linkable.map((p) => (
            <li key={p}>
              <span className="dot" />
              <span style={{ flex: 1 }}>
                {PROVIDER_LABELS[p]}
                {p === "discord" && <span className="hint" style={{ display: "block", marginTop: 2 }}>Needed for Discord alerts and the members' server.</span>}
              </span>
              <form action={signInWith.bind(null, p)}><button className="btn sm">Connect</button></form>
            </li>
          ))}
        </ul>
      </div>

      <div className="panel" style={{ borderColor: "rgba(248,81,73,0.35)" }}>
        <h2>Delete account</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Permanently deletes your account, filter profiles and alert history. If you're on Premium, cancel your
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
