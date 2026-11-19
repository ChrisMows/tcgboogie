"use client";

import { useEffect, useRef, useState } from "react";
import InfoTip from "@/components/InfoTip";

const money = (v, d = 2) => `$${Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;

// The three readings, left to right. Market is the value everywhere else on the site. `turn` slides the bezel's ticks
// along the ring (degrees), so moving between readings looks like turning a watch bezel.
export const DIAL_STOPS = [
  { key: "floor", label: "Floor", turn: -7, note: "The low end of recent sales. We're confident your cards are worth at least this." },
  { key: "market", label: "Market", turn: 0, note: "What your cards typically sell for now, from recent sales." },
  { key: "ceiling", label: "Ceiling", turn: 7, note: "The high end of recent sales: what your cards could fetch if every one sold well." },
];
const MAX_TURN = 12;

// The bezel: a ring tilted away from the viewer (an ellipse), drawn in the design mockup's own coordinates (1536 wide).
// Ticks run down each side from near the top, past the widest point, and curl under toward the value; the far ones are
// small and faint, the near ones larger and brighter.
const VB = { x: 150, y: 120, w: 1236, h: 420 }; // the ring with the empty sides cropped off
const CX = 768, CY = 400, RX = 565, RY = 235;
const FIRST = 14, LAST = 134, STEP = 4.5; // degrees around the ring, from straight up
const BASE = Array.from({ length: Math.floor((LAST + 12 - FIRST) / STEP) + 1 }, (_, i) => FIRST - 6 + i * STEP);
const LIT = BASE.reduce((best, a, i) => (Math.abs(a - 100) < Math.abs(BASE[best] - 100) ? i : best), 0); // the glowing tick
// Rounded: the server and the browser can differ in the last decimals of sin/cos, which React reports as a mismatch.
const round = (v) => Math.round(v * 10) / 10;

// A point on the ring. Past the widest point (90 degrees) the ring curls under faster than an ellipse, as in the mockup.
function ringPoint(side, deg) {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  return [side * RX * Math.sin(rad), -RY * c * (c < 0 ? 0.5 : 1)];
}

function tick(side, deg) {
  const t = Math.min(1, (deg - FIRST) / (100 - FIRST)); // 0 at the top, 1 from the glowing tick on
  const [x, y] = ringPoint(side, deg);
  // Outward normal: perpendicular to the ring's direction here, pointing away from the center.
  const [ax, ay] = ringPoint(side, deg - 0.5), [bx, by] = ringPoint(side, deg + 0.5);
  let nx = by - ay, ny = -(bx - ax);
  const n = Math.hypot(nx, ny); nx /= n; ny /= n;
  if (nx * x + ny * y < 0) { nx = -nx; ny = -ny; }
  const len = 16 + 22 * t;
  const fade = Math.min(1, (deg - FIRST) / 16, (LAST - deg) / 8);
  return {
    x1: round(CX + x - (nx * len) / 2), y1: round(CY + y - (ny * len) / 2),
    x2: round(CX + x + (nx * len) / 2), y2: round(CY + y + (ny * len) / 2),
    width: round(3.5 + 3 * t), opacity: Math.max(0, round(fade * (0.3 + 0.6 * t) * 100) / 100),
  };
}

function Side({ side, turn, active, market }) {
  return BASE.map((a, i) => {
    const deg = a + side * turn;
    if (deg < FIRST || deg > LAST) return null;
    const k = tick(side, deg);
    // The glowing tick: one each side at Market; on the side you've turned to, it and its neighbours glow.
    const lit = i === LIT || (active && Math.abs(i - LIT) <= 2);
    const dim = !active && !market && i === LIT;
    return <line key={i} x1={k.x1} y1={k.y1} x2={k.x2} y2={k.y2} className={`dial-tick ${lit ? (dim ? "dim" : "on") : ""}`}
      style={{ strokeWidth: lit ? k.width + 2.5 : k.width, opacity: lit ? (dim ? 0.45 : 1) : k.opacity }} />;
  });
}

/**
 * The collection's value on a dial: Floor, Market (where it starts) and Ceiling. Swipe or drag across it, tap an
 * arrow or a word, or use the arrow keys. Values come from lib/collection.js summarize (low, value, high).
 */
export default function ValueDial({ low, value, high, ranged, copies, extra = null }) {
  const [pos, setPos] = useState(1);
  const [drag, setDrag] = useState(null); // bezel turn while dragging
  const [shown, setShown] = useState(0); // the bezel's turn on screen, eased toward the reading
  const start = useRef(null);
  const values = [low, value, high];
  const live = drag === null ? pos : drag < -2.5 ? 0 : drag > 2.5 ? 2 : 1;
  const stop = DIAL_STOPS[live];
  const step = (d) => setPos((i) => Math.max(0, Math.min(2, i + d)));

  // Ease the bezel to its new position with a small overshoot, like a detent.
  useEffect(() => {
    if (drag !== null) { setShown(drag); return; }
    const from = shown, to = DIAL_STOPS[pos].turn;
    if (from === to) return;
    const t0 = performance.now(), dur = 420;
    let raf;
    const ease = (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2; // ease-out with overshoot
    const frame = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      setShown(from + (to - from) * ease(t));
      if (t < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [pos, drag]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDown = (e) => {
    if (e.target.closest("button, .info-tip")) return;
    start.current = { x: e.clientX, turn: DIAL_STOPS[pos].turn, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    if (Math.abs(dx) > 4) start.current.moved = true;
    if (start.current.moved) setDrag(Math.max(-MAX_TURN, Math.min(MAX_TURN, start.current.turn + dx * 0.06)));
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
      <svg className="dial-ring" viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`} aria-hidden="true">
        <Side side={-1} turn={shown} active={live === 0} market={live === 1} />
        <Side side={1} turn={shown} active={live === 2} market={live === 1} />
        <text className={`dial-word ${live === 0 ? "on" : ""}`} x="408" y="292" transform="rotate(-11 408 292)" textAnchor="middle" onClick={() => setPos(0)}>FLOOR</text>
        <text className={`dial-word ${live === 2 ? "on" : ""}`} x="1128" y="292" transform="rotate(11 1128 292)" textAnchor="middle" onClick={() => setPos(2)}>CEILING</text>
      </svg>

      <div className="dial-center">
        <button type="button" className="dial-arrow" aria-label="Lower estimate" disabled={pos === 0} tabIndex={-1} onClick={() => step(-1)}>
          <svg viewBox="0 0 24 40" aria-hidden="true"><polyline points="18,5 6,20 18,35" /></svg>
        </button>
        <div className="coll-hero-value sensitive" aria-live="polite">{money(values[live])}</div>
        <button type="button" className="dial-arrow" aria-label="Higher estimate" disabled={pos === 2} tabIndex={-1} onClick={() => step(1)}>
          <svg viewBox="0 0 24 40" aria-hidden="true"><polyline points="6,5 18,20 6,35" /></svg>
        </button>
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
