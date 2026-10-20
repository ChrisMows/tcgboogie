import Link from "next/link";
import { and, count, desc, eq, gte, ilike, inArray, lt, or } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin";
import { db, schema } from "@/lib/db";
import { LOG_SOURCES } from "@/lib/log";

export const metadata = { title: "Logs" };

const { systemLog, users } = schema;
const PAGE = 100;
const TABS = [["all", "All"], ["problems", "Problems"], ...Object.entries(LOG_SOURCES)];
const LEVEL = { info: ["", "Info"], warn: ["warn", "Warning"], error: ["bad", "Error"] };
const when = (d) => new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });

function filters({ tab, q, before }) {
  const where = [];
  if (tab === "problems") where.push(inArray(systemLog.level, ["warn", "error"]));
  else if (LOG_SOURCES[tab]) where.push(eq(systemLog.source, tab));
  if (q) where.push(ilike(systemLog.message, `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`));
  if (before) where.push(lt(systemLog.id, before));
  return where.length ? and(...where) : undefined;
}

export default async function Logs({ searchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp?.tab) ? sp.tab : "all";
  const q = String(sp?.q || "").trim().slice(0, 80);
  const before = Number(sp?.before) > 0 ? Number(sp.before) : null;
  const link = (over) => {
    const p = new URLSearchParams({ ...(tab !== "all" ? { tab } : {}), ...(q ? { q } : {}), ...over });
    return `/app/logs${p.size ? `?${p}` : ""}`;
  };

  if (!db) {
    return (
      <>
        <div className="page-head"><div><h1>Logs</h1><p>Everything the site does, in one place.</p></div></div>
        <div className="notice">Logs are stored in the database, which isn&apos;t connected in this preview.</div>
      </>
    );
  }

  const day = new Date(Date.now() - 86400000);
  const [rows, problems] = await Promise.all([
    db.select({ id: systemLog.id, at: systemLog.at, source: systemLog.source, level: systemLog.level, message: systemLog.message, details: systemLog.details, userId: systemLog.userId, email: users.email })
      .from(systemLog).leftJoin(users, eq(users.id, systemLog.userId))
      .where(filters({ tab, q, before })).orderBy(desc(systemLog.id)).limit(PAGE + 1),
    db.select({ source: systemLog.source, n: count() }).from(systemLog)
      .where(and(gte(systemLog.at, day), or(eq(systemLog.level, "warn"), eq(systemLog.level, "error")))).groupBy(systemLog.source),
  ]);
  const more = rows.length > PAGE;
  const list = rows.slice(0, PAGE);
  const bad = Object.fromEntries(problems.map((p) => [p.source, Number(p.n)]));
  const badAll = Object.values(bad).reduce((a, b) => a + b, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Logs</h1>
          <p>Everything the site does, in one place: payments, alerts, price data, sign-ins and errors. Kept 60 days.</p>
        </div>
      </div>

      <div className="tabs-row" role="tablist">
        {TABS.map(([k, label]) => {
          const n = k === "problems" || k === "all" ? (k === "problems" ? badAll : 0) : bad[k] || 0;
          return (
            <Link key={k} href={k === "all" ? "/app/logs" : `/app/logs?tab=${k}`} className={tab === k ? "on" : ""} role="tab" aria-selected={tab === k}>
              {label}{n ? <span className="badge bad log-count" title="Warnings and errors in the last 24 hours">{n}</span> : null}
            </Link>
          );
        })}
      </div>

      <form className="row log-search" action="/app/logs">
        {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
        <input name="q" defaultValue={q} placeholder="Search messages, e.g. checkout, discord, 429" aria-label="Search logs" />
        <button className="btn" style={{ flex: "none" }}>Search</button>
        {q && <Link href={tab !== "all" ? `/app/logs?tab=${tab}` : "/app/logs"} className="btn ghost" style={{ flex: "none" }}>Clear</Link>}
      </form>

      {list.length === 0 ? (
        <div className="panel empty">
          <b>Nothing logged{tab !== "all" ? " here" : ""} yet{q ? ` matching “${q}”` : ""}.</b>
          <p className="muted">New entries appear as things happen on the site.</p>
        </div>
      ) : (
        <div className="panel log-list">
          {list.map((r) => (
            <details key={r.id} className={`log-row ${r.level}`}>
              <summary>
                <span className="log-time">{when(r.at)}</span>
                <span className={`badge ${LEVEL[r.level]?.[0] ?? ""}`}>{LEVEL[r.level]?.[1] ?? r.level}</span>
                <span className="log-source">{LOG_SOURCES[r.source] || r.source}</span>
                <span className="log-msg">{r.message}</span>
                {r.userId && (
                  <Link href={`/app/admin?tab=members&user=${encodeURIComponent(r.userId)}#member`} className="log-user" title="Open this member in Admin">
                    {r.email || "deleted member"}
                  </Link>
                )}
              </summary>
              <pre className="log-details">{JSON.stringify({ id: r.id, at: new Date(r.at).toISOString(), source: r.source, level: r.level, user: r.email || r.userId || null, ...(r.details ? { details: r.details } : {}) }, null, 2)}</pre>
            </details>
          ))}
        </div>
      )}
      {(more || before) && (
        <div className="row" style={{ justifyContent: "center", gap: 8, marginTop: 12 }}>
          {before && <Link href={link({})} className="btn sm" style={{ flex: "none" }}>Newest</Link>}
          {more && <Link href={link({ before: String(list[list.length - 1].id) })} className="btn sm" style={{ flex: "none" }}>Older →</Link>}
        </div>
      )}
    </>
  );
}
