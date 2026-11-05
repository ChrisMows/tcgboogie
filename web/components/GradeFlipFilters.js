"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { deleteFlipFilter, saveFlipFilter } from "@/app/app/grade-and-flip/actions";
import { gradeLabel } from "@/lib/collection";
import { GRADE_TARGETS, GRADING_COMPANIES, MIN_PROFIT, targetName } from "@/lib/grading";

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
 * Grade & Flip's filters, a plain GET form: three quick choices (like the lightning on a card page), with the rest folded
 * under More options. Those stay in the form while folded, so a search always sends them. eras: { key: label }
 * (lib/grading-gap.js is server only). filter: the saved filter this tab shows, if any. creating: the + New filter tab.
 */
export default function GradeFlipFilters({ opts, eras, filter = null, creating = false }) {
  const router = useRouter();
  const formRef = useRef(null);
  const [target, setTarget] = useState(opts.target);
  const [tier, setTier] = useState(opts.tier);
  const [max, setMax] = useState(opts.maxRaw === null ? "" : String(opts.maxRaw));
  const [profit, setProfit] = useState(String(opts.minProfit));
  const [more, setMore] = useState(false);
  const [name, setName] = useState(filter?.name || "");
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const t = GRADE_TARGETS[target];
  const co = GRADING_COMPANIES[t.grader];
  const pick = (id) => {
    // Service levels are each grader's own: keep the level only when the grader stays the same (BGS 9.5 to BGS 10).
    if (GRADE_TARGETS[id].grader !== t.grader) setTier(0);
    setTarget(id);
  };
  const save = () => start(async () => {
    setError(null);
    const r = await saveFlipFilter({ id: filter?.id || null, name, params: Object.fromEntries(new FormData(formRef.current)) });
    if (!r.ok) { if (filter && !name.trim()) setMore(true); return setError(r.error); }
    if (filter) setSaved(true);
    router.push(`?f=${r.id}`, { scroll: false });
  });
  const remove = () => start(async () => {
    await deleteFlipFilter(filter.id);
    router.push("/app/grade-and-flip", { scroll: false });
  });
  const nameField = (
    <label className="gr-field gf-name">
      <span className="small muted">Filter name</span>
      <input type="text" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. PSA under $100" />
    </label>
  );
  return (
    <form method="get" ref={formRef} onChange={() => setSaved(false)}>
      {filter && <input type="hidden" name="f" value={filter.id} />}
      {creating && <input type="hidden" name="new" value="1" />}
      {creating && nameField}
      <div className="deal-qs gf-quick">
        <Quick label="Grading company" options={COMPANIES} value={t.grader} set={(g) => { if (g !== t.grader) pick(firstTarget(g)); }} />
        <Quick label="Raw card costs up to" options={BUDGETS} value={max} set={setMax} fmt={(o) => (o ? `$${o}` : "Any")} />
        <Quick label="Profit at least" options={PROFITS} value={profit} set={setProfit} fmt={(o) => `$${o}`} />
      </div>
      <div className="gf-filters gf-details" hidden={!more}>
        {filter && nameField}
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
      {error && <div className="err" style={{ marginTop: 10 }}>{error}</div>}
      <div className="alert-foot">
        <button type="submit" className="btn primary">Find cards</button>
        {creating && <button type="button" className="btn" disabled={pending} onClick={save}>{pending ? "Saving..." : "Save filter"}</button>}
        {filter && <button type="button" className="btn" disabled={pending} onClick={save}>{pending ? "Saving..." : saved ? "Saved" : "Save changes"}</button>}
        <button type="button" className="link-btn small" aria-expanded={more} onClick={() => setMore(!more)}>{more ? "Fewer options" : "More options"}</button>
        {filter && (confirming ? (
          <span className="small gf-delete">
            Delete this filter?{" "}
            <button type="button" className="link-btn small" disabled={pending} onClick={remove}>Yes</button>{" · "}
            <button type="button" className="link-btn small" onClick={() => setConfirming(false)}>No</button>
          </span>
        ) : <button type="button" className="link-btn small gf-delete" onClick={() => setConfirming(true)}>Delete filter</button>)}
      </div>
    </form>
  );
}
