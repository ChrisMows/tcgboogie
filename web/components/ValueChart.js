"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { money, pct } from "@/lib/collection";

const RANGES = [["7D", 7], ["30D", 30], ["90D", 90], ["1Y", 365], ["All", null]];

/**
 * Collection value over time. `points` are { day, value, cost? }. Ranges past the plan's history are shown locked.
 * With `profit` ({ cost, gain, gainPct } from summarize()) and cost data, it also draws what you paid and your profit.
 */
export default function ValueChart({ points, historyDays, height = 180, label = "Collection value", ranges = RANGES, profit = null }) {
  const [range, setRange] = useState(30);
  const hasCost = Boolean(profit?.cost) && points.some((p) => p.cost > 0);
  const [showCost, setShowCost] = useState(true);
  const costOn = hasCost && showCost;
  const shown = useMemo(() => {
    if (!range) return points;
    const cutoff = new Date(Date.now() - range * 86400000).toISOString().slice(0, 10);
    return points.filter((p) => p.day >= cutoff);
  }, [points, range]);
  const [hover, setHover] = useState(null);

  const W = 600, H = height;
  const vals = shown.flatMap((p) => (costOn && p.cost > 0 ? [p.value, p.cost] : [p.value]));
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const x = (i) => (shown.length > 1 ? (i / (shown.length - 1)) * W : W / 2);
  const y = (v) => H - 10 - ((v - min) / span) * (H - 24);
  const line = shown.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const costLine = costOn ? shown.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.cost || 0).toFixed(1)}`).join(" ") : null;
  const first = shown[0]?.value, last = shown[shown.length - 1]?.value;
  const delta = first ? (last - first) / first : null;
  const up = (delta ?? 0) >= 0;
  const at = hover !== null ? shown[hover] : null;

  return (
    <div className="chart-box">
      <div className="chart-head">
        <div>
          <div className="small muted">{at ? new Date(`${at.day}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : label}</div>
          <div className="chart-value">{money(at ? at.value : last)}</div>
          {!at && delta !== null && shown.length > 1 && (
            <div className={`small ${up ? "up" : "down"}`}>{up ? "▲" : "▼"} {money(Math.abs(last - first))} ({pct(delta)}) {range ? `in ${range} days` : "all time"}</div>
          )}
          {at && costOn && at.cost > 0 && <div className="small muted">Paid {money(at.cost)}</div>}
          {!at && hasCost && (
            <div className="small chart-profit">
              Paid {money(profit.cost)} ·{" "}
              <span className={profit.gain >= 0 ? "up" : "down"}>{profit.gain >= 0 ? "+" : "−"}{money(Math.abs(profit.gain))} profit ({pct(profit.gainPct)})</span>
              <span className="muted"> on cards with a price paid</span>
            </div>
          )}
        </div>
        <div className="chart-tools">
        {hasCost && (
          <label className="chart-toggle small">
            <input type="checkbox" checked={showCost} onChange={(e) => setShowCost(e.target.checked)} /> What I paid
          </label>
        )}
        <div className="range-btns" role="group" aria-label="Chart range">
          {ranges.map(([label, days]) => {
            const locked = historyDays && (days === null || days > historyDays);
            return locked ? (
              <Link key={label} href="/app/premium?from=history" className="locked" title="Full value history is a Premium feature">{label} 🔒</Link>
            ) : (
              <button key={label} type="button" className={range === days ? "on" : ""} onClick={() => setRange(days)}>{label}</button>
            );
          })}
        </div>
        </div>
      </div>
      {shown.length < 2 ? (
        <div className="chart-empty muted small">The chart fills in day by day as prices update.</div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="chart-svg" role="img"
          aria-label={`Collection value from ${money(first)} to ${money(last)}`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setHover(Math.max(0, Math.min(shown.length - 1, Math.round(((e.clientX - r.left) / r.width) * (shown.length - 1)))));
          }}>
          <defs>
            <linearGradient id="vc-fill" x2="0" y2="1">
              <stop stopColor={up ? "#d3ff66" : "#f85149"} stopOpacity=".22" />
              <stop offset="1" stopColor={up ? "#d3ff66" : "#f85149"} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#vc-fill)" />
          <path d={line} fill="none" stroke={up ? "#d3ff66" : "#f85149"} strokeWidth="2" vectorEffect="non-scaling-stroke" />
          {costLine && <path d={costLine} fill="none" stroke="#8f9aa9" strokeWidth="1.5" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />}
          {at && <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} stroke="#ffffff40" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
        </svg>
      )}
    </div>
  );
}
