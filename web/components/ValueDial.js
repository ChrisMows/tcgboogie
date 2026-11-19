"use client";

import { useRef, useState } from "react";
import InfoTip from "@/components/InfoTip";

const money = (v, d = 2) => `$${Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;

// The three readings, left to right. Market is the value everywhere else on the site.
export const DIAL_STOPS = [
  { key: "floor", label: "Floor", turn: -11, note: "The low end of recent sales. We're confident your cards are worth at least this." },
  { key: "market", label: "Market", turn: 0, note: "What your cards typically sell for now, from recent sales." },
  { key: "ceiling", label: "Ceiling", turn: 11, note: "The high end of recent sales: what your cards could fetch if every one sold well." },
];
const MAX_TURN = 20; // how far the bezel turns while dragging

// Bezel geometry (SVG units): two arcs of ticks around a center below the picture, with a gap at the top.
const W = 600, H = 250, CX = 300, CY = 300, R = 260;
const FROM = 26, TO = 74, TICKS = 17; // degrees from straight up, each side
// Rounded: the server and the browser can differ in the last decimals of sin/cos, which React reports as a mismatch.
const round = (v) => Math.round(v * 100) / 100;
const at = (deg, r = R) => [round(CX + r * Math.sin((deg * Math.PI) / 180)), round(CY - r * Math.cos((deg * Math.PI) / 180))];
const arc = (a, b, r) => { const [x1, y1] = at(a, r), [x2, y2] = at(b, r); return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`; };
const TICK_ANGLES = Array.from({ length: TICKS }, (_, i) => FROM + ((TO - FROM) * i) / (TICKS - 1));

function Ticks({ side, lit }) {
  // side -1 = left (Floor), 1 = right (Ceiling). lit: how many ticks glow, starting two up from the bottom.
  return TICK_ANGLES.map((a, i) => {
    const deg = side * a;
    const major = i % 4 === 0;
    const [x1, y1] = at(deg, R - (major ? 9 : 6)), [x2, y2] = at(deg, R + (major ? 9 : 6));
    const fromBottom = TICKS - 1 - i;
    const on = fromBottom >= 2 && fromBottom < 2 + lit;
    return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className={`dial-tick ${on ? "on" : ""} ${major ? "major" : ""}`}
      style={{ opacity: on ? 1 : round(0.18 + 0.72 * (i / (TICKS - 1))) }} />;
  });
}

/**
 * The collection's value on a dial: Floor, Market (where it starts) and Ceiling. Swipe or drag across it, tap an
 * arrow or a word, or use the arrow keys. Values come from lib/collection.js summarize (low, value, high).
 */
export default function ValueDial({ low, value, high, ranged, copies, extra = null }) {
  const [pos, setPos] = useState(1);
  const [drag, setDrag] = useState(null); // live bezel turn while dragging
  const start = useRef(null);
  const values = [low, value, high];
  const turn = drag ?? DIAL_STOPS[pos].turn;
  const live = drag === null ? pos : drag < -5 ? 0 : drag > 5 ? 2 : 1;
  const stop = DIAL_STOPS[live];
  const step = (d) => setPos((i) => Math.max(0, Math.min(2, i + d)));

  const onDown = (e) => {
    if (e.target.closest("button, .info-tip")) return;
    start.current = { x: e.clientX, turn: DIAL_STOPS[pos].turn, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    if (Math.abs(dx) > 4) start.current.moved = true;
    if (start.current.moved) setDrag(Math.max(-MAX_TURN, Math.min(MAX_TURN, start.current.turn + dx * 0.12)));
  };
  const onUp = () => {
    if (start.current?.moved && drag !== null) setPos(live);
    start.current = null;
    setDrag(null);
  };
  const onKey = (e) => {
    const k = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
    if (k) { e.preventDefault(); step(k); }
    if (e.key === "Home") { e.preventDefault(); setPos(0); }
    if (e.key === "End") { e.preventDefault(); setPos(2); }
  };

  return (
    <div
      className={`dial ${drag !== null ? "dragging" : ""}`}
      role="slider" tabIndex={0} aria-label="Collection value estimate"
      aria-valuemin={0} aria-valuemax={2} aria-valuenow={pos} aria-valuetext={`${DIAL_STOPS[pos].label}: ${money(values[pos])}`}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={onKey}
    >
      <svg className="dial-ring" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <defs>
          <path id="dial-floor-path" d={arc(-64, -36, R - 36)} />
          <path id="dial-ceiling-path" d={arc(36, 64, R - 36)} />
        </defs>
        <g className="dial-bezel" style={{ transform: `rotate(${turn}deg)` }}>
          <Ticks side={-1} lit={live === 0 ? 4 : 1} />
          <Ticks side={1} lit={live === 2 ? 4 : 1} />
          {[["floor", 0], ["ceiling", 2]].map(([key, i]) => (
            <text key={key} className={`dial-word ${live === i ? "on" : ""}`} onClick={() => setPos(i)}>
              <textPath href={`#dial-${key}-path`} startOffset="50%" textAnchor="middle">{DIAL_STOPS[i].label.toUpperCase()}</textPath>
            </text>
          ))}
        </g>
      </svg>

      <div className="dial-center">
        <button type="button" className="dial-arrow" aria-label="Lower estimate" disabled={pos === 0} tabIndex={-1} onClick={() => step(-1)}><svg viewBox="0 0 24 40" aria-hidden="true"><polyline points="18,5 6,20 18,35" /></svg></button>
        <div className="coll-hero-value sensitive" aria-live="polite">{money(values[live])}</div>
        <button type="button" className="dial-arrow" aria-label="Higher estimate" disabled={pos === 2} tabIndex={-1} onClick={() => step(1)}><svg viewBox="0 0 24 40" aria-hidden="true"><polyline points="6,5 18,20 6,35" /></svg></button>
      </div>
      <div className="dial-name">
        <span>{stop.label.toUpperCase()}</span>
        {/* What this reading means, and which cards count the same in all three: behind an ⓘ, not under the value. */}
        <InfoTip label={`About the ${stop.label} value`}>
          {stop.note}
          {ranged < copies && (
            <>{" "}{copies - ranged} of your {copies} cards {copies - ranged === 1 ? "has" : "have"} too few recent sales for a range (or your own
              value), so {copies - ranged === 1 ? "it counts" : "they count"} the same in all three.</>
          )}
        </InfoTip>
        {extra}
      </div>
      <div className="dial-horizon" aria-hidden="true" />
    </div>
  );
}
