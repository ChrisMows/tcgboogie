"use client";

import Link from "next/link";
import { useState } from "react";
import CardThumb from "@/components/CardThumb";
import CollectionAlerts from "@/components/CollectionAlerts";
import HideValues from "@/components/HideValues";
import ValueChart from "@/components/ValueChart";

const money = (v, d = 2) => `$${Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const pct = (v) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

/**
 * Collection page top: the total, front and center, then a row of round actions. Movers, alerts and the value
 * chart open in a panel right under the row (one at a time), so the page itself stays simple.
 */
export default function CollectionHero({ summary, week, adding, exportAllowed, tradeAllowed = true, movers, chart, historyDays, plan, prefs, hasCards }) {
  const [open, setOpen] = useState(null); // "movers" | "alerts" | "chart"
  const toggle = (k) => setOpen((o) => (o === k ? null : k));

  const actions = [
    { key: "add", label: adding ? "Done" : "Add cards", icon: adding ? "✓" : "+", href: adding ? "/app/collection" : "/app/collection?add=1", primary: true },
    { key: "sets", label: "Sets", icon: "▦", href: "/app/collection/sets" },
    { key: "movers", label: "Movers", icon: "📈", panel: true },
    { key: "grading", label: "Worth Grading?", icon: "💎", href: "/app/collection/grading" },
    { key: "trade", label: "Trade", icon: tradeAllowed ? "⇄" : "🔒", href: "/app/collection/trade" },
    { key: "alerts", label: "Alerts", icon: "🔔", panel: true },
    { key: "chart", label: "Chart", icon: "📊", panel: true },
    exportAllowed
      ? { key: "export", label: "Export", icon: "⤓", href: "/app/collection/export", download: true }
      : { key: "export", label: "Export", icon: "🔒", href: "/app/premium?from=export" },
  ];

  return (
    <>
      <section className="coll-hero">
        <div className="small muted">Collection value</div>
        <div className="coll-hero-value-row">
          <div className="coll-hero-value sensitive">{money(summary.value)}</div>
          <HideValues className="icon-only" />
        </div>
        <div className="small coll-hero-sub">
          {week !== null && Math.abs(week.change) >= 0.005 && (
            <span className={`sensitive ${week.change >= 0 ? "up" : "down"}`}>{week.change >= 0 ? "▲" : "▼"} {money(Math.abs(week.change))} ({pct(week.pct)}) this week</span>
          )}
          <span className="muted">{week !== null && Math.abs(week.change) >= 0.005 ? " · " : ""}{summary.copies} {summary.copies === 1 ? "card" : "cards"}</span>
          {summary.gain !== null && summary.cost > 0 && (
            <span className="muted"> · <span className={`sensitive ${summary.gain >= 0 ? "up" : "down"}`}>{summary.gain >= 0 ? "+" : "−"}{money(Math.abs(summary.gain), 0)}</span> on what you paid</span>
          )}
        </div>
        {summary.unpriced > 0 && (
          <div className="hint">{summary.unpriced} {summary.unpriced === 1 ? "copy has" : "copies have"} no market value yet and {summary.unpriced === 1 ? "isn't" : "aren't"} counted. Set your own value from Edit.</div>
        )}
      </section>

      <nav className="coll-actions" aria-label="Collection tools">
        {actions.map((a) => {
          const inner = (<><span className="coll-action-icon" aria-hidden="true">{a.icon}</span><span className="coll-action-label">{a.label}</span></>);
          const cls = `coll-action ${a.primary ? "primary" : ""} ${open === a.key ? "on" : ""}`;
          if (a.panel) return <button key={a.key} type="button" className={cls} aria-expanded={open === a.key} onClick={() => toggle(a.key)}>{inner}</button>;
          if (a.download) return <a key={a.key} className={cls} href={a.href} download>{inner}</a>;
          return <Link key={a.key} className={cls} href={a.href}>{inner}</Link>;
        })}
      </nav>

      {open === "movers" && (
        <div className="panel coll-pop">
          <h2>Biggest movers · 7 days</h2>
          {movers.length === 0 ? <p className="small muted" style={{ margin: 0 }}>No big moves this week.</p> : movers.map((it) => (
            <Link key={it.id} href={`/app/cards/${it.productId}`} className="mini-row">
              <CardThumb item={it} width={30} />
              <span className="mini-text"><b>{it.name}</b><span className="small muted">{it.label}</span></span>
              <span className={`small ${it.change7 >= 0 ? "up" : "down"}`}>{it.change7 >= 0 ? "▲" : "▼"} {pct(it.change7)}</span>
            </Link>
          ))}
        </div>
      )}
      {open === "alerts" && <CollectionAlerts plan={plan} prefs={prefs} />}
      {open === "chart" && (
        <div className="panel coll-chart coll-pop">
          {hasCards ? <ValueChart points={chart} historyDays={historyDays} profit={summary} hideable />
            : <p className="small muted" style={{ margin: 0 }}>Add a card and your collection&apos;s value is charted day by day.</p>}
        </div>
      )}
    </>
  );
}
