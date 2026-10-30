"use client";

import HideValues from "@/components/HideValues";
import Link from "next/link";
import { useMemo, useState } from "react";
import { money, pct } from "@/lib/collection";
import { setChartRange, useChartRange } from "@/lib/chart-range";

const RANGES = [["1D", 1], ["7D", 7], ["30D", 30], ["90D", 90], ["1Y", 365], ["All", null]];

/**
 * Collection value over time. `points` are { day, value, cost? }. Ranges past the plan's history are shown locked.
 * With `profit` ({ cost, gain, gainPct } from summarize()) and cost data, it also draws what you paid and your profit.
 * With `changes` ({ [days]: { change, pct } }, 0 = all time, from lib/collection.js marketChange), the change shown for
 * a range is the price movement of the cards owned then, so cards added in the range don't read as gains.
 */
export default function ValueChart({ points, historyDays, height = 180, label = "Collection value", ranges = RANGES, profit = null, hideable = false, changes = null, shared = false, current = null }) {
  // current: the value to show when not hovering (a card page's price today, which can be newer than its history)
  // shared: the range is the collection's (lib/chart-range.js), so the card list's % changes follow it.
  const [own, setOwn] = useState(30);
  const sharedRange = useChartRange();
  const range = shared ? sharedRange : own;
  const setRange = shared ? setChartRange : setOwn;
  const hasCost = Boolean(profit?.cost) && points.some((p) => p.cost > 0);
  const [showCost, setShowCost] = useState(true);
  const costOn = hasCost && showCost;
  const shown = useMemo(() => {
    if (!range) return points;
    const cutoff = new Date(Date.now() - range * 86400000).toISOString().slice(0, 10);
    // Start from the last saved day before the range, so the line covers all of it (days are saved on visits).
    const before = points.filter((p) => p.day < cutoff).pop();
    return [...(before ? [before] : []), ...points.filter((p) => p.day >= cutoff)];
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
  const market = changes ? changes[range ?? 0] : undefined; // price moves only (see above)
  // With `changes`, a range without a price-only figure shows no change rather than one inflated by added cards.
  const moved = changes ? market?.change ?? null : first ? last - first : null;
  const delta = changes ? market?.pct ?? null : first ? (last - first) / first : null;
  const up = (delta ?? 0) >= 0;
  const at = hover !== null ? shown[hover] : null;

  return (
    <div className="chart-box">
      <div className="chart-head">
        <div>
          <div className="small muted">{at ? new Date(`${at.day}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : label}</div>
          <div className="chart-value-row"><div className={`chart-value ${hideable ? "sensitive" : ""}`}>{money(at ? at.value : current ?? last)}</div>{hideable && <HideValues />}</div>
          {!at && delta !== null && shown.length > 1 && (
            <div className={`small ${hideable ? "sensitive" : ""} ${up ? "up" : "down"}`}>
              {up ? "▲" : "▼"} {money(Math.abs(moved))} ({pct(delta)}) {range === 1 ? "today" : range ? `in ${range} days` : "all time"}
              {market && <span className="muted"> from price moves</span>}
            </div>
          )}
          {at && costOn && at.cost > 0 && <div className={`small muted ${hideable ? "sensitive" : ""}`}>Paid {money(at.cost)}</div>}
          {!at && hasCost && (
            <div className={`small chart-profit ${hideable ? "sensitive" : ""}`}>
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
