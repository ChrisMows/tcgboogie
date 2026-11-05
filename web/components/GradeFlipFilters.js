"use client";

import { useState } from "react";
import { gradeLabel } from "@/lib/collection";
import { GRADE_TARGETS, GRADING_COMPANIES, targetName } from "@/lib/grading";

const fee = (v) => `$${Number.isInteger(v) ? v : v.toFixed(2)}`;

/**
 * Grade & Flip's filters, a plain GET form. Picking a grader and grade updates what depends on it right away: that
 * grader's service levels and prices, and the grades named under Risk. eras: { key: label } (lib/grading-gap.js is server only).
 */
export default function GradeFlipFilters({ opts, eras }) {
  const [target, setTarget] = useState(opts.target);
  const [tier, setTier] = useState(opts.tier);
  const t = GRADE_TARGETS[target];
  const co = GRADING_COMPANIES[t.grader];
  const pick = (id) => {
    // Service levels are each grader's own: keep the level only when the grader stays the same (BGS 9.5 to BGS 10).
    if (GRADE_TARGETS[id].grader !== t.grader) setTier(0);
    setTarget(id);
  };
  return (
    <form className="gf-filters" method="get">
      <label className="gr-field">
        <span className="small muted">Grading company and grade</span>
        <select name="grader" value={target} onChange={(e) => pick(e.target.value)}>
          {Object.keys(GRADE_TARGETS).map((g) => <option key={g} value={g}>{targetName(g)}</option>)}
        </select>
      </label>
      <label className="gr-field">
        <span className="small muted">{t.grader} service level</span>
        <select name="tier" value={String(tier)} onChange={(e) => setTier(Number(e.target.value))}>
          {co.tiers.map((x, i) => <option key={x.name} value={i}>{x.name} · {fee(x.fee)}{x.days ? ` · ~${x.days} days` : ""}</option>)}
        </select>
      </label>
      <label className="gr-field gr-small">
        <span className="small muted">Raw price from</span>
        <span className="gr-money"><span className="muted">$</span><input type="number" name="min" min="0" step="1" defaultValue={opts.minRaw || ""} placeholder="0" /></span>
      </label>
      <label className="gr-field gr-small">
        <span className="small muted">up to</span>
        <span className="gr-money"><span className="muted">$</span><input type="number" name="max" min="0" step="1" defaultValue={opts.maxRaw ?? ""} placeholder="Any" /></span>
      </label>
      <label className="gr-field gr-small">
        <span className="small muted">Profit at least</span>
        <span className="gr-money"><span className="muted">$</span><input type="number" name="profit" min="0" step="5" defaultValue={opts.minProfit} /></span>
      </label>
      <label className="gr-field gr-small">
        <span className="small muted">Shipping per card</span>
        <span className="gr-money"><span className="muted">$</span><input type="number" name="ship" min="0" step="1" defaultValue={opts.shipping} /></span>
      </label>
      <label className="gr-field">
        <span className="small muted">Cards</span>
        <select name="lang" defaultValue={opts.language}>
          <option value="english">English</option><option value="japanese">Japanese</option><option value="all">English and Japanese</option>
        </select>
      </label>
      <label className="gr-field">
        <span className="small muted">Era</span>
        <select name="era" defaultValue={opts.era}>
          {Object.entries(eras).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </label>
      <label className="gr-field">
        <span className="small muted">Sort by</span>
        <select name="sort" defaultValue={opts.sort}>
          <option value="score">Best Flip Score</option><option value="profit">Most profit</option><option value="return">Best return on what you spend</option>
        </select>
      </label>
      <label className="gr-field">
        <span className="small muted">Risk</span>
        <select name="safe" defaultValue={opts.safeOnly ? "1" : "0"}>
          <option value="1">Only cards where a {gradeLabel(t.grader, t.next)} still pays</option><option value="0">Include cards that need a {gradeLabel(t.grader, t.top)}</option>
        </select>
      </label>
      <button type="submit" className="btn primary">Find cards</button>
    </form>
  );
}
