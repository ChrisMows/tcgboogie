import Link from "next/link";
import { connectStripe, grantComp, removeMemberPhone, renameMember, revokeComp, setPlan, testAlert, testRecap } from "./actions";
import AdminFeatures from "@/components/AdminFeatures";
import { currentFeatures } from "@/lib/features";
import { listRequests, pendingCount } from "@/lib/card-requests";
import { approveCardRequest, declineCardRequest, doneCardRequest, removeMemberCard } from "./actions";
import { gameTotals } from "@/lib/game-interest";
import { FEATURES } from "@/lib/plans";
import { settingsSummary } from "@/lib/settings-backup";
import { ago, memberCounts, memberDetail, recentAdminLog, requireAdmin, searchMembers, systemStatus } from "@/lib/admin";

export const metadata = { title: "Admin", robots: { index: false } };

const STATE = { ok: ["✅", "OK"], warn: ["⚠️", "Check"], down: ["❌", "Down"], off: ["○", "Not set up"] };
const DONE = {
  granted: ["good", "Complimentary Premium granted."],
  revoked: ["good", "Complimentary Premium removed."],
  plan: ["good", "Plan updated."],
  renamed: ["good", "Name updated."],
  phone: ["good", "Phone number removed."],
  baddate: ["bad", "Pick a date in the future."],
  badlength: ["bad", "Pick how long to grant Premium for."],
  missing: ["bad", "That member no longer exists."],
};
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
const ACTIONS = { grant_comp: "Granted complimentary Premium", revoke_comp: "Removed complimentary Premium", set_plan: "Changed plan", rename: "Renamed", remove_phone: "Removed phone number", features: "Changed features", card_request: "Card request" };

function PlanBadge({ m, compact }) {
  if (compact) return m.comp ? <span className="badge accent">Comp{m.compUnlimited ? " ∞" : ""}</span> : m.effective === "premium" ? <span className="badge good">Premium</span> : <span className="badge">Free</span>;
  if (m.comp) return <span className="badge accent">Premium · comp{m.compUnlimited ? " ∞" : ` to ${fmtDate(m.compUntil)}`}</span>;
  return m.effective === "premium" ? <span className="badge good">Premium{m.subscriptionStatus ? ` · ${m.subscriptionStatus}` : ""}</span> : <span className="badge">Free</span>;
}

export default async function Admin({ searchParams }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const tab = sp?.user ? "members" : ["members", "log", "features", "requests"].includes(sp?.tab) ? sp.tab : "status";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Admin</h1>
          <p>Signed in as {admin.email}. Only admins can see this page.</p>
        </div>
        <div className="head-actions"><Link href="/app/logs" className="btn sm">📜 Logs</Link></div>
      </div>
      <div className="tabs-row" role="tablist">
        <Link href="/app/admin" className={tab === "status" ? "on" : ""} role="tab" aria-selected={tab === "status"}>Status</Link>
        <Link href="/app/admin?tab=members" className={tab === "members" ? "on" : ""} role="tab" aria-selected={tab === "members"}>Members</Link>
        <Link href="/app/admin?tab=features" className={tab === "features" ? "on" : ""} role="tab" aria-selected={tab === "features"}>Features</Link>
        <Link href="/app/admin?tab=requests" className={tab === "requests" ? "on" : ""} role="tab" aria-selected={tab === "requests"}>Requests{await pendingCount() ? <span>{await pendingCount()}</span> : null}</Link>
        <Link href="/app/admin?tab=log" className={tab === "log" ? "on" : ""} role="tab" aria-selected={tab === "log"}>Admin log</Link>
      </div>
      {tab === "status" && <Status ping={sp?.ping === "1"} test={sp?.test} why={sp?.why} stripe={sp?.stripe} recap={sp?.recap} backup={sp?.backup} />}
      {tab === "members" && <Members q={sp?.q || ""} userId={sp?.user} done={sp?.done} />}
      {tab === "log" && <Log />}
      {tab === "requests" && <Requests ok={sp?.ok} err={sp?.err} show={sp?.show} kind={sp?.kind} />}
      {tab === "features" && <AdminFeatures features={FEATURES.map(({ key, group, label, help }) => ({ key, group, label, help: help || null }))}
        choices={await currentFeatures()} saved={sp?.saved} />}
    </>
  );
}

const CHANNEL_NAMES = { email: "Email", discord: "Discord DM", sms: "Text" };

async function Status({ ping, test, why, stripe, recap, backup }) {
  const settings = settingsSummary();
  const [checks, counts] = await Promise.all([systemStatus({ pingPrices: ping }), memberCounts()]);
  const tested = String(test || "").split(",").filter(Boolean).map((x) => x.split(":"));
  const groups = [...new Set(checks.map((c) => c.group))];
  const problems = checks.filter((c) => c.state === "down" || c.state === "warn").length;
  return (
    <>
      <div className="stats">
        <div className="stat"><b>{counts.total}</b><span>members</span></div>
        <div className="stat"><b>{counts.premium}</b><span>on Premium ({counts.comp} complimentary)</span></div>
        <div className="stat"><b>{counts.week}</b><span>joined this week</span></div>
        <div className="stat"><b className={problems ? "down" : "up"}>{problems ? `${problems} to check` : "All good"}</b><span>system status</span></div>
      </div>
      {tested.length > 0 && (
        <div className={`notice ${tested.some(([, r]) => r === "fail") ? "warn" : "good"}`}>
          <b>Test alert:</b> {tested.map(([c, r]) => `${CHANNEL_NAMES[c] || c} ${r === "ok" ? "✅ sent" : r === "fail" ? "❌ failed" : "○ not set up"}`).join(" · ")}
          {why ? <div className="small" style={{ marginTop: 4 }}>{why}</div> : null}
        </div>
      )}
      {recap && (
        <div className={`notice ${recap === "sent" ? "good" : recap === "empty" ? "" : "bad"}`}>
          <b>Recap preview:</b> {recap === "sent" ? "sent to your email." : recap === "empty" ? "nothing to report for you yet (no cards, matched deals or alerts), so no email." : recap.slice(5)}
        </div>
      )}
      {stripe && (
        <div className={`notice ${stripe.startsWith("ok") ? "good" : "bad"}`}>
          {stripe.startsWith("ok")
            ? <><b>Stripe connected</b> ({stripe.split(":")[1]} mode). Premium price and payment webhook are {stripe.split(":")[2] === "created" ? "set up" : "up to date"}.</>
            : <><b>Stripe setup failed:</b> {stripe.slice(5)}</>}
        </div>
      )}
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <span className="small muted" style={{ flex: "1 1 260px" }}>Checked just now. Nothing here sends messages or charges anything, except these buttons.</span>
        <form action={testAlert} style={{ flex: "none" }}><button className="btn sm primary" title="Sends a sample alert to you on every channel that's set up">Send me a test alert</button></form>
        <form action={testRecap} style={{ flex: "none" }}><button className="btn sm" title="Emails you a preview of your recap">Email me a recap preview</button></form>
        <Link href="/app/admin?ping=1" className="btn sm" style={{ flex: "none" }} title="Makes one tiny price-service request (1 credit)">Test price service now</Link>
        {process.env.STRIPE_SECRET_KEY ? <form action={connectStripe} style={{ flex: "none" }}><button className="btn sm" title="Creates the Premium price and the payment webhook in Stripe. Safe to press again.">Set up Stripe</button></form> : null}
      </div>
      <div className={`panel settings-backup ${settings.missingEssential.length ? "warn" : ""}`}>
        <h2>Settings backup</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          The site runs on {settings.set.length} settings stored at Hostinger (database, sign-in, email, eBay, Stripe and more). Hostinger
          has wiped them once during a redeploy. Download a copy whenever you change one and keep it in your password manager; to
          restore, open Hostinger → Environment variables → <b>Import .env</b> and pick the file.
        </p>
        {settings.missingEssential.length > 0 && (
          <div className="notice warn">Missing right now: {settings.missingEssential.join(", ")}. Add them in Hostinger → Environment variables.</div>
        )}
        {backup === "confirm" && <div className="notice warn">Tick the box first, then download.</div>}
        <form method="post" action="/app/admin/settings-backup" className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <label className="small" style={{ display: "flex", gap: 8, alignItems: "center", flex: "1 1 300px" }}>
            <input type="checkbox" name="confirm" value="yes" required />
            I understand this file holds every password and key for the site, and I&apos;ll keep it private.
          </label>
          <button className="btn sm primary" style={{ flex: "none" }}>Download settings backup</button>
        </form>
      </div>
      {groups.map((g) => (
        <div key={g} className="panel status-group">
          <h2>{g}</h2>
          {checks.filter((c) => c.group === g).map((c) => (
            <div key={c.name} className={`status-row ${c.state}`}>
              <span className="status-icon" aria-hidden="true">{STATE[c.state][0]}</span>
              <b>{c.name}</b>
              <span className="status-detail">{c.detail}</span>
              <span className={`badge ${c.state === "ok" ? "good" : c.state === "warn" ? "warn" : c.state === "down" ? "bad" : ""}`}>{STATE[c.state][1]}</span>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

async function Members({ q, userId, done }) {
  const [list, member] = await Promise.all([searchMembers(q), userId ? memberDetail(userId) : null]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="admin-members">
      <div>
        <form className="search-box" action="/app/admin" style={{ marginBottom: 12 }}>
          <input type="hidden" name="tab" value="members" />
          <span aria-hidden="true">⌕</span>
          <input type="search" name="q" defaultValue={q} placeholder="Search by name or email" aria-label="Search members" autoFocus={!userId} />
          <button className="btn sm">Search</button>
        </form>
        <div className="member-list">
          {list.length ? list.map((m) => (
            <Link key={m.id} href={`/app/admin?tab=members&q=${encodeURIComponent(q)}&user=${m.id}#member`} className={`member-row ${m.id === userId ? "on" : ""}`}>
              <span className="member-avatar" aria-hidden="true">{(m.name || m.email || "?")[0].toUpperCase()}</span>
              <span className="member-text"><b>{m.name || "(no name)"}</b><span className="small muted">{m.email}</span></span>
              <PlanBadge m={m} compact />
            </Link>
          )) : <p className="muted">No members match “{q}”.</p>}
        </div>
      </div>

      <div id="member">
        {!member ? (
          <div className="panel empty-state">{userId ? "That member wasn't found." : "Select a member to see their details and change their plan."}</div>
        ) : (
          <>
            {DONE[done] && <div className={`notice ${DONE[done][0]}`}>{DONE[done][1]}</div>}
            <div className="panel">
              <div className="member-head">
                <span className="member-avatar lg" aria-hidden="true">{(member.name || member.email || "?")[0].toUpperCase()}</span>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ margin: 0 }}>{member.name || "(no name)"}</h2>
                  <div className="muted small">{member.email}</div>
                  <div style={{ marginTop: 6 }}><PlanBadge m={member} /></div>
                </div>
              </div>
              <div className="member-facts">
                <span>Joined <b>{fmtDate(member.createdAt)}</b></span>
                <span>Signs in with <b>{member.providers.join(", ") || "—"}</b></span>
                <span>Phone <b>{member.phoneVerifiedAt ? member.phone : "none"}</b></span>
                <span><b>{member.stats.cards}</b> cards · <b>{member.stats.wishlist}</b> wishlist</span>
                <span><b>{member.stats.alerts}</b> price alerts · <b>{member.stats.filters}</b> deal filters</span>
              </div>
            </div>

            <div className="panel">
              <h2>Complimentary Premium</h2>
              {member.comp ? (
                <div className="comp-now">
                  <span>Active {member.compUnlimited ? <b>with no end date</b> : <>until <b>{fmtDate(member.compUntil)}</b></>}{member.compNote ? <> · “{member.compNote}”</> : null}</span>
                  <form action={revokeComp.bind(null, member.id)}><button className="btn sm danger">Remove</button></form>
                </div>
              ) : <p className="small muted" style={{ marginTop: -6 }}>Give Premium for free. They&apos;re never charged, and it ends on its own when the time is up.</p>}
              <form action={grantComp.bind(null, member.id)} className="comp-form">
                <div className="comp-lengths" role="radiogroup" aria-label="How long">
                  {[["7", "7 days"], ["30", "30 days"], ["90", "90 days"], ["365", "1 year"], ["date", "Until a date"], ["unlimited", "Unlimited"]].map(([v, l], i) => (
                    <label key={v}><input type="radio" name="length" value={v} defaultChecked={i === 1} /> {l}</label>
                  ))}
                </div>
                <div className="row" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div style={{ flex: "0 1 180px" }}>
                    <label className="field" htmlFor="until">Date (for “Until a date”)</label>
                    <input id="until" name="until" type="date" min={today} />
                  </div>
                  <div style={{ flex: "1 1 220px" }}>
                    <label className="field" htmlFor="note">Note (optional)</label>
                    <input id="note" name="note" type="text" maxLength={200} placeholder="e.g. Beta tester, giveaway winner" />
                  </div>
                  <button className="btn primary" style={{ flex: "none" }}>{member.comp ? "Replace with this" : "Grant Premium"}</button>
                </div>
              </form>
            </div>

            <div className="form-grid" style={{ alignItems: "start" }}>
              <form action={setPlan.bind(null, member.id)} className="panel">
                <h2>Paid plan</h2>
                <p className="small muted" style={{ marginTop: -6 }}>
                  {member.stripeCustomerId
                    ? <>Stripe keeps this up to date{member.currentPeriodEnd ? <> · {member.cancelAtPeriodEnd ? "ends" : "renews"} {fmtDate(member.currentPeriodEnd)}</> : null}. A manual change here is overwritten at the next payment event; refunds and cancellations are done in the Stripe dashboard.</>
                    : "For manual fixes. Members who pay by card are kept up to date by Stripe."}
                </p>
                <div className="row">
                  <select name="tier" defaultValue={member.tier} aria-label="Plan"><option value="free">Free</option><option value="premium">Premium</option></select>
                  <select name="status" defaultValue={member.subscriptionStatus || ""} aria-label="Billing status">
                    <option value="">No subscription</option><option value="active">Active</option><option value="past_due">Past due</option><option value="canceled">Canceled</option>
                  </select>
                </div>
                <button className="btn sm" style={{ marginTop: 10 }}>Save plan</button>
              </form>
              <div className="panel">
                <h2>Account</h2>
                <form action={renameMember.bind(null, member.id)} className="row">
                  <input name="name" defaultValue={member.name || ""} maxLength={60} aria-label="Name" />
                  <button className="btn sm" style={{ flex: "none" }}>Rename</button>
                </form>
                {member.phoneVerifiedAt && (
                  <form action={removeMemberPhone.bind(null, member.id)} style={{ marginTop: 10 }}>
                    <button className="btn sm ghost">Remove phone {member.phone}</button>
                  </form>
                )}
              </div>
            </div>

            <div className="form-grid" style={{ alignItems: "start" }}>
              <div className="panel">
                <h2>Recent alerts sent</h2>
                {member.recentAlerts.length ? member.recentAlerts.map((a) => (
                  <div key={a.id} className="mini-line"><span>{a.ok ? "✅" : "❌"} {a.channel}</span><span className="small">{a.title}</span><span className="small muted">{ago(a.sentAt)}</span></div>
                )) : <p className="small muted" style={{ margin: 0 }}>None yet.</p>}
              </div>
              <div className="panel">
                <h2>Admin changes</h2>
                {member.log.length ? member.log.map((l) => (
                  <div key={l.id} className="mini-line"><span>{ACTIONS[l.action] || l.action}</span><span className="small muted">{l.adminEmail} · {ago(l.at)}</span></div>
                )) : <p className="small muted" style={{ margin: 0 }}>No changes yet.</p>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const REQUEST_KINDS = [["all", "All"], ["card", "Cards"], ["sealed", "Sealed"], ["import", "Import files"], ["games", "Games"]];
const OK_NOTES = { approved: "Approved: the card is searchable by the member's words now.", removed: "Removed: the card no longer shows in search or opens.",
  done: "Marked as reviewed.", declined: "Declined." };

async function Requests({ ok, err, show, kind: rawKind }) {
  const kind = REQUEST_KINDS.some(([k]) => k === rawKind) ? rawKind : "all";
  const status = show === "all" ? "all" : "pending";
  const href = (k, s = status) => `/app/admin?tab=requests${k !== "all" ? `&kind=${k}` : ""}${s === "all" ? "&show=all" : ""}`;
  const rows = kind === "games" ? [] : await listRequests({ status, kind });
  const games = kind === "games" ? await gameTotals() : [];
  return (
    <>
      {OK_NOTES[ok] && <div className="notice good">{OK_NOTES[ok]}</div>}
      {err && <div className="notice bad">{err}</div>}
      <div className="seg" style={{ marginBottom: 12 }}>
        {REQUEST_KINDS.map(([k, label]) => <Link key={k} href={href(k)} className={kind === k ? "on" : ""} style={{ padding: "6px 12px", fontSize: 13 }}>{label}</Link>)}
      </div>
      {kind === "games" ? (
        <>
          <p className="small muted" style={{ marginTop: 0 }}>&quot;Notify me&quot; votes from the homepage: which game to add next, and who to email when it&apos;s live.</p>
          {games.map((g) => (
            <div key={g.game} className="panel req-row">
              <div className="req-main">
                <b>{g.label}</b> <span className={`badge ${g.votes ? "accent" : ""}`}>{g.votes} vote{g.votes === 1 ? "" : "s"}</span>
                {g.emails.length > 0 && (
                  <details className="small"><summary>Who asked</summary><p style={{ margin: "6px 0 0", wordBreak: "break-all" }}>{g.emails.join(", ")}</p></details>
                )}
              </div>
            </div>
          ))}
        </>
      ) : (
      <>
      <p className="small muted" style={{ marginTop: 0 }}>
        {kind === "import"
          ? "Collection files whose column names we didn't recognise (we only keep the column names and file name). We guess the columns and members can correct them, so these show which apps' exports to add by name."
          : <>Members ask for cards and sealed products they couldn&apos;t find, and most are added automatically: ones our price service has are linked, and
            ones it doesn&apos;t have (often Korean or Chinese) are added without prices from the TCGplayer page or the linked page. Waiting here are
            the ones we couldn&apos;t identify. Approve with the TCGplayer link, or decline. Under &quot;all recent&quot;, remove one that was added wrongly.</>}{" "}
        <Link href={href(kind, status === "all" ? "pending" : "all")}>{status === "all" ? "Show waiting only" : "Show all recent requests"}</Link>
      </p>
      {rows.length === 0 ? <div className="panel muted">{status === "all" ? "No requests yet." : "Nothing waiting. 🎉"}</div> : rows.map((r) => (
        <div key={r.id} className="panel req-row">
          <div className="req-main">
            <b>{r.kind === "import" ? r.query : `“${r.query}”`}</b> {r.kind !== "card" && <span className="badge">{r.kind === "import" ? "Import file" : "Sealed"}</span>}{" "}
            <span className={`badge ${r.status === "added" || r.status === "done" ? "good" : r.status === "declined" ? "" : "warn"}`}>{r.status}</span>
            <div className="small muted">{r.email || "member"} · {ago(r.createdAt)}{r.reason ? ` · ${r.reason}` : ""}</div>
            {r.kind === "import" ? <span className="small muted">File: {r.link}</span>
              : <a href={r.link} target="_blank" rel="noopener noreferrer nofollow" className="small req-link">{r.link}</a>}
            {r.productId && (
              <div className="small row" style={{ gap: 10 }}>
                <Link href={`/app/cards/${encodeURIComponent(r.productId)}${r.language === "japanese" ? "?lang=japanese" : ""}`}>Open the card →</Link>
                {r.memberCard && (
                  <form action={removeMemberCard.bind(null, r.productId)}><button className="link-btn small">Remove this member-added card</button></form>
                )}
              </div>
            )}
          </div>
          {r.status === "pending" && r.kind === "import" && (
            <div className="req-actions"><form action={doneCardRequest.bind(null, r.id)}><button className="btn sm">Mark reviewed</button></form></div>
          )}
          {r.status === "pending" && r.kind !== "import" && (
            <div className="req-actions">
              <form action={approveCardRequest.bind(null, r.id)} className="row" style={{ gap: 6 }}>
                <input name="tcgplayer" placeholder="TCGplayer link or number" required />
                <button className="btn sm primary" style={{ flex: "none" }}>Approve</button>
              </form>
              <form action={declineCardRequest.bind(null, r.id)}><button className="btn sm ghost">Decline</button></form>
            </div>
          )}
        </div>
      ))}
      </>
      )}
    </>
  );
}

async function Log() {
  const log = await recentAdminLog(50);
  return (
    <div className="panel">
      {log.length ? (
        <div className="table-wrap" style={{ border: 0 }}>
          <table className="list">
            <thead><tr><th>When</th><th>Admin</th><th>Member</th><th>Change</th></tr></thead>
            <tbody>
              {log.map((l) => (
                <tr key={l.id}>
                  <td className="muted">{ago(l.at)}</td>
                  <td>{l.adminEmail}</td>
                  <td>{l.targetUserId ? <Link href={`/app/admin?tab=members&user=${l.targetUserId}#member`}>{l.targetEmail}</Link> : <span className="muted">—</span>}</td>
                  <td>{ACTIONS[l.action] || l.action}{l.details?.until ? ` (${l.details.until === "unlimited" ? "unlimited" : `to ${fmtDate(l.details.until)}`})` : ""}{l.details?.tier ? ` → ${l.details.tier}` : ""}{l.details?.changed ? `: ${l.details.changed.join("; ")}` : ""}{l.details?.result ? ` #${l.details.id} ${l.details.result}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="muted" style={{ margin: 0 }}>No admin changes yet.</p>}
    </div>
  );
}
