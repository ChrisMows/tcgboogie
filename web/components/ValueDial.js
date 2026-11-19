"use client";

import { useRef, useState } from "react";

const money = (v, d = 2) => `$${Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;

// The three readings, left to right on the dial. Market is the value everywhere else on the site.
export const DIAL_STOPS = [
  { key: "floor", label: "Floor", angle: -52, note: "The low end of recent sales. We're confident your cards are worth at least this." },
  { key: "market", label: "Market", angle: 0, note: "What your cards typically sell for now, from recent sales." },
  { key: "top", label: "Top", angle: 52, note: "The high end of recent sales: what your cards could fetch if every one sold well." },
];
const MAX = 64; // how far the needle turns while dragging

/**
 * The collection's value on a dial: Floor, Market (where it starts) and Top. Swipe or drag across it, tap a label,
 * or use the arrow keys to turn it. Values come from lib/collection.js summarize (low, value, high).
 */
export default function ValueDial({ low, value, high, ranged, copies, extra = null }) {
  const [at, setAt] = useState(1);
  const [drag, setDrag] = useState(null); // live needle angle while dragging
  const start = useRef(null);
  const values = [low, value, high];
  const stop = DIAL_STOPS[at];
  const angle = drag ?? stop.angle;

  const nearest = (a) => DIAL_STOPS.reduce((best, s, i) => (Math.abs(s.angle - a) < Math.abs(DIAL_STOPS[best].angle - a) ? i : best), 0);
  const onDown = (e) => {
    start.current = { x: e.clientX, angle: stop.angle, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    if (Math.abs(dx) > 4) start.current.moved = true;
    if (start.current.moved) setDrag(Math.max(-MAX, Math.min(MAX, start.current.angle + dx * 0.45)));
  };
  const onUp = () => {
    if (start.current?.moved && drag !== null) setAt(nearest(drag));
    start.current = null;
    setDrag(null);
  };
  const onKey = (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); setAt((i) => Math.max(0, i - 1)); }
    if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); setAt((i) => Math.min(2, i + 1)); }
    if (e.key === "Home") { e.preventDefault(); setAt(0); }
    if (e.key === "End") { e.preventDefault(); setAt(2); }
  };

  // Dial geometry: an arc across the top of a circle, ticks at each stop, the needle from the center.
  const R = 92, CX = 120, CY = 112;
  const point = (deg, r = R) => [CX + r * Math.sin((deg * Math.PI) / 180), CY - r * Math.cos((deg * Math.PI) / 180)];
  const [ax, ay] = point(-MAX - 4), [bx, by] = point(MAX + 4);
  const live = drag !== null ? nearest(drag) : at;

  return (
    <div className="dial">
      <div
        className={`dial-face ${drag !== null ? "dragging" : ""}`}
        role="slider" tabIndex={0} aria-label="Collection value estimate"
        aria-valuemin={0} aria-valuemax={2} aria-valuenow={at} aria-valuetext={`${stop.label}: ${money(values[at])}`}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={onKey}
      >
        <svg viewBox="0 0 240 124" aria-hidden="true">
          <path className="dial-track" d={`M ${ax} ${ay} A ${R} ${R} 0 0 1 ${bx} ${by}`} />
          {DIAL_STOPS.map((s, i) => {
            const [x1, y1] = point(s.angle, R - 7), [x2, y2] = point(s.angle, R + 7);
            return <line key={s.key} className={`dial-tick ${i === live ? "on" : ""}`} x1={x1} y1={y1} x2={x2} y2={y2} />;
          })}
          <line className="dial-needle" x1={CX} y1={CY} x2={CX} y2={CY - R + 16} style={{ transform: `rotate(${angle}deg)` }} />
          <circle className="dial-hub" cx={CX} cy={CY} r="6" />
        </svg>
        <div className="dial-labels">
          {DIAL_STOPS.map((s, i) => (
            <button key={s.key} type="button" tabIndex={-1} className={i === live ? "on" : ""} onClick={() => setAt(i)}
              onPointerDown={(e) => e.stopPropagation()}>{s.label}</button>
          ))}
        </div>
      </div>
      <div className="coll-hero-value-row">
        <div className="coll-hero-value sensitive" aria-live="polite">{money(values[live])}</div>
        {extra}
      </div>
      <p className="dial-note">{DIAL_STOPS[live].note}</p>
      {ranged < copies && (
        <p className="dial-note muted">
          {copies - ranged} of your {copies} cards {copies - ranged === 1 ? "has" : "have"} too few recent sales for a range (or your own value), so
          {copies - ranged === 1 ? " it counts" : " they count"} the same in all three.
        </p>
      )}
    </div>
  );
}
