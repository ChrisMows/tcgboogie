"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import CardThumb from "@/components/CardThumb";
import { DEFAULT_GRADING_COST, gradingMath } from "@/lib/grading";

const money = (v) => `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const plus = (v) => `${v >= 0 ? "+" : "−"}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const FREE_ROWS = 3;
// Rough PSA cost per card including shipping both ways.
const TIERS = [
  { label: "Value", cost: DEFAULT_GRADING_COST },
  { label: "Regular", cost: 85 },
  { label: "Express", cost: 160 },
];
const VERDICT = {
  safe: { cls: "good", text: "Safe bet", tip: "Even a PSA 9 covers the cost" },
  needs10: { cls: "warn", text: "Needs a 10", tip: "Only pays off if it gets a PSA 10" },
  skip: { cls: "", text: "Not worth it", tip: "Too little profit, even as a 10" },
};

function Tile({ c, dim }) {
  const v = VERDICT[c.verdict];
  return (
    <Link href={`/app/cards/${encodeURIComponent(c.productId)}`} className={`gr-tile ${dim ? "dim" : ""}`}>
      <div className="gr-art"><CardThumb item={c} width={92} />{c.copies > 1 && <span className="qty-badge">×{c.copies}</span>}</div>
      <div className="gr-body">
        <b className="gr-name" title={c.name}>{c.name.replace(/\s*\(.*\)$/, "")}</b>
        <span className="small muted gr-set">{c.setName}{c.number ? ` · ${c.number.split("/")[0]}` : ""}</span>
        <div className={`gr-profit ${c.profit10 >= 0 ? "up" : "down"}`}>{plus(c.profit10)}</div>
        <span className="small muted">profit as a PSA 10</span>
        <div className="gr-flow" aria-label={`Raw ${money(c.raw)}, PSA 10 ${money(c.psa10)}${c.psa9 !== null ? `, PSA 9 ${money(c.psa9)}` : ""}`}>
          <span><i>Raw</i>{money(c.raw)}</span>
          <span className="gr-arrow" aria-hidden="true">→</span>
          <span><i>PSA 10</i>{money(c.psa10)}</span>
          {c.psa9 !== null && <span className="gr-nine"><i>PSA 9</i>{money(c.psa9)}</span>}
        </div>
        <span className={`badge ${v.cls}`} title={v.tip}>{c.verdict === "safe" ? "✓ " : ""}{v.text}</span>
      </div>
    </Link>
  );
}

/** "Worth grading?": which raw Near Mint cards you own would pay off as PSA slabs, at a grading cost you pick. */
export default function GradingCheck({ candidates, unchecked = 0, full }) {
  const [cost, setCost] = useState(DEFAULT_GRADING_COST);
  const [showSkip, setShowSkip] = useState(false);
  const all = useMemo(() => candidates.map((c) => ({ ...c, ...gradingMath(c, cost) })).sort((a, b) => b.profit10 - a.profit10), [candidates, cost]);
  const worth = all.filter((c) => c.verdict !== "skip");
  const skip = all.filter((c) => c.verdict === "skip");
  const shown = full ? worth : worth.slice(0, FREE_ROWS);
  const best = worth.reduce((s, c) => s + c.profit10 * c.copies, 0);
  const custom = !TIERS.some((t) => t.cost === cost);

  return (
    <>
      <section className="panel gr-hero">
        <div className="gr-hero-main">
          {worth.length ? (
            <>
              <div className="gr-hero-num">{worth.length} {worth.length === 1 ? "card" : "cards"}</div>
              <div className="muted">worth grading · up to <b className="up">{money(best)}</b> profit if they all get a 10</div>
            </>
          ) : (
            <>
              <div className="gr-hero-num">None yet</div>
              <div className="muted">{all.length ? `We checked ${all.length} of your cards: none would pay off at ${money(cost)} a card.` : "None of your raw Near Mint cards have enough PSA sales to check yet."}</div>
            </>
          )}
        </div>
        <div className="gr-cost">
          <div className="small muted">PSA cost per card</div>
          <div className="gr-cost-row">
            <div className="seg" role="group" aria-label="Grading cost per card">
              {TIERS.map((t) => (
                <button key={t.label} type="button" className={cost === t.cost ? "on" : ""} onClick={() => setCost(t.cost)}>
                  {t.label} <span className="muted">${t.cost}</span>
                </button>
              ))}
            </div>
            <label className={`gr-cost-custom ${custom ? "on" : ""}`}>
              <span className="muted">$</span>
              <input type="number" min="0" max="999" step="1" value={cost} onChange={(e) => setCost(Math.max(0, Number(e.target.value) || 0))} aria-label="Your own cost per card" />
            </label>
          </div>
        </div>
      </section>

      <div className="gr-legend small muted" aria-hidden="true">
        <span className="gr-eq"><b>PSA 10 price</b> − <b>raw price</b> − <b>{money(cost)} grading</b> = <b className="up">profit</b></span>
        <span><span className="badge good">✓ Safe bet</span> a 9 still pays</span>
        <span><span className="badge warn">Needs a 10</span> riskier</span>
      </div>

      {shown.length > 0 && (
        <div className="gr-grid">
          {shown.map((c) => <Tile key={`${c.productId}:${c.printing}`} c={c} />)}
        </div>
      )}
      {!full && worth.length > FREE_ROWS && (
        <div className="panel gr-more">
          <b>🔒 {worth.length - FREE_ROWS} more {worth.length - FREE_ROWS === 1 ? "card" : "cards"} worth grading</b>
          <span className="muted small">See every card with Premium.</span>
          <Link href="/app/premium?from=grading" className="btn sm primary">See Premium</Link>
        </div>
      )}

      {skip.length > 0 && (
        <div className="gr-skip">
          <button type="button" className="link-btn small" onClick={() => setShowSkip(!showSkip)} aria-expanded={showSkip}>
            {showSkip ? "Hide" : "Show"} {skip.length} {skip.length === 1 ? "card" : "cards"} not worth grading
          </button>
          {showSkip && <div className="gr-grid">{skip.map((c) => <Tile key={`${c.productId}:${c.printing}`} c={c} dim />)}</div>}
        </div>
      )}

      <p className="hint">
        {unchecked > 0 && <>{unchecked} of your raw cards {unchecked === 1 ? "has" : "have"} too few PSA sales to check. </>}
        Prices are recent PSA sales. A 10 is never guaranteed: look at centering, corners, edges and surface first.
      </p>
    </>
  );
}
