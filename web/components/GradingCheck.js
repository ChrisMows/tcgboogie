"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import CardThumb from "@/components/CardThumb";
import { DEFAULT_SHIPPING, EBAY_FEE_NOTE, FLIP_POINTS, GRADE_TARGETS, GRADING_COMPANIES, GRADING_PRICES_MONTH, gradingMath, targetName } from "@/lib/grading";
import { gradeLabel } from "@/lib/collection";

const money = (v) => `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const plus = (v) => `${v >= 0 ? "+" : "−"}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const FREE_ROWS = 3;
const TARGETS = Object.keys(GRADE_TARGETS);

const fee = (v) => `$${Number.isInteger(v) ? v : v.toFixed(2)}`;
const run = (candidates, grader, tier, opts) => candidates.map((c) => {
  const m = gradingMath(c, grader, tier, opts);
  return m && { ...c, ...m };
}).filter(Boolean).sort((a, b) => b.profit10 - a.profit10);

/** Grade & Flip's Flip Score on a card, and what the grade below the top would do. */
function FlipScore({ c, top, next }) {
  const { score, tier, parts } = c.flip;
  const lower = c.profit9 === null ? `Needs a ${top}: no recent ${next} sales` : c.profit9 >= 0 ? `✓ ${plus(c.profit9)} even as a ${next}` : `Needs a ${top}: ${plus(c.profit9)} as a ${next}`;
  return (
    <>
      <span className={`small gr-lower ${c.profit9 !== null && c.profit9 >= 0 ? "pays" : ""}`}>{lower}</span>
      <span className={`gr-score ${tier.key}`} aria-label={`Flip Score ${score.toFixed(1)} out of 10, ${tier.label}`}
        title={`Profit ${parts.profit}/${FLIP_POINTS.profit} · Return ${parts.return}/${FLIP_POINTS.return} · If it grades lower ${parts.safety}/${FLIP_POINTS.safety} · Demand ${parts.demand}/${FLIP_POINTS.demand}`}>
        <b className="gr-score-num">{score.toFixed(1)}</b>
        <span className="gr-score-body">
          <span className="gr-score-label"><b>{tier.label}</b><span className="muted">Flip Score</span></span>
          <span className="gr-score-bar"><i style={{ width: `${score * 10}%` }} /></span>
        </span>
      </span>
    </>
  );
}

/** One card's grading numbers (also used by Grade & Flip, app/app/grade-and-flip/page.js). href: where it opens, the card page by default. */
export function GradingTile({ c, dim, href }) {
  const top = c.topName, next = c.nextName;
  return (
    <Link href={href || `/app/cards/${encodeURIComponent(c.productId)}${c.language === "japanese" ? "?lang=japanese" : ""}`} className={`gr-tile ${dim ? "dim" : ""}`}>
      <div className="gr-art"><CardThumb item={c} width={92} />{c.copies > 1 && <span className="qty-badge">×{c.copies}</span>}</div>
      <div className="gr-body">
        <b className="gr-name" title={c.name}>{c.name.replace(/\s*\(.*\)$/, "")}</b>
        <span className="small muted gr-set">{c.setName}{c.number ? ` · ${c.number.split("/")[0]}` : ""}{c.language === "japanese" ? " · Japanese" : ""}</span>
        {c.fresh && <span className="badge accent gr-fresh">{c.fresh}</span>}
        <div className={`gr-profit ${c.profit10 >= 0 ? "up" : "down"}`}>{plus(c.profit10)}</div>
        <span className="small muted">profit as a {top}</span>
        <div className="gr-flow" aria-label={`Raw ${money(c.raw)}, ${top} ${money(c.top)}${c.next !== null ? `, ${next} ${money(c.next)}` : ""}`}>
          <span><i>Raw</i>{money(c.raw)}</span>
          <span className="gr-arrow" aria-hidden="true">→</span>
          <span><i>{top}</i>{money(c.top)}</span>
          {c.next !== null && <span className="gr-nine"><i>{next}</i>{money(c.next)}</span>}
        </div>
        <span className="small muted gr-cost-note">{c.tier ? `${c.tier.name} ${fee(c.tier.fee)}` : "Your price"} + shipping + eBay fee{c.bumped ? ` · its value needs ${c.tier.name}` : ""}</span>
        {c.flip ? <FlipScore c={c} top={top} next={next} /> : <>
        {c.verdict === "safe" && <span className="badge good" title={`Even a ${next} covers the cost`}>✓ Safe bet</span>}
        {c.verdict === "needs10" && <span className="badge warn" title={`Only pays off if it gets a ${top}`}>Needs a {c.topShort}</span>}
        {c.verdict === "skip" && <span className="badge">Not worth it</span>}
        </>}
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
  const [target, setTarget] = useState("PSA"); // the grade to aim for (GRADE_TARGETS)
  const t = GRADE_TARGETS[target];
  const [tier, setTier] = useState(0); // the cheapest service level
  const [own, setOwn] = useState(null); // the member's own fee per card, instead of a service level
  const [shipping, setShipping] = useState(DEFAULT_SHIPPING);
  const [showSkip, setShowSkip] = useState(false);
  const co = GRADING_COMPANIES[t.grader];
  const name = targetName(target);
  const topShort = gradeLabel(t.grader, t.top), nextShort = gradeLabel(t.grader, t.next);
  const all = useMemo(() => run(candidates, target, tier, { own, shipping }), [candidates, target, tier, own, shipping]);
  // How many cards each grade would be worth it for (others at their cheapest level), shown on the picker.
  const counts = useMemo(() => Object.fromEntries(TARGETS.map((g) => [g,
    run(candidates, g, g === target ? tier : 0, g === target ? { own, shipping } : { shipping }).filter((c) => c.verdict !== "skip").length])), [candidates, target, tier, own, shipping]);
  const worth = all.filter((c) => c.verdict !== "skip");
  const skip = all.filter((c) => c.verdict === "skip");
  const shown = full ? worth : worth.slice(0, FREE_ROWS);
  const best = worth.reduce((s, c) => s + c.profit10 * c.copies, 0);
  const level = own !== null ? null : co.tiers[tier];
  const costLabel = own !== null ? fee(own) : fee(level.fee);
  const unchecked = rawCards - all.length;
  const elsewhere = TARGETS.filter((g) => g !== target && counts[g] > 0);
  const pick = (g) => { setTarget(g); setTier(0); setOwn(null); setShowSkip(false); };

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
              <div className="muted">worth grading with {t.grader} · up to <b className="up">{money(best)}</b> profit if they all get a {name}</div>
            </>
          ) : (
            <>
              <div className="gr-hero-num">None yet</div>
              <div className="muted">
                {all.length ? `We checked ${all.length} of your raw ${all.length === 1 ? "card" : "cards"}: none would pay off as a ${name} at ${costLabel} a card plus shipping.`
                  : `None of your raw Near Mint cards have enough recent ${name} sales to check yet.`}
                {elsewhere.length > 0 && <> Try {elsewhere.map((g, i) => <span key={g}>{i ? " or " : ""}<button type="button" className="link-btn" onClick={() => pick(g)}>{targetName(g)}</button></span>)}.</>}
              </div>
            </>
          )}
        </div>
        <div className="gr-pickers">
          <div className="gr-cost">
            <label className="gr-field">
              <span className="small muted">Grading company and grade</span>
              <select value={target} onChange={(e) => pick(e.target.value)}>
                {TARGETS.map((g) => <option key={g} value={g}>{targetName(g)}{counts[g] > 0 ? ` (${counts[g]})` : ""}</option>)}
              </select>
            </label>
          </div>
          <div className="gr-cost">
            <div className="gr-cost-row">
              <label className="gr-field">
                <span className="small muted">{t.grader} service level</span>
                <select value={own !== null ? "own" : String(tier)} onChange={(e) => {
                  if (e.target.value === "own") setOwn(level ? level.fee : 0);
                  else { setOwn(null); setTier(Number(e.target.value)); }
                }}>
                  {co.tiers.map((t, i) => (
                    <option key={t.name} value={i}>{t.name} · {fee(t.fee)}{t.days ? ` · ~${t.days} days` : ""}{t.max ? ` · cards up to $${t.max.toLocaleString("en-US")}` : ""}{t.min ? ` · ${t.min}-card minimum` : ""}</option>
                  ))}
                  <option value="own">My own price…</option>
                </select>
              </label>
              {own !== null && (
                <label className="gr-field gr-small">
                  <span className="small muted">Fee per card</span>
                  <span className="gr-money"><span className="muted">$</span><input type="number" min="0" max="9999" step="1" value={own} onChange={(e) => setOwn(Math.max(0, Number(e.target.value) || 0))} /></span>
                </label>
              )}
              <label className="gr-field gr-small">
                <span className="small muted">Shipping per card</span>
                <span className="gr-money"><span className="muted">$</span><input type="number" min="0" max="999" step="1" value={shipping} onChange={(e) => setShipping(Math.max(0, Number(e.target.value) || 0))} /></span>
              </label>
            </div>
          </div>
        </div>
      </section>

      {all.length > 0 && (
        <div className="gr-legend small muted" aria-hidden="true">
          <span className="gr-eq"><b>{name} price</b> − <b>eBay fee</b> − <b>raw price</b> − <b>{costLabel} grading + shipping</b> = <b className="up">profit</b></span>
          <span><span className="badge good">✓ Safe bet</span> a {nextShort} still pays</span>
          <span><span className="badge warn">Needs a {topShort}</span> riskier</span>
        </div>
      )}

      {shown.length > 0 && (
        <div className="gr-grid">
          {shown.map((c) => <GradingTile key={`${c.productId}:${c.printing}`} c={c} />)}
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
            {showSkip ? "Hide" : "Show"} {skip.length} {skip.length === 1 ? "card" : "cards"} not worth grading as a {name}
          </button>
          {showSkip && <div className="gr-grid">{skip.map((c) => <GradingTile key={`${c.productId}:${c.printing}`} c={c} dim />)}</div>}
        </div>
      )}

      {worth.length === 0 && (
        <AddPrompt>
          <b>Got more raw cards?</b>
          <span className="muted">Add them and we&apos;ll check every one against recent graded sales.</span>
        </AddPrompt>
      )}

      <p className="hint">
        {unchecked > 0 && <>{unchecked} of your raw cards {unchecked === 1 ? "has" : "have"} too few recent {name} sales to check. </>}
        {EBAY_FEE_NOTE} Grading prices are the graders&apos; published prices as of {GRADING_PRICES_MONTH}; they change often, so pick “My own price” if yours differ. A card worth more than a level allows is priced at the level it needs. Sale prices are recent graded sales. No grade is guaranteed: look at centering, corners, edges and surface first.
      </p>
    </>
  );
}
