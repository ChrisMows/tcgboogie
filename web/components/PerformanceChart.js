"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { money } from "@/lib/collection";
import { setChartRange, useChartRange } from "@/lib/chart-range";

// Home → Performance: "Collection performance". Three figures across the top (value, the price change for the range
// picked, profit on what was paid), then the value chart with a price axis, dates, the latest value marked at the end
// of the line, and an optional purchase-cost line. The range is the collection's (lib/chart-range.js).
const RANGES = [["1D", 1], ["7D", 7], ["30D", 30], ["90D", 90], ["1Y", 365], ["All", null]];
const RANGE_WORDS = { 1: "1-day", 7: "7-day", 30: "30-day", 90: "90-day", 365: "1-year" };
const pct = (v) => `${v >= 0 ? "+" : "−"}${(Math.abs(v) * 100).toFixed(v !== 0 && Math.abs(v) < 0.001 ? 2 : 1)}%`;
const signed = (v) => `${v >= 0 ? "+" : "−"}${money(Math.abs(v))}`;
const shortDay = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Round axis steps ($200, $250, $500, $1,000...) and the ticks between min and max. */
function ticks(min, max) {
  const raw = (max - min || Math.abs(max) || 1) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const lo = Math.floor(min / step) * step, hi = Math.max(lo + step, Math.ceil(max / step) * step);
  const out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

/**
 * points: [{ day, value, cost }]. summary: { value, cost, gain, gainPct } (lib/collection.js summarize). changes:
 * { [days]: { change, pct } } price moves only, 0 = all time. historyDays: the plan's chart history (null = all).
 */
export default function PerformanceChart({ points, summary, changes, historyDays }) {
  const range = useChartRange();
  const hasCost = summary.cost > 0 && points.some((p) => p.cost > 0);
  const [showCost, setShowCost] = useState(false);
  const costOn = hasCost && showCost;
  const [hover, setHover] = useState(null);

  const shown = useMemo(() => {
    if (!range) return points;
    const cutoff = new Date(Date.now() - range * 86400000).toISOString().slice(0, 10);
    // Start from the last saved day before the range, so the line covers all of it (days are saved on visits).
    const before = points.filter((p) => p.day < cutoff).pop();
    return [...(before ? [before] : []), ...points.filter((p) => p.day >= cutoff)];
  }, [points, range]);

  const vals = shown.flatMap((p) => (costOn && p.cost > 0 ? [p.value, p.cost] : [p.value]));
  const axis = vals.length ? ticks(Math.min(...vals), Math.max(...vals)) : [];
  const lo = axis[0], hi = axis[axis.length - 1];
  const W = 800, H = 200;
  const xp = (i) => (shown.length > 1 ? i / (shown.length - 1) : 1); // 0..1
  const yp = (v) => 1 - (v - lo) / (hi - lo || 1); // 0 (top)..1
  const path = (get) => shown.map((p, i) => `${i ? "L" : "M"}${(xp(i) * W).toFixed(1)},${(yp(get(p)) * H).toFixed(1)}`).join(" ");
  const line = path((p) => p.value);
  const costLine = costOn ? path((p) => p.cost || 0) : null;
  const last = shown[shown.length - 1];
  const up = shown.length > 1 ? last.value >= shown[0].value : true;
  const color = up ? "var(--accent)" : "var(--bad)";
  // About five dates along the bottom, first and last included.
  const dates = shown.length > 1 ? [...new Set([0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (shown.length - 1))))] : [];

  const market = changes?.[range ?? 0] ?? null;
  const at = hover !== null ? shown[hover] : null;

  return (
    <div className="panel perf coll-chart">
      <h2 className="perf-title">Collection performance</h2>
      <p className="muted perf-sub">Track your collection over time.</p>

      <div className="perf-stats">
        <div>
          <span className="muted">Collection value</span>
          <b className="sensitive">{money(summary.value)}</b>
        </div>
        <div>
          <span className="muted">{range ? RANGE_WORDS[range] || `${range}-day` : "All-time"} price change</span>
          {market ? (
            <>
              <b className={`sensitive ${market.change >= 0 ? "up" : "down"}`}>{signed(market.change)}</b>
              <span className={market.change >= 0 ? "up" : "down"}>{pct(market.pct)}</span>
            </>
          ) : <span className="small muted perf-none">Not enough history yet</span>}
        </div>
        <div>
          <span className="muted">Purchase profit</span>
          {summary.cost > 0 ? (
            <>
              <b className={`sensitive ${summary.gain >= 0 ? "up" : "down"}`}>{signed(summary.gain)}</b>
              <span className={summary.gain >= 0 ? "up" : "down"}>{pct(summary.gainPct)}</span>
            </>
          ) : <span className="small muted perf-none">Add what you paid (Edit on a card) to see it</span>}
        </div>
      </div>

      <div className="perf-bar">
        <h3>Collection value</h3>
        <div className="perf-tools">
          {hasCost && (
            <label className="perf-switch">
              <input type="checkbox" checked={showCost} onChange={(e) => setShowCost(e.target.checked)} />
              <span aria-hidden="true" />Show purchase cost
            </label>
          )}
          <div className="perf-ranges" role="group" aria-label="Chart range">
            {RANGES.map(([label, days]) => {
              const locked = historyDays && (days === null || days > historyDays);
              return locked ? (
                <Link key={label} href="/app/premium?from=history" className="locked" title="Full value history is a Premium feature">{label} 🔒</Link>
              ) : (
                <button key={label} type="button" className={range === days ? "on" : ""} onClick={() => setChartRange(days)}>{label}</button>
              );
            })}
          </div>
        </div>
      </div>

      {shown.length < 2 ? (
        <div className="chart-empty muted small">The chart fills in day by day as prices update.</div>
      ) : (
        <div className="perf-plot">
          <div className="perf-area"
            onMouseLeave={() => setHover(null)}
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setHover(Math.max(0, Math.min(shown.length - 1, Math.round(((e.clientX - r.left) / r.width) * (shown.length - 1)))));
            }}>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="chart-svg" role="img"
              aria-label={`Collection value from ${money(shown[0].value)} to ${money(last.value)}`}>
              <defs>
                <linearGradient id="perf-fill" x2="0" y2="1">
                  <stop stopColor={up ? "#d3ff66" : "#f85149"} stopOpacity=".2" />
                  <stop offset="1" stopColor={up ? "#d3ff66" : "#f85149"} stopOpacity="0" />
                </linearGradient>
              </defs>
              {axis.map((v) => (
                <line key={v} x1="0" x2={W} y1={yp(v) * H} y2={yp(v) * H} stroke="var(--border)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
              ))}
              <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#perf-fill)" />
              {costLine && <path d={costLine} fill="none" stroke="#8f9aa9" strokeWidth="1.5" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />}
              <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
              {at && <line x1={xp(hover) * W} x2={xp(hover) * W} y1="0" y2={H} stroke="#ffffff40" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
            </svg>
            {/* The latest value, at the end of the line. */}
            <span className="perf-dot" style={{ top: `${yp(last.value) * 100}%`, background: color }} />
            {at && (
              <div className="perf-tip" style={{ left: `${xp(hover) * 100}%`, top: `${yp(at.value) * 100}%` }}>
                <span className="small muted">{shortDay(at.day)}</span>
                <b className="sensitive">{money(at.value)}</b>
                {costOn && at.cost > 0 && <span className="small muted sensitive">Paid {money(at.cost)}</span>}
              </div>
            )}
          </div>
          <div className="perf-y" aria-hidden="true">
            {axis.map((v) => <span key={v} className="sensitive" style={{ top: `${yp(v) * 100}%` }}>{money(v, 0)}</span>)}
            <span className={`perf-badge sensitive ${up ? "" : "down"}`} style={{ top: `${yp(last.value) * 100}%` }}>{money(last.value, 0)}</span>
          </div>
          <div className="perf-x" aria-hidden="true">
            {dates.map((i) => <span key={i} style={{ left: `${xp(i) * 100}%` }}>{shortDay(shown[i].day)}</span>)}
          </div>
        </div>
      )}
      <p className="hint" style={{ margin: "10px 0 0" }}>
        The chart includes cards added during this period; the price change doesn&apos;t.{costOn ? " The dashed line is what you paid." : ""}
      </p>
    </div>
  );
}
