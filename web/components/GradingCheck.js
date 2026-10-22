"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import CardThumb from "@/components/CardThumb";
import { GRADING_COMPANIES, gradingMath } from "@/lib/grading";

const money = (v) => `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const plus = (v) => `${v >= 0 ? "+" : "−"}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const FREE_ROWS = 3;
const GRADERS = Object.keys(GRADING_COMPANIES);
const cheapest = (g) => GRADING_COMPANIES[g].tiers[0][1];

const run = (candidates, grader, cost) => candidates.map((c) => {
  const m = gradingMath(c, cost, grader);
  return m && { ...c, ...m };
}).filter(Boolean).sort((a, b) => b.profit10 - a.profit10);

function Tile({ c, dim }) {
  const co = GRADING_COMPANIES[c.grader];
  const top = `${c.grader} ${co.top}`, next = `${c.grader} ${co.next}`;
  return (
    <Link href={`/app/cards/${encodeURIComponent(c.productId)}`} className={`gr-tile ${dim ? "dim" : ""}`}>
      <div className="gr-art"><CardThumb item={c} width={92} />{c.copies > 1 && <span className="qty-badge">×{c.copies}</span>}</div>
      <div className="gr-body">
        <b className="gr-name" title={c.name}>{c.name.replace(/\s*\(.*\)$/, "")}</b>
        <span className="small muted gr-set">{c.setName}{c.number ? ` · ${c.number.split("/")[0]}` : ""}</span>
        <div className={`gr-profit ${c.profit10 >= 0 ? "up" : "down"}`}>{plus(c.profit10)}</div>
        <span className="small muted">profit as a {top}</span>
        <div className="gr-flow" aria-label={`Raw ${money(c.raw)}, ${top} ${money(c.top)}${c.next !== null ? `, ${next} ${money(c.next)}` : ""}`}>
          <span><i>Raw</i>{money(c.raw)}</span>
          <span className="gr-arrow" aria-hidden="true">→</span>
          <span><i>{top}</i>{money(c.top)}</span>
          {c.next !== null && <span className="gr-nine"><i>{next}</i>{money(c.next)}</span>}
        </div>
        {c.verdict === "safe" && <span className="badge good" title={`Even a ${next} covers the cost`}>✓ Safe bet</span>}
        {c.verdict === "needs10" && <span className="badge warn" title={`Only pays off if it gets a ${top}`}>Needs a {co.top}</span>}
        {c.verdict === "skip" && <span className="badge">Not worth it</span>}
      </div>
    </Link>
  );
}

function AddPrompt({ children }) {
  return (
    <div className="panel gr-empty">
      <div className="gr-empty-icon" aria-hidden="true">💎</div>
      <div className="gr-empty-text">{children}</div>
      <Link href="/app/collection?add=1" className="btn primary">+ Add cards</Link>
    </div>
  );
}

/** "Worth grading?": which raw Near Mint cards you own would pay off graded, at the grader and cost you pick. */
export default function GradingCheck({ candidates, rawCards, ownedCards, full }) {
  const [grader, setGrader] = useState("PSA");
  const [cost, setCost] = useState(cheapest("PSA"));
  const [showSkip, setShowSkip] = useState(false);
  const co = GRADING_COMPANIES[grader];
  const all = useMemo(() => run(candidates, grader, cost), [candidates, grader, cost]);
  // How many cards each grader would be worth it for (other graders at their cheapest tier), shown on the picker.
  const counts = useMemo(() => Object.fromEntries(GRADERS.map((g) => [g,
    run(candidates, g, g === grader ? cost : cheapest(g)).filter((c) => c.verdict !== "skip").length])), [candidates, grader, cost]);
  const worth = all.filter((c) => c.verdict !== "skip");
  const skip = all.filter((c) => c.verdict === "skip");
  const shown = full ? worth : worth.slice(0, FREE_ROWS);
  const best = worth.reduce((s, c) => s + c.profit10 * c.copies, 0);
  const custom = !co.tiers.some(([, v]) => v === cost);
  const unchecked = rawCards - all.length;
  const elsewhere = GRADERS.filter((g) => g !== grader && counts[g] > 0);
  const pick = (g) => { setGrader(g); setCost(cheapest(g)); setShowSkip(false); };

  if (rawCards === 0) {
    return (
      <AddPrompt>
        <b>No raw cards to check yet</b>
        <span className="muted">
          {ownedCards ? "Everything in your collection is already graded or sealed. Add a raw Near Mint card and we'll tell you if grading it would pay off."
            : "Add the cards you own and we'll tell you which ones would be worth sending in for grading."}
        </span>
      </AddPrompt>
    );
  }

  return (
    <>
      <section className="panel gr-hero">
        <div className="gr-hero-main">
          {worth.length ? (
            <>
              <div className="gr-hero-num">{worth.length} {worth.length === 1 ? "card" : "cards"}</div>
              <div className="muted">worth grading with {grader} · up to <b className="up">{money(best)}</b> profit if they all get a {co.top}</div>
            </>
          ) : (
            <>
              <div className="gr-hero-num">None yet</div>
              <div className="muted">
                {all.length ? `We checked ${all.length} of your raw ${all.length === 1 ? "card" : "cards"}: none would pay off with ${grader} at ${money(cost)} a card.`
                  : `None of your raw Near Mint cards have enough recent ${grader} sales to check yet.`}
                {elsewhere.length > 0 && <> Try {elsewhere.map((g, i) => <span key={g}>{i ? " or " : ""}<button type="button" className="link-btn" onClick={() => pick(g)}>{g}</button></span>)}.</>}
              </div>
            </>
          )}
        </div>
        <div className="gr-pickers">
          <div className="gr-cost">
            <div className="small muted">Grading company</div>
            <div className="seg gr-graders" role="group" aria-label="Grading company">
              {GRADERS.map((g) => (
                <button key={g} type="button" className={grader === g ? "on" : ""} onClick={() => pick(g)} aria-pressed={grader === g}>
                  {g}{counts[g] > 0 && <span className="gr-count">{counts[g]}</span>}
                </button>
              ))}
            </div>
          </div>
          <div className="gr-cost">
            <div className="small muted">{grader} cost per card, with shipping</div>
            <div className="gr-cost-row">
              <div className="seg" role="group" aria-label="Grading cost per card">
                {co.tiers.map(([label, v]) => (
                  <button key={label} type="button" className={cost === v ? "on" : ""} onClick={() => setCost(v)}>
                    {label} <span className="muted">${v}</span>
                  </button>
                ))}
              </div>
              <label className={`gr-cost-custom ${custom ? "on" : ""}`}>
                <span className="muted">$</span>
                <input type="number" min="0" max="999" step="1" value={cost} onChange={(e) => setCost(Math.max(0, Number(e.target.value) || 0))} aria-label="Your own cost per card" />
              </label>
            </div>
          </div>
        </div>
      </section>

      {all.length > 0 && (
        <div className="gr-legend small muted" aria-hidden="true">
          <span className="gr-eq"><b>{grader} {co.top} price</b> − <b>raw price</b> − <b>{money(cost)} grading</b> = <b className="up">profit</b></span>
          <span><span className="badge good">✓ Safe bet</span> a {co.next} still pays</span>
          <span><span className="badge warn">Needs a {co.top}</span> riskier</span>
        </div>
      )}

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
            {showSkip ? "Hide" : "Show"} {skip.length} {skip.length === 1 ? "card" : "cards"} not worth grading with {grader}
          </button>
          {showSkip && <div className="gr-grid">{skip.map((c) => <Tile key={`${c.productId}:${c.printing}`} c={c} dim />)}</div>}
        </div>
      )}

      {worth.length === 0 && (
        <AddPrompt>
          <b>Got more raw cards?</b>
          <span className="muted">Add them and we&apos;ll check every one against recent graded sales.</span>
        </AddPrompt>
      )}

      <p className="hint">
        {unchecked > 0 && <>{unchecked} of your raw cards {unchecked === 1 ? "has" : "have"} too few recent {grader} sales to check. </>}
        Costs are rough, so type your own if you know it. Prices are recent graded sales. No grade is guaranteed: look at centering, corners, edges and surface first.
      </p>
    </>
  );
}
