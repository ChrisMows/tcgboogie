"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DealGrid } from "@/components/DealTile";
import { createProfile, deleteProfile, saveProfile, setProfileActive } from "@/app/app/actions";
import { FACETS, activeFacets } from "@/lib/facets";
import { GRADE_STEPS, GRADERS, RAW_CONDITION_LABELS, RAW_CONDITIONS, clampToPlan, defaultFilters, matches } from "@/lib/filters";
import { POKEMON, SETS } from "@/lib/suggestions";

const Err = ({ msg }) => (msg ? <div className="err">{msg}</div> : null);
const Lock = ({ children }) => <div className="locked-note">🔒 {children} <Link href="/app/billing">Upgrade</Link></div>;

function TagInput({ id, label, values, onChange, suggestions, placeholder }) {
  const [text, setText] = useState("");
  const add = (raw) => {
    const v = raw.trim();
    if (v && !values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
    setText("");
  };
  return (
    <div className="fs-field">
      <label className="field" htmlFor={id}>{label}</label>
      {values.length > 0 && (
        <div className="tags">
          {values.map((v) => (
            <span className="tag" key={v}>{v}<button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>×</button></span>
          ))}
        </div>
      )}
      <input id={id} type="text" list={`${id}-list`} value={text} placeholder={placeholder}
        onChange={(e) => (suggestions.includes(e.target.value) ? add(e.target.value) : setText(e.target.value))}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(text); } }}
        onBlur={() => text && add(text)} />
      <datalist id={`${id}-list`}>{suggestions.filter((s) => !values.includes(s)).map((s) => <option key={s} value={s} />)}</datalist>
    </div>
  );
}

function Check({ checked, onChange, disabled, children }) {
  return (
    <label className={`fs-check ${disabled ? "dim" : ""}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} /> {children}
    </label>
  );
}

/** The controls for one facet (used in the pill dropdowns and in the All filters panel). */
function FacetControl({ k, f, set, toggle, plan, errors }) {
  const premium = plan.key === "premium";
  switch (k) {
    case "pokemon":
      return (<>
        <TagInput id="pk" label="Only these" values={f.pokemon} onChange={(v) => set("pokemon", v)} suggestions={POKEMON} placeholder="e.g. Charizard (Enter to add)" />
        <TagInput id="xpk" label="Never these" values={f.excludePokemon} onChange={(v) => set("excludePokemon", v)} suggestions={POKEMON} placeholder="e.g. Pikachu" />
      </>);
    case "sets":
      return (<>
        <TagInput id="st" label="Only these sets" values={f.sets} onChange={(v) => set("sets", v)} suggestions={SETS} placeholder="e.g. Evolving Skies" />
        <TagInput id="xst" label="Skip these sets" values={f.excludeSets} onChange={(v) => set("excludeSets", v)} suggestions={SETS} placeholder="e.g. Celebrations" />
      </>);
    case "type":
      return (<>
        <Check checked={f.cardTypes.includes("graded")} onChange={() => toggle("cardTypes", "graded")}>Graded slabs</Check>
        <Check checked={f.cardTypes.includes("raw")} onChange={() => toggle("cardTypes", "raw")}>Raw cards</Check>
        <Err msg={errors.cardTypes} />
      </>);
    case "grade":
      return (<>
        {GRADERS.map((g) => <Check key={g} checked={f.graders.includes(g)} onChange={() => toggle("graders", g)}>{g}</Check>)}
        <Err msg={errors.graders} />
        <div className="fs-row">
          <label>From <select value={f.minGrade} onChange={(e) => set("minGrade", Number(e.target.value))}>{GRADE_STEPS.map((g) => <option key={g} value={g}>{g}</option>)}</select></label>
          <label>to <select value={f.maxGrade} onChange={(e) => set("maxGrade", Number(e.target.value))}>{GRADE_STEPS.map((g) => <option key={g} value={g}>{g}</option>)}</select></label>
        </div>
        <Err msg={errors.minGrade} />
      </>);
    case "condition":
      return RAW_CONDITIONS.map((c) => (
        <label key={c} className="fs-check">
          <input type="radio" name="cond" checked={f.minRawCondition === c} onChange={() => set("minRawCondition", c)} /> {RAW_CONDITION_LABELS[c]}
        </label>
      ));
    case "value":
      return (<>
        <div className="fs-row">
          <label>Card worth $<input type="number" min={plan.minValueFloor} value={f.minMarketValue} onChange={(e) => set("minMarketValue", e.target.value === "" ? "" : Number(e.target.value))} /></label>
          <label>to $<input type="number" min={0} placeholder="Any" value={f.maxMarketValue ?? ""} onChange={(e) => set("maxMarketValue", e.target.value === "" ? null : Number(e.target.value))} /></label>
        </div>
        <Err msg={errors.minMarketValue || errors.maxMarketValue} />
        <label className="fs-field">Most I&apos;ll pay, with shipping ($)
          <input type="number" min={0} placeholder="No limit" value={f.maxPrice ?? ""} onChange={(e) => set("maxPrice", e.target.value === "" ? null : Number(e.target.value))} />
        </label>
        <Err msg={errors.maxPrice} />
        {!premium && <Lock>Free covers cards worth ${plan.minValueFloor}+.</Lock>}
      </>);
    case "discount":
      return (<>
        <div className="range-row">
          <input type="range" min={plan.minDiscountFloor} max={80} value={f.minDiscountPct} onChange={(e) => set("minDiscountPct", Number(e.target.value))} aria-label="Minimum discount" />
          <output>{f.minDiscountPct}%</output>
        </div>
        <div className="hint">Price + shipping at least this far below what it sells for.</div>
        <Err msg={errors.minDiscountPct} />
        {!premium && <Lock>Premium goes down to 15%.</Lock>}
      </>);
    case "time":
      return (<>
        <div className="range-row">
          <input type="range" min={1} max={plan.maxWindowMinutes} value={f.maxMinutesLeft} onChange={(e) => set("maxMinutesLeft", Number(e.target.value))} aria-label="Ends within minutes" />
          <output>{f.maxMinutesLeft} min</output>
        </div>
        <Err msg={errors.maxMinutesLeft} />
        {!premium && <Lock>Premium alerts up to 60 minutes before the end.</Lock>}
      </>);
    case "language":
      return (<>
        <Check checked={f.languages.includes("english")} onChange={() => toggle("languages", "english")}>English</Check>
        <Check checked={f.languages.includes("japanese")} disabled={!premium} onChange={() => toggle("languages", "japanese")}>Japanese</Check>
        <Err msg={errors.languages} />
        {!premium && <Lock>Japanese cards are Premium.</Lock>}
      </>);
    case "seller":
      return (<>
        <Check checked={f.usOnly} onChange={(e) => set("usOnly", e.target.checked)}>US sellers only</Check>
        <Check checked={f.hideFlagged} onChange={(e) => set("hideFlagged", e.target.checked)}>Hide listings with red flags</Check>
        <div className="fs-row">
          <label>Seller feedback ≥ <input type="number" min={0} value={f.minSellerFeedback} onChange={(e) => set("minSellerFeedback", Number(e.target.value || 0))} /></label>
          <label>Sales behind value ≥ <input type="number" min={3} value={f.minComps} onChange={(e) => set("minComps", Number(e.target.value || 3))} /></label>
        </div>
        <Err msg={errors.minSellerFeedback || errors.minComps} />
      </>);
    default:
      return null;
  }
}

export default function FilterStudio({ profiles: initial, plan, deals, isDemo, prefill }) {
  const router = useRouter();
  const defaults = useMemo(() => defaultFilters(plan), [plan]);
  const [profiles, setProfiles] = useState(initial);
  const [selectedId, setSelectedId] = useState(initial[0]?.id);
  const selected = profiles.find((p) => p.id === selectedId) || profiles[0];
  const [draft, setDraft] = useState(() => {
    const f = clampToPlan(selected.filters, plan);
    if (!prefill) return f;
    const add = (list, v) => (v && !list.includes(v) ? [...list, v] : list);
    return { ...f, pokemon: add(f.pokemon, prefill.pokemon), sets: add(f.sets, prefill.set) };
  });
  const [name, setName] = useState(selected.name);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(prefill ? { kind: "warn", text: `Added ${[prefill.pokemon, prefill.set].filter(Boolean).join(" from ")}. Check it, then Update this filter.` } : null);
  const [open, setOpen] = useState(null); // facet key whose dropdown is open
  const [drawer, setDrawer] = useState(false);
  const [pending, start] = useTransition();
  const barRef = useRef(null);

  useEffect(() => setProfiles(initial), [initial]);
  useEffect(() => {
    if (!drawer) return;
    const esc = (e) => e.key === "Escape" && setDrawer(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [drawer]);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (barRef.current && !barRef.current.contains(e.target)) setOpen(null); };
    const esc = (e) => e.key === "Escape" && setOpen(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const saved = clampToPlan(selected.filters, plan);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved) || name !== selected.name;
  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const toggle = (key, value) => setDraft((d) => ({ ...d, [key]: d[key].includes(value) ? d[key].filter((x) => x !== value) : [...d[key], value] }));
  const reset = (facet) => setDraft((d) => ({ ...d, ...facet.reset(defaults) }));
  const applied = activeFacets(draft, defaults);
  const results = deals.filter((d) => matches(draft, d));
  const premium = plan.key === "premium";
  const atLimit = profiles.length >= plan.maxProfiles;
  const running = (p, i) => p.active && i < plan.maxProfiles;
  const countFor = (p) => deals.filter((d) => matches(clampToPlan(p.id === selected.id ? draft : p.filters, plan), d)).length;

  function pick(id) {
    if (id === selected.id) return;
    if (dirty && !window.confirm("You have changes you haven't saved. Discard them?")) return;
    const p = profiles.find((x) => x.id === id);
    setSelectedId(id); setDraft(clampToPlan(p.filters, plan)); setName(p.name); setErrors({}); setMessage(null); setOpen(null);
  }
  function update() {
    start(async () => {
      const res = await saveProfile(selected.id, { ...draft, name });
      if (!res.ok) { setErrors(res.errors || {}); setMessage({ kind: "bad", text: "A setting needs a fix. Look for the note in red." }); return; }
      setErrors({}); setMessage({ kind: "good", text: `“${name}” updated. It applies from the next check, within a minute.` });
      setProfiles((ps) => ps.map((p) => (p.id === selected.id ? { ...p, name, filters: draft } : p)));
      router.refresh();
    });
  }
  function addFilter() {
    if (dirty && !window.confirm("You have changes you haven't saved. Discard them?")) return;
    start(async () => {
      const res = await createProfile();
      if (!res.ok) return setMessage({ kind: "warn", text: res.error });
      const fresh = { id: res.id, name: `Filter ${profiles.length + 1}`, active: true, filters: clampToPlan({}, plan) };
      setProfiles((ps) => [...ps, fresh]); setSelectedId(fresh.id); setName(fresh.name); setDraft(fresh.filters);
      setMessage({ kind: "good", text: "New filter added. Set it up, then Update this filter." });
      router.refresh();
    });
  }
  function remove() {
    if (!window.confirm(`Delete “${selected.name}”? This can't be undone.`)) return;
    start(async () => {
      const res = await deleteProfile(selected.id);
      if (!res.ok) return setMessage({ kind: "warn", text: res.error });
      const rest = profiles.filter((p) => p.id !== selected.id);
      setProfiles(rest); setSelectedId(rest[0].id); setDraft(clampToPlan(rest[0].filters, plan)); setName(rest[0].name);
      setMessage({ kind: "good", text: "Filter deleted." });
      router.refresh();
    });
  }
  function pause() {
    const next = !selected.active;
    start(async () => {
      await setProfileActive(selected.id, next);
      setProfiles((ps) => ps.map((p) => (p.id === selected.id ? { ...p, active: next } : p)));
      setMessage({ kind: "good", text: next ? "Filter is running again." : "Filter paused. It won't send deals until you resume it." });
      router.refresh();
    });
  }

  const index = profiles.findIndex((p) => p.id === selected.id);
  const status = index >= plan.maxProfiles ? "locked" : selected.active ? "on" : "paused";

  return (
    <div className="fs">
      {/* 1. Which filter */}
      <div className="fs-tabs" role="tablist" aria-label="Your filters">
        {profiles.map((p, i) => {
          const st = i >= plan.maxProfiles ? "locked" : p.active ? "on" : "paused";
          return (
            <button key={p.id} role="tab" aria-selected={p.id === selected.id} className={`fs-tab ${p.id === selected.id ? "on" : ""}`} onClick={() => pick(p.id)}>
              <span className={`fs-dot ${st}`} aria-hidden="true" />
              <span className="fs-tab-name">{p.id === selected.id ? name || "Untitled" : p.name}</span>
              <span className="fs-count">{countFor(p)}</span>
              <span className="sr-only">{st === "on" ? "running" : st === "paused" ? "paused" : "not running on your plan"}</span>
            </button>
          );
        })}
        <button className="fs-tab add" onClick={addFilter} disabled={pending || atLimit} title={atLimit ? `${plan.label} includes ${plan.maxProfiles} filter${plan.maxProfiles > 1 ? "s" : ""}` : "Add a filter"}>
          + New filter{atLimit && !premium ? " 🔒" : ""}
        </button>
      </div>
      <div className="fs-legend small muted">
        <span><span className="fs-dot on" /> Running</span><span><span className="fs-dot paused" /> Paused</span>
        {profiles.length > plan.maxProfiles && <span><span className="fs-dot locked" /> Not running on {plan.label} · <Link href="/app/billing">Upgrade</Link></span>}
      </div>

      {/* 2. The pill bar */}
      <div className="fs-bar" ref={barRef}>
        <div className={`fs-pill-wrap all ${applied.length ? "has" : ""}`}>
          <button type="button" className="fs-pill" onClick={() => { setDrawer(true); setOpen(null); }}>
            ☰ All filters {applied.length > 0 && <span className="fs-badge">{applied.length}</span>}
          </button>
        </div>
        {FACETS.map((x) => {
          const off = x.disabled?.(draft);
          const on = !off && x.active(draft, defaults);
          return (
            <div key={x.key} className={`fs-pill-wrap ${on ? "on" : ""} ${open === x.key ? "open" : ""} ${off ? "off" : ""}`}>
              <button type="button" className="fs-pill" disabled={off}
                aria-expanded={open === x.key} onClick={() => setOpen(open === x.key ? null : x.key)}
                title={off ? `Not used with ${draft.cardTypes[0]} cards only` : ""}>
                {on ? <><span className="fs-pill-k">{x.label}:</span> {x.summary(draft)}</> : x.label}
                {!on && <span className="fs-caret" aria-hidden="true">▾</span>}
              </button>
              {on && <button type="button" className="fs-x" aria-label={`Clear ${x.label}`} onClick={() => reset(x)}>✕</button>}
              {open === x.key && (
                <div className="fs-pop" role="dialog" aria-label={x.label}>
                  <FacetControl k={x.key} f={draft} set={set} toggle={toggle} plan={plan} errors={errors} />
                  <div className="fs-pop-foot">
                    <button type="button" className="link-btn small" onClick={() => reset(x)}>Reset</button>
                    <button type="button" className="btn sm primary" onClick={() => setOpen(null)}>Done</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <button type="button" className="link-btn fs-clear" disabled={!applied.length} onClick={() => setDraft({ ...defaults })}>Clear filter</button>
      </div>

      {/* 3. Update / status bar */}
      <div className={`fs-save ${dirty ? "dirty" : ""}`}>
        <span className={`fs-dot ${status}`} aria-hidden="true" />
        <input className="fs-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="Filter name" />
        <span className="small muted fs-state">
          {dirty ? "Unsaved changes" : status === "on" ? "Running" : status === "paused" ? "Paused" : `Not running on ${plan.label}`}
        </span>
        <span className="fs-spacer" />
        <button type="button" className="btn sm ghost" onClick={pause} disabled={pending}>{selected.active ? "⏸ Pause" : "▶ Resume"}</button>
        <button type="button" className="btn sm ghost danger" onClick={remove} disabled={pending || profiles.length <= 1}>Delete</button>
        {dirty && <button type="button" className="btn sm" onClick={() => { setDraft(saved); setName(selected.name); setErrors({}); }}>Discard</button>}
        <button type="button" className="btn sm primary" onClick={update} disabled={!dirty || pending}>{pending ? "Saving…" : "Update this filter"}</button>
      </div>
      <Err msg={errors.name} />
      {message && <div className={`notice ${message.kind}`} style={{ marginTop: 12 }}>{message.text}</div>}

      {/* 4. Results */}
      <div className="fs-results-head">
        <b>{results.length} {results.length === 1 ? "deal matches" : "deals match"}</b>
        <span className="small muted">
          {isDemo ? "from sample deals" : "from recent deals"} · {premium ? "you'll get these live" : "Free shows them after they end"}
        </span>
      </div>
      <DealGrid deals={results} mode={premium ? "live" : "missed"}
        empty={<>Nothing matches yet. Try <button type="button" className="link-btn" onClick={() => setDraft({ ...defaults })}>clearing this filter</button> or widening a setting.</>} />

      {/* All filters panel */}
      {drawer && (
        <div className="fs-drawer-bg" onClick={() => setDrawer(false)}>
          <aside className="fs-drawer" role="dialog" aria-label="All filters" onClick={(e) => e.stopPropagation()}>
            <div className="fs-drawer-head">
              <b>All filters</b>
              <button type="button" className="btn sm ghost" onClick={() => setDrawer(false)} aria-label="Close">✕</button>
            </div>
            <div className="fs-applied">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <b style={{ flex: "none" }}>Applied</b>
                <button type="button" className="link-btn small" style={{ flex: "none" }} disabled={!applied.length} onClick={() => setDraft({ ...defaults })}>Reset all</button>
              </div>
              <div className="fs-chips">
                {applied.length ? applied.map((x) => (
                  <span key={x.key} className="fs-chip">{x.label}: {x.summary(draft)} <button type="button" aria-label={`Clear ${x.label}`} onClick={() => reset(x)}>✕</button></span>
                )) : <span className="small muted">Nothing yet. Every deal over your plan&apos;s minimums is included.</span>}
              </div>
            </div>
            {FACETS.map((x) => (
              <section key={x.key} className={`fs-section ${x.disabled?.(draft) ? "dim" : ""}`}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <h3 style={{ flex: "none" }}>{x.label}</h3>
                  {x.active(draft, defaults) && <button type="button" className="link-btn small" style={{ flex: "none" }} onClick={() => reset(x)}>Reset</button>}
                </div>
                <FacetControl k={x.key} f={draft} set={set} toggle={toggle} plan={plan} errors={errors} />
              </section>
            ))}
            <div className="fs-drawer-foot">
              <span className="small muted">{results.length} deals match</span>
              <button type="button" className="btn primary" onClick={() => { setDrawer(false); if (dirty) update(); }}>{dirty ? "Update this filter" : "Done"}</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
