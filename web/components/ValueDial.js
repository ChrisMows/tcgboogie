"use client";

import { useEffect, useRef, useState } from "react";
import InfoTip from "@/components/InfoTip";

const money = (v, d = 2) => `$${Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;

// The three readings, in order. Market is the value everywhere else on the site.
export const DIAL_STOPS = [
  { key: "floor", label: "Floor", note: "The low end of recent sales. We're confident your cards are worth at least this." },
  { key: "market", label: "Market", note: "What your cards typically sell for now, from recent sales." },
  { key: "ceiling", label: "Ceiling", note: "The high end of recent sales: what your cards could fetch if every one sold well." },
];

/*
 * A round bezel seen at a slight angle (so it draws as an ellipse), around the value. The three readings ride an inner
 * track of the same ring like a carousel: the one in front, under the value, is the reading shown; the others sit up
 * the ring to its left and right. Turning to Ceiling brings it round to the front and slides Market up to the left.
 * The ticks turn with it. `p` is the position, 0 (Floor) to 2 (Ceiling), and moves continuously.
 */
const VB_W = 1000, VB_H = 600;
// Proportions from the design mockup: the ring fills the top half, its lower ends stop just above the value, and the
// reading in front sits under the value.
const RING = { cx: 500, cy: 180, rx: 450, ry: 140 }; // the ticks
const TRACK = { cx: 500, cy: 245, rx: 335, ry: 212 }; // the readings' path: the front is at y 457, under the value
const SPACING = 120; // degrees between readings on the track
// Degrees from the top of the ring. The ends run on past the glowing tick, curling down and in toward the value.
const TICK_STEP = 8, TOP_GAP = 16, END = 138, LIT_AT = 114;
const round = (v) => Math.round(v * 10) / 10; // the server and the browser can differ in sin/cos's last decimals
const rad = (d) => (d * Math.PI) / 180;
const pointOn = (e, deg) => [e.cx + e.rx * Math.sin(rad(deg)), e.cy - e.ry * Math.cos(rad(deg))];
const wrap = (d) => ((d % 360) + 540) % 360 - 180; // -180..180, 0 at the top

/** The ticks for the ring turned by `turn` degrees. */
function ticks(turn) {
  const out = [];
  for (let base = 0; base < 360; base += TICK_STEP) {
    const deg = wrap(base + turn);
    const off = Math.abs(deg);
    if (off < TOP_GAP - 6 || off > END + 6) continue;
    const near = Math.min(1, Math.max(0, (off - TOP_GAP) / (90 - TOP_GAP))); // 0 at the back (top), 1 at the sides
    const fade = Math.max(0, Math.min(1, (off - (TOP_GAP - 6)) / 10, (END + 6 - off) / 10));
    const [x, y] = pointOn(RING, deg);
    // Outward normal of the ellipse here.
    let nx = (x - RING.cx) / (RING.rx * RING.rx), ny = (y - RING.cy) / (RING.ry * RING.ry);
    const n = Math.hypot(nx, ny); nx /= n; ny /= n;
    const len = 14 + 22 * near;
    out.push({ key: base, deg, x1: round(x - nx * len / 2), y1: round(y - ny * len / 2), x2: round(x + nx * len / 2), y2: round(y + ny * len / 2),
      width: round(3 + 2.6 * near), opacity: round(fade * (0.28 + 0.62 * near) * 100) / 100 });
  }
  // The glowing tick on each side: whichever tick is nearest LIT_AT right now, so the glow stays put as the ring turns.
  for (const side of [-1, 1]) {
    let best = null;
    for (const t of out) if (Math.sign(t.deg) === side && (!best || Math.abs(Math.abs(t.deg) - LIT_AT) < Math.abs(Math.abs(best.deg) - LIT_AT))) best = t;
    if (best) best.lit = true;
  }
  return out;
}

export default function ValueDial({ low, value, high, ranged, copies, extra = null }) {
  const [p, setP] = useState(1); // continuous position: 0 Floor, 1 Market, 2 Ceiling
  const phys = useRef({ p: 1, v: 0, target: 1, raf: 0, drag: null });
  const box = useRef(null);
  const settled = Math.round(p);
  const stop = DIAL_STOPS[Math.max(0, Math.min(2, settled))];

  // The value between readings, so the number rolls as the ring turns.
  const shownValue = p <= 1 ? low + (value - low) * Math.max(0, p) : value + (high - value) * Math.min(1, p - 1);

  // A spring toward the target, with a little give past the ends.
  const run = () => {
    const s = phys.current;
    cancelAnimationFrame(s.raf);
    let last = performance.now();
    const frame = (now) => {
      // Small fixed steps for the time that really passed, so a slow phone or a dropped frame never runs in slow motion.
      let left = Math.min(0.1, (now - last) / 1000); last = now;
      const k = 150, c = 21; // stiffness, damping: smooth and unhurried, with a soft settle
      while (left > 0) {
        const dt = Math.min(1 / 240, left); left -= dt;
        s.v += (-k * (s.p - s.target) - c * s.v) * dt;
        s.p += s.v * dt;
      }
      if (Math.abs(s.p - s.target) < 0.0005 && Math.abs(s.v) < 0.002) { s.p = s.target; s.v = 0; setP(s.p); return; }
      setP(s.p);
      s.raf = requestAnimationFrame(frame);
    };
    s.raf = requestAnimationFrame(frame);
  };
  const goTo = (i) => { const s = phys.current; s.target = Math.max(0, Math.min(2, i)); run(); };
  useEffect(() => () => cancelAnimationFrame(phys.current.raf), []);

  // Dragging: the ring follows the finger; letting go keeps some momentum, then settles on the nearest reading.
  const stepPx = () => (box.current?.getBoundingClientRect().width || 600) * 0.3;
  const onDown = (e) => {
    if (e.target.closest("button, .info-tip, .hide-values-btn")) return;
    const s = phys.current;
    cancelAnimationFrame(s.raf);
    s.drag = { x: e.clientX, p: s.p, t: performance.now(), lastX: e.clientX, lastT: performance.now(), vel: 0, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    const s = phys.current, d = s.drag;
    if (!d) return;
    if (Math.abs(e.clientX - d.x) > 3) d.moved = true;
    if (!d.moved) return;
    const now = performance.now();
    let next = d.p - (e.clientX - d.x) / stepPx();
    if (next < 0) next = -Math.pow(-next, 0.7) * 0.35; // rubber band past Floor
    if (next > 2) next = 2 + Math.pow(next - 2, 0.7) * 0.35; // and past Ceiling
    const dt = Math.max(1, now - d.lastT);
    d.vel = 0.8 * (-(e.clientX - d.lastX) / stepPx() / (dt / 1000)) + 0.2 * d.vel;
    d.lastX = e.clientX; d.lastT = now;
    s.p = next; setP(next);
  };
  const onUp = () => {
    const s = phys.current, d = s.drag;
    s.drag = null;
    if (!d || !d.moved) return;
    s.v = d.vel;
    goTo(Math.round(s.p + d.vel * 0.18)); // a flick carries on to the next reading
  };
  const onWheel = (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 8) return; // sideways trackpad swipes only
    const s = phys.current;
    if (s.wheelAt && performance.now() - s.wheelAt < 350) return;
    s.wheelAt = performance.now();
    goTo(Math.round(s.target) + (e.deltaX > 0 ? 1 : -1));
  };
  const onKey = (e) => {
    const k = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
    if (k) { e.preventDefault(); goTo(Math.round(phys.current.target) + k); }
    if (e.key === "Home") { e.preventDefault(); goTo(0); }
    if (e.key === "End") { e.preventDefault(); goTo(2); }
  };

  const turn = (p - 1) * SPACING; // the ring turns with the readings
  const target = Math.round(phys.current.target);

  return (
    <div className="dial-wrap">
      <div ref={box} className="dial" role="slider" tabIndex={0} aria-label="Collection value estimate"
        aria-valuemin={0} aria-valuemax={2} aria-valuenow={settled} aria-valuetext={`${stop.label}: ${money(shownValue)}`}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel} onKeyDown={onKey}>
        <svg className="dial-ring" viewBox={`0 0 ${VB_W} ${VB_H}`} aria-hidden="true">
          <defs>
            <linearGradient id="dial-line" x1="0" x2="1">
              <stop offset="0" stopColor="#d3ff66" stopOpacity="0" />
              <stop offset="0.25" stopColor="#d3ff66" />
              <stop offset="0.5" stopColor="#f6ffe0" />
              <stop offset="0.75" stopColor="#d3ff66" />
              <stop offset="1" stopColor="#d3ff66" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="dial-glow" cx="0.5" cy="0" r="0.5">
              <stop offset="0" stopColor="#d3ff66" stopOpacity="0.38" />
              <stop offset="0.5" stopColor="#d3ff66" stopOpacity="0.1" />
              <stop offset="1" stopColor="#d3ff66" stopOpacity="0" />
            </radialGradient>
          </defs>
          {ticks(turn).map((t) => (
            <line key={t.key} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} className={`dial-tick ${t.lit ? "on" : ""}`}
              style={{ strokeWidth: t.lit ? t.width + 3 : t.width, opacity: t.lit ? 1 : t.opacity }} />
          ))}
          {DIAL_STOPS.map((s, i) => {
            const deg = 180 - (i - p) * SPACING; // 180 = the front, under the value; Floor to the left, Ceiling to the right
            const fromFront = Math.abs(wrap(deg - 180));
            // Only the reading in front and its neighbours show: one two steps away fades out as it goes over the back.
            const opacity = Math.max(0, Math.min(1, (1.6 - Math.abs(i - p)) / 0.6));
            if (opacity <= 0) return null;
            const [x, y] = pointOn(TRACK, deg);
            const depth = (1 - Math.cos(rad(deg))) / 2; // 1 in front, 0 at the back
            const scale = 0.58 + 0.42 * depth;
            const tilt = Math.sin(rad(deg)) * 15; // follows the ring: Floor rises to the right, Ceiling falls to the right
            const front = fromFront < 20;
            return (
              <g key={s.key} transform={`translate(${round(x)} ${round(y)}) rotate(${round(tilt)}) scale(${round(scale * 100) / 100})`}
                opacity={round(opacity * 100) / 100} className={`dial-word ${front ? "front" : ""}`} onClick={() => goTo(i)}>
                <text textAnchor="middle" dominantBaseline="middle" style={{ letterSpacing: `${round(0.08 + 0.34 * depth ** 3)}em` }}>{s.label.toUpperCase()}</text>
              </g>
            );
          })}
          <rect x="240" y="494" width="520" height="4" rx="2" fill="url(#dial-line)" className="dial-line" />
          <rect x="220" y="497" width="560" height="103" fill="url(#dial-glow)" />
        </svg>

        <div className="dial-center">
          <button type="button" className="dial-arrow" aria-label="Lower estimate" disabled={target === 0} tabIndex={-1} onClick={() => goTo(target - 1)}>
            <svg viewBox="0 0 24 40" aria-hidden="true"><polyline points="18,5 6,20 18,35" /></svg>
          </button>
          <div className="coll-hero-value sensitive" aria-live="polite">{money(shownValue)}</div>
          <button type="button" className="dial-arrow" aria-label="Higher estimate" disabled={target === 2} tabIndex={-1} onClick={() => goTo(target + 1)}>
            <svg viewBox="0 0 24 40" aria-hidden="true"><polyline points="6,5 18,20 6,35" /></svg>
          </button>
        </div>
      </div>
      {/* What this reading means, and which cards count the same in all three, plus hide values: their own row. */}
      <div className="dial-tools">
        <InfoTip label={`About the ${stop.label} value`}>
          {stop.note}
          {ranged < copies && (
            <>{" "}{copies - ranged} of your {copies} cards {copies - ranged === 1 ? "has" : "have"} too few recent sales for a range (or your own
              value), so {copies - ranged === 1 ? "it counts" : "they count"} the same in all three.</>
          )}
        </InfoTip>
        {extra}
      </div>
    </div>
  );
}
