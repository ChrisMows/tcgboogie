import Link from "next/link";
import { connectStripe, grantComp, removeMemberPhone, renameMember, revokeComp, setPlan, testAlert, testRecap } from "./actions";
import AdminFeatures from "@/components/AdminFeatures";
import AdminLimits from "@/components/AdminLimits";
import { currentFeatures, currentLimits } from "@/lib/features";
import { listRequests, pendingCount } from "@/lib/card-requests";
import { approveCardRequest, approveReadCard, declineCardRequest, doneCardRequest, postSale, removeMemberCard, setIdeas, skipSale } from "./actions";
import { desc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { marketFeed, releasePosts } from "@/lib/market";
import { xReady } from "@/lib/x";
import { gameTotals } from "@/lib/game-interest";
import { helperReport } from "@/lib/helper";
import { SOURCES, STATUSES, groupIdeas, ideaCounts, listIdeas } from "@/lib/ideas";
import { trafficReport } from "@/lib/traffic";
import { FEATURES, LIMITS } from "@/lib/plans";
import { settingsSummary } from "@/lib/settings-backup";
import { ago, memberCounts, memberDetail, recentAdminLog, requireAdmin, searchMembers, systemStatus } from "@/lib/admin";

export const metadata = { title: "Admin", robots: { index: false } };

const STATE = { ok: ["✅", "OK"], warn: ["⚠️", "Check"], down: ["❌", "Down"], off: ["○", "Not set up"] };
const DONE = {
  granted: ["good", "Complimentary Premium granted."],
  granted_emailed: ["good", "Complimentary Premium granted, and they've been emailed."],
  granted_nomail: ["bad", "Complimentary Premium granted, but the email didn't send (see Logs)."],
  revoked: ["good", "Complimentary Premium removed."],
  plan: ["good", "Plan updated."],
  renamed: ["good", "Name updated."],
  phone: ["good", "Phone number removed."],
  baddate: ["bad", "Pick a date in the future."],
  badlength: ["bad", "Pick how long to grant Premium for."],
  missing: ["bad", "That member no longer exists."],
};
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
const ACTIONS = { grant_comp: "Granted complimentary Premium", revoke_comp: "Removed complimentary Premium", set_plan: "Changed plan", rename: "Renamed", remove_phone: "Removed phone number", features: "Changed features", card_request: "Card request", x_post: "Posted to X" };

function PlanBadge({ m, compact }) {
  if (compact) return m.comp ? <span className="badge accent">Comp{m.compUnlimited ? " ∞" : ""}</span> : m.effective === "premium" ? <span className="badge good">Premium</span> : <span className="badge">Free</span>;
  if (m.comp) return <span className="badge accent">Premium · comp{m.compUnlimited ? " ∞" : ` to ${fmtDate(m.compUntil)}`}</span>;
  return m.effective === "premium" ? <span className="badge good">Premium{m.subscriptionStatus ? ` · ${m.subscriptionStatus}` : ""}</span> : <span className="badge">Free</span>;
}

export default async function Admin({ searchParams }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const tab = sp?.user ? "members" : ["members", "log", "features", "requests", "ideas", "traffic", "helper", "sales"].includes(sp?.tab) ? sp.tab : "status";

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
        <Link href="/app/admin?tab=features" className={tab === "features" ? "on" : ""} role="tab" aria-selected={tab === "features"}>Plans</Link>
        <Link href="/app/admin?tab=requests" className={tab === "requests" ? "on" : ""} role="tab" aria-selected={tab === "requests"}>Requests{await pendingCount() ? <span>{await pendingCount()}</span> : null}</Link>
        <Link href="/app/admin?tab=ideas" className={tab === "ideas" ? "on" : ""} role="tab" aria-selected={tab === "ideas"}>Ideas{(await ideaCounts()).new ? <span>{(await ideaCounts()).new}</span> : null}</Link>
        <Link href="/app/admin?tab=sales" className={tab === "sales" ? "on" : ""} role="tab" aria-selected={tab === "sales"}>Social media</Link>
        <Link href="/app/admin?tab=traffic" className={tab === "traffic" ? "on" : ""} role="tab" aria-selected={tab === "traffic"}>Traffic</Link>
        <Link href="/app/admin?tab=helper" className={tab === "helper" ? "on" : ""} role="tab" aria-selected={tab === "helper"}>Boogie Bot</Link>
        <Link href="/app/admin?tab=log" className={tab === "log" ? "on" : ""} role="tab" aria-selected={tab === "log"}>Admin log</Link>
      </div>
      {tab === "status" && <Status ping={sp?.ping === "1"} test={sp?.test} why={sp?.why} stripe={sp?.stripe} recap={sp?.recap} backup={sp?.backup} />}
      {tab === "members" && <Members q={sp?.q || ""} userId={sp?.user} done={sp?.done} />}
      {tab === "log" && <Log />}
      {tab === "ideas" && <Ideas show={sp?.show} group={sp?.group === "1"} ok={sp?.ok} emailed={sp?.emailed} err={sp?.err} />}
      {tab === "traffic" && <Traffic />}
      {tab === "sales" && <Sales ok={sp?.ok} err={sp?.err} />}
      {tab === "helper" && <Helper />}
      {tab === "requests" && <Requests ok={sp?.ok} err={sp?.err} show={sp?.show} kind={sp?.kind} />}
      {tab === "features" && (
        <>
          <h2 style={{ margin: "4px 0 10px" }}>Features</h2>
          <AdminFeatures features={FEATURES.map(({ key, group, label, help }) => ({ key, group, label, help: help || null }))}
        choices={await currentFeatures()} saved={sp?.saved} />
          <h2 id="limits" style={{ margin: "26px 0 10px" }}>Limits</h2>
          <AdminLimits limits={LIMITS.map(({ key, group, label, help, unit, min, max, unlimited, premiumOnly }) => ({ key, group, label, help: help || null, unit: unit || null, min, max, unlimited, premiumOnly: Boolean(premiumOnly) }))}
            values={await currentLimits()} saved={sp?.limits} />
        </>
      )}
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
                  <label className="small" style={{ flex: "none", display: "flex", gap: 6, alignItems: "center", paddingBottom: 10 }}>
                    <input type="checkbox" name="email" defaultChecked /> Email them
                  </label>
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
              {r.card?.name && (
                <form action={approveReadCard.bind(null, r.id)} className="req-read">
                  <span className="small">We read: <b>{r.card.name}</b>{r.card.setName ? ` · ${r.card.setName}` : ""}{r.card.number ? ` · ${r.card.number}` : ""} · {r.card.language}{r.card.type === "sealed" ? " · sealed" : ""}</span>
                  {r.existing && (
                    <span className="badge good req-existing">
                      Already in the catalog: <Link href={`/app/cards/${encodeURIComponent(r.existing.id)}`}>{r.existing.name}{r.existing.number ? ` ${r.existing.number}` : ""}</Link>
                    </span>
                  )}
                  <button className="btn sm primary" style={{ flex: "none" }}>{r.existing ? "Link to it" : "Add as read"}</button>
                </form>
              )}
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

// Ideas: what members wanted to do but couldn't (lib/ideas.js). Set a status per idea or per group; Done emails
// everyone who asked. "Group similar" has Claude sort the open ones into themes, most-asked first.
async function Ideas({ show = "open", group, ok, emailed, err }) {
  const views = [["open", "Open"], ...STATUSES, ["all", "All"]];
  const view = views.some(([k]) => k === show) ? show : "open";
  let rows = [];
  try { rows = await listIdeas({ status: view }); } catch { rows = null; }
  if (rows === null) return <div className="panel"><p className="muted" style={{ margin: 0 }}>Ideas aren&apos;t available yet (the idea table needs <code>npm run db:push</code>).</p></div>;
  const counts = await ideaCounts();
  let groups = null, groupErr = null;
  if (group && view === "open") { try { groups = await groupIdeas(); } catch (e) { groupErr = e.message; } }
  const byId = new Map(rows.map((r) => [r.idea.id, r]));
  const when = (d) => new Date(d).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const StatusForm = ({ ids, current, compact }) => (
    <form action={setIdeas} className="row" style={{ gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
      <input type="hidden" name="ids" value={ids.join(",")} />
      <input type="hidden" name="back" value={view} />
      <select name="status" defaultValue={current || "planned"} aria-label="Status">{STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      {!compact && <input name="note" placeholder="Note for the Done email (optional)" maxLength={500} style={{ minWidth: 200 }} />}
      <button className="btn sm primary">Save</button>
    </form>
  );
  const Row = ({ r }) => (
    <div className="idea-row">
      <span className="idea-tag">#{r.idea.id}</span>
      <div>
        <p>{r.idea.text}</p>
        <span className="small muted">
          {when(r.idea.at)} · {r.idea.userId ? <Link href={`/app/admin?user=${r.idea.userId}`}>{r.name || r.email || "member"}</Link> : "visitor"}
          {" "}({r.idea.plan}) · {SOURCES[r.idea.source] || r.idea.source}{r.idea.page ? ` · ${r.idea.page}` : ""}
          {r.idea.context ? ` · ${Object.entries(r.idea.context).map(([k, v]) => `${k}: ${v}`).join(", ")}` : ""}
          {r.idea.notifiedAt ? " · ✉ told them it's live" : ""}
        </span>
      </div>
      <StatusForm ids={[r.idea.id]} current={r.idea.status} />
    </div>
  );
  return (
    <>
      {ok && <div className="notice good">Updated {ok} idea{ok === "1" ? "" : "s"}{Number(emailed) ? `, and emailed ${emailed} member${emailed === "1" ? "" : "s"} that it's live` : ""}.</div>}
      {err && <div className="notice bad">That didn&apos;t save. See Logs.</div>}
      <div className="tabs-row" role="tablist" style={{ marginBottom: 12 }}>
        {views.map(([k, l]) => (
          <Link key={k} href={`/app/admin?tab=ideas&show=${k}`} role="tab" aria-selected={view === k} className={view === k ? "on" : ""}>
            {l}{k !== "open" && k !== "all" && counts[k] ? <span>{counts[k]}</span> : null}
          </Link>
        ))}
      </div>
      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <h2 style={{ margin: 0 }}>{views.find(([k]) => k === view)[1]} ideas · {rows.length}</h2>
          {view === "open" && rows.length > 1 && (group
            ? <Link href="/app/admin?tab=ideas" className="btn sm ghost">Show one by one</Link>
            : <Link href="/app/admin?tab=ideas&group=1" className="btn sm">✨ Group similar</Link>)}
        </div>
        <p className="small muted">From the menu, the footer and the dead ends: a search that finds nothing, a missing filter, Boogie Bot not knowing, an error page. Each new one also comes to you on Discord. Mark one Done and everyone who sent it gets an email that it&apos;s live (add a note to say what changed).</p>
        {groupErr && <div className="notice warn">Couldn&apos;t group them: {groupErr}</div>}
        {groups ? groups.map((g) => (
          <details key={g.ids.join(",")} className="idea-group" open={g.ids.length > 1}>
            <summary><b>{g.theme} · {g.ids.length}</b></summary>
            {g.ids.length > 1 && <div style={{ margin: "6px 0" }}><span className="small muted">Whole group: </span><StatusForm ids={g.ids} current="planned" /></div>}
            {g.ids.map((id) => byId.get(id) && <Row key={id} r={byId.get(id)} />)}
          </details>
        )) : rows.length ? rows.map((r) => <Row key={r.idea.id} r={r} />) : <p className="small muted" style={{ margin: 0 }}>No ideas here yet.</p>}
      </div>
    </>
  );
}

const firstLine = (t) => String(t || "").split(/\n/)[0];

/** Admin → Social media: ready-made X posts (release notes, then the Market Movers feed); nothing posts without a tap. */
async function Sales({ ok, err }) {
  const [feed, done] = await Promise.all([marketFeed(), db ? db.select().from(schema.socialPosts).orderBy(desc(schema.socialPosts.at)).limit(200) : []]);
  const handled = new Set(done.map((d) => d.key));
  const queue = [...releasePosts(), ...feed.deals.slice(0, 8), ...feed.highs, ...feed.big.slice(0, 8)].filter((x) => !handled.has(x.id));
  const posted = done.filter((d) => d.status === "posted").slice(0, 20);
  const ready = xReady();
  const ERR = { gone: "That sale isn't in the feed anymore.", already: "That one was already posted or skipped." };
  return (
    <>
      {ok === "posted" && <div className="notice good">Posted to X.</div>}
      {ok === "skipped" && <div className="notice good">Skipped. It won&apos;t come back here.</div>}
      {err && <div className="notice bad">{ERR[err] || err}</div>}
      {!ready && (
        <div className="notice warn">
          X isn&apos;t connected yet, so posts can be downloaded but not sent. Add the four X keys (X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN,
          X_ACCESS_SECRET) in Hostinger&apos;s environment variables, then redeploy.
        </div>
      )}
      <p className="muted">Posts ready for X: <Link href="/updates">release notes</Link>, plus <Link href="/sales">Market Movers</Link> (caught deals, new highs and the week&apos;s biggest sales). Edit the caption if you like, then post or skip.</p>
      {queue.length === 0 ? <div className="panel muted">Nothing new to post right now.</div> : (
        <div className="post-queue">
          {queue.map((x) => (
            <form key={x.id} action={postSale.bind(null, x.id)} className="panel post-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <a href={`/sales/image/${x.id}.png`} target="_blank" rel="noopener noreferrer"><img src={`/sales/image/${x.id}.png`} alt="" width={260} height={260} loading="lazy" /></a>
              <div className="post-body">
                <span className="badge accent">{x.kind === "release" ? "Release notes" : x.kind === "high" ? "New high" : x.kind === "deal" ? "Caught deal" : "Big sale"}</span>
                <textarea name="caption" defaultValue={x.caption} rows={6} maxLength={280} aria-label="Caption" />
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <button className="btn primary" style={{ flex: "none" }} disabled={!ready}>Post to X</button>
                  <a className="btn" style={{ flex: "none" }} href={`/sales/image/${x.id}.png`} download={`tcgboogie-${x.id}.png`}>Download image</a>
                  <button className="btn ghost" style={{ flex: "none" }} formAction={skipSale.bind(null, x.id)}>Skip</button>
                </div>
              </div>
            </form>
          ))}
        </div>
      )}
      {posted.length > 0 && (
        <div className="panel">
          <h2>Posted</h2>
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            {posted.map((p) => <li key={p.key}>{p.at.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {p.postUrl ? <a href={p.postUrl} target="_blank" rel="noopener noreferrer">{firstLine(p.caption)}</a> : firstLine(p.caption)}</li>)}
          </ul>
        </div>
      )}
    </>
  );
}

// Boogie Bot: what people asked the site helper (lib/helper.js), kept 30 days. Repeated questions are FAQ material.
async function Helper() {
  let r = null;
  try { r = await helperReport(); } catch { r = null; }
  if (!r) return <div className="panel"><p className="muted" style={{ margin: 0 }}>Boogie Bot questions aren&apos;t available yet (the helper_log table needs <code>npm run db:push</code>).</p></div>;
  const total = r.daily.reduce((n, d) => n + d.n, 0);
  const failed = r.daily.reduce((n, d) => n + d.failed, 0);
  const when = (d) => new Date(d).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <>
      <div className="stat-row">
        <div className="panel stat"><span className="small muted">Questions · 30 days</span><b>{total.toLocaleString()}</b></div>
        <div className="panel stat"><span className="small muted">Today</span><b>{(r.daily[0]?.day === new Date().toISOString().slice(0, 10) ? r.daily[0].n : 0).toLocaleString()}</b></div>
        <div className="panel stat"><span className="small muted">Couldn&apos;t answer</span><b>{failed.toLocaleString()}</b></div>
      </div>
      <div className="panel">
        <h2>Recent questions</h2>
        <p className="small muted" style={{ marginTop: -6 }}>Newest first. Daily limits: 8 for visitors, 25 on Free, 80 on Premium (lib/rate-limit.js). Questions that keep coming up belong in the FAQ, which the helper reads too.</p>
        {r.recent.length ? r.recent.map((q) => (
          <details key={q.id} className="helper-log">
            <summary>
              <span className="small muted">{when(q.at)} · {q.userId ? <Link href={`/app/admin?user=${q.userId}`}>member</Link> : "visitor"} · {q.page}{q.ok ? "" : " · ⚠ not answered"}</span>
              <span>{q.question}</span>
            </summary>
            <p>{q.answer}</p>
          </details>
        )) : <p className="small muted" style={{ margin: 0 }}>No questions yet.</p>}
      </div>
    </>
  );
}

// Traffic: our own cookie-free visit counts (lib/traffic.js), the last 30 days.
async function Traffic() {
  let r = null;
  try { r = await trafficReport(30); } catch { r = null; }
  if (!r) return <div className="panel"><p className="muted" style={{ margin: 0 }}>Traffic counts aren&apos;t available yet (the site_traffic table needs <code>npm run db:push</code>).</p></div>;
  const max = Math.max(1, ...r.days.map((d) => d.visitors));
  const Table = ({ title, rows, empty, unit }) => (
    <div className="panel">
      <h2>{title}</h2>
      {rows.length ? (
        <table className="list">
          <tbody>{rows.map(([k, n]) => <tr key={k}><td style={{ wordBreak: "break-all" }}>{k}</td><td style={{ textAlign: "right" }}>{n.toLocaleString()} {unit}</td></tr>)}</tbody>
        </table>
      ) : <p className="small muted" style={{ margin: 0 }}>{empty}</p>}
    </div>
  );
  return (
    <>
      <div className="stat-row">
        <div className="panel stat"><span className="small muted">Visitors · 30 days</span><b>{r.totals.visitors.toLocaleString()}</b></div>
        <div className="panel stat"><span className="small muted">Page views</span><b>{r.totals.views.toLocaleString()}</b></div>
        <div className="panel stat"><span className="small muted">Sign-ups</span><b>{r.totals.signups.toLocaleString()}</b></div>
        <div className="panel stat"><span className="small muted">Visitor → sign-up</span><b>{r.totals.visitors ? `${((r.totals.signups / r.totals.visitors) * 100).toFixed(1)}%` : "—"}</b></div>
      </div>
      <div className="panel">
        <h2>By day</h2>
        <p className="small muted" style={{ marginTop: -6 }}>Counted without cookies; bots and admin pages are left out. Tag links in your posts with <code>?utm_source=tiktok&amp;utm_campaign=launch</code> to see which ones bring people.</p>
        <table className="list">
          <thead><tr><th>Day</th><th>Visitors</th><th></th><th>Views</th><th>Sign-ups</th></tr></thead>
          <tbody>
            {r.days.map((d) => (
              <tr key={d.day}>
                <td>{d.day}</td><td>{d.visitors}</td>
                <td style={{ width: "40%" }}><span className="traffic-bar" style={{ width: `${(d.visitors / max) * 100}%` }} /></td>
                <td>{d.views}</td><td>{d.signups || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="traffic-grid">
        <Table title="Sign-ups by what brought them" rows={r.signupSources} empty="No sign-ups credited yet." unit="" />
        <Table title="Campaign links (utm)" rows={r.sources} empty="No tagged links yet." unit="visits" />
        <Table title="Sites that sent visitors" rows={r.refs} empty="No referring sites yet." unit="visits" />
        <Table title="Top pages" rows={r.pages} empty="No page views yet." unit="views" />
      </div>
    </>
  );
}
