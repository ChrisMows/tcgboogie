"use client";

import { useMemo, useState } from "react";

const money = (v) => `$${Math.round(Number(v)).toLocaleString("en-US")}`;
const SHOW = 8;

/**
 * The card page's latest graded sales, with chips to show just one grade.
 * sales: [{ key, date, grade (label), price, count, href }], newest first.
 * labels: CGC and BGS 10s by slab label, [{ grade, count, median, low, high, last }]. The price service gives each label's
 * totals but doesn't say which label each sale was, so these show as a summary, with only the sales we know the label of.
 */
export default function RecentSales({ sales, labels = [], soldHref, soldAffiliate, label = "Latest graded sales (eBay and Fanatics Collect)" }) {
  const [grade, setGrade] = useState("all");
  const [more, setMore] = useState(false);
  const grades = useMemo(() => {
    const seen = new Map();
    for (const l of labels) seen.set(l.grade, l.count);
    for (const s of sales) if (!labels.some((l) => l.grade === s.grade)) seen.set(s.grade, (seen.get(s.grade) || 0) + (s.count || 1));
    return [...seen.entries()]; // the labels, then in order of most recent sale
  }, [sales, labels]);
  const shown = sales.filter((s) => grade === "all" || s.grade === grade);
  const list = more ? shown : shown.slice(0, SHOW);
  const summaries = labels.filter((l) => grade === "all" || l.grade === grade);

  return (
    <div className="recent-sales">
      {label && <div className="small muted">{label}</div>}
      {summaries.length > 0 && (
        <div className="sale-labels">
          {summaries.map((l) => (
            <div key={l.grade} className="sale-label">
              <b>{l.grade}</b>
              <span className="small muted">
                {l.count.toLocaleString("en-US")} {l.count === 1 ? "sale" : "sales"} all-time
                {l.median ? ` · median ${money(l.median)}` : ""}
                {l.low && l.high && l.low !== l.high ? ` · ${money(l.low)}–${money(l.high)}` : ""}
                {l.last ? ` · last ${new Date(`${l.last}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
              </span>
            </div>
          ))}
        </div>
      )}
      {grades.length > 1 && (
        <div className="sale-chips" role="group" aria-label="Show sales for one grade">
          <button type="button" className={grade === "all" ? "on" : ""} onClick={() => { setGrade("all"); setMore(false); }}>All</button>
          {grades.map(([g, n]) => (
            <button key={g} type="button" className={grade === g ? "on" : ""} onClick={() => { setGrade(g); setMore(false); }}>
              {g} <span className="muted">{n}</span>
            </button>
          ))}
        </div>
      )}
      {list.map((s) => (
        <div key={s.key} className="recent-sale">
          <span className="muted">{new Date(`${s.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
          <span>{s.grade}</span>
          <b>{money(s.price)}</b>
          <span className="small muted">
            {s.href ? <a href={s.href} target="_blank" rel="noopener noreferrer sponsored">eBay sale ↗</a> : s.count > 1 ? `avg of ${s.count} sales` : ""}
          </span>
        </div>
      ))}
      {shown.length > SHOW && !more && <button type="button" className="link-btn small" onClick={() => setMore(true)}>Show all {shown.length}</button>}
      {soldHref && <a href={soldHref} target="_blank" rel={`noopener noreferrer${soldAffiliate ? " sponsored" : ""}`} className="small">All sold listings on eBay ↗</a>}
    </div>
  );
}
