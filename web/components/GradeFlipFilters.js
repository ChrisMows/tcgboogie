"use client";

import { useState } from "react";
import { gradeLabel } from "@/lib/collection";
import { DEFAULT_SHIPPING, GRADE_TARGETS, GRADING_COMPANIES, MIN_PROFIT, targetName } from "@/lib/grading";

const fee = (v) => `$${Number.isInteger(v) ? v : v.toFixed(2)}`;

const TARGET_IDS = Object.keys(GRADE_TARGETS);
const COMPANIES = [...new Set(TARGET_IDS.map((id) => GRADE_TARGETS[id].grader))];
const firstTarget = (grader) => TARGET_IDS.find((id) => GRADE_TARGETS[id].grader === grader); // its everyday top grade
const BUDGETS = ["", "50", "100", "250"]; // "" = any price
const PROFITS = ["25", "50", "100"];

function Quick({ label, options, value, set, fmt = (o) => o }) {
  return (
    <div className="deal-q">
      <span className="small muted">{label}</span>
      <div className="seg">
        {options.map((o) => <button key={o} type="button" className={value === o ? "on" : ""} aria-pressed={value === o} onClick={() => set(o)}>{fmt(o)}</button>)}
      </div>
    </div>
  );
}

/**
 * Grade & Flip's filters, a plain GET form: three quick choices (like the lightning on a card page), with the rest
 * under More options. Those stay in the form while folded, so a search always sends them. More options starts open when
 * the search uses something the quick choices can't show. eras: { key: label } (lib/grading-gap.js is server only).
 */
export default function GradeFlipFilters({ opts, eras }) {
  const [target, setTarget] = useState(opts.target);
  const [tier, setTier] = useState(opts.tier);
  const [max, setMax] = useState(opts.maxRaw === null ? "" : String(opts.maxRaw));
  const [profit, setProfit] = useState(String(opts.minProfit));
  const [more, setMore] = useState(
    target !== firstTarget(GRADE_TARGETS[target].grader) || tier !== 0 || Boolean(opts.minRaw)
    || !BUDGETS.includes(max) || !PROFITS.includes(profit) || opts.shipping !== DEFAULT_SHIPPING
    || opts.language !== "english" || opts.era !== "modern" || opts.sort !== "score" || !opts.safeOnly,
  );
  const t = GRADE_TARGETS[target];
  const co = GRADING_COMPANIES[t.grader];
  const pick = (id) => {
    // Service levels are each grader's own: keep the level only when the grader stays the same (BGS 9.5 to BGS 10).
    if (GRADE_TARGETS[id].grader !== t.grader) setTier(0);
    setTarget(id);
  };
  return (
    <form method="get">
      <div className="deal-qs gf-quick">
        <Quick label="Grading company" options={COMPANIES} value={t.grader} set={(g) => { if (g !== t.grader) pick(firstTarget(g)); }} />
        <Quick label="Raw card costs up to" options={BUDGETS} value={max} set={setMax} fmt={(o) => (o ? `$${o}` : "Any")} />
        <Quick label="Profit at least" options={PROFITS} value={profit} set={setProfit} fmt={(o) => `$${o}`} />
      </div>
      <div className="gf-filters gf-details" hidden={!more}>
        <label className="gr-field">
          <span className="small muted">Grade</span>
          <select name="grader" value={target} onChange={(e) => pick(e.target.value)}>
            {TARGET_IDS.filter((id) => GRADE_TARGETS[id].grader === t.grader).map((g) => <option key={g} value={g}>{targetName(g)}</option>)}
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
          <span className="gr-money"><span className="muted">$</span><input type="number" name="max" min="0" step="1" value={max} onChange={(e) => setMax(e.target.value)} placeholder="Any" /></span>
        </label>
        <label className="gr-field gr-small">
          <span className="small muted">Profit at least</span>
          <span className="gr-money"><span className="muted">$</span><input type="number" name="profit" min="0" step="5" value={profit} onChange={(e) => setProfit(e.target.value)} placeholder={String(MIN_PROFIT)} /></span>
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
      </div>
      <div className="alert-foot">
        <button type="submit" className="btn primary">Find cards</button>
        <button type="button" className="link-btn small" aria-expanded={more} onClick={() => setMore(!more)}>{more ? "Fewer options" : "More options"}</button>
      </div>
    </form>
  );
}
