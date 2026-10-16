"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createProfile, deleteProfile, saveProfile, setProfileActive } from "@/app/app/actions";
import {
  GRADE_STEPS, GRADERS, RAW_CONDITION_LABELS, RAW_CONDITIONS, clampToPlan, describe, matches,
} from "@/lib/filters";
import { POKEMON, SETS } from "@/lib/suggestions";

function TagInput({ id, label, hint, values, onChange, suggestions, placeholder }) {
  const [text, setText] = useState("");
  const add = (raw) => {
    const v = raw.trim();
    if (v && !values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
    setText("");
  };
  return (
    <div>
      <label className="field" htmlFor={id}>{label}</label>
      {values.length > 0 && (
        <div className="tags">
          {values.map((v) => (
            <span className="tag" key={v}>
              {v}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>×</button>
            </span>
          ))}
        </div>
      )}
      <input
        id={id}
        type="text"
        list={`${id}-list`}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value;
          // picking a suggestion from the list adds it right away
          if (suggestions.includes(v)) add(v);
          else setText(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(text);
          }
        }}
        onBlur={() => text && add(text)}
      />
      <datalist id={`${id}-list`}>
        {suggestions.filter((s) => !values.includes(s)).map((s) => <option key={s} value={s} />)}
      </datalist>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

const Err = ({ msg }) => (msg ? <div className="err">{msg}</div> : null);

export default function FilterEditor({ profiles: initial, plan, sampleDeals, isDemo }) {
  const router = useRouter();
  const [profiles, setProfiles] = useState(initial);
  const [selectedId, setSelectedId] = useState(initial[0]?.id);
  const selected = profiles.find((p) => p.id === selectedId) || profiles[0];
  const [draft, setDraft] = useState(() => clampToPlan(selected.filters, plan));
  const [name, setName] = useState(selected.name);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => setProfiles(initial), [initial]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(clampToPlan(selected.filters, plan)) || name !== selected.name,
    [draft, name, selected, plan],
  );

  function select(id) {
    if (dirty && !window.confirm("You have unsaved changes. Discard them?")) return;
    const p = profiles.find((x) => x.id === Number(id));
    setSelectedId(p.id);
    setDraft(clampToPlan(p.filters, plan));
    setName(p.name);
    setErrors({});
    setMessage(null);
  }

  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const toggle = (key, value) =>
    setDraft((d) => ({ ...d, [key]: d[key].includes(value) ? d[key].filter((x) => x !== value) : [...d[key], value] }));

  const caught = sampleDeals.filter((d) => matches(draft, d));
  const atLimit = profiles.length >= plan.maxProfiles;
  const premium = plan.key === "premium";
  const typeMode = draft.cardTypes.length === 2 ? "both" : draft.cardTypes[0];

  function save() {
    startTransition(async () => {
      const res = await saveProfile(selected.id, { ...draft, name });
      if (res.ok) {
        setErrors({});
        setMessage({ kind: "good", text: "Saved. Your filters apply from the next check, within about a minute." });
        setProfiles((ps) => ps.map((p) => (p.id === selected.id ? { ...p, name, filters: draft } : p)));
        router.refresh();
      } else {
        setErrors(res.errors || {});
        setMessage({ kind: "bad", text: "Some settings need a fix. See the notes below." });
      }
    });
  }

  function addProfile() {
    if (dirty && !window.confirm("You have unsaved changes. Discard them?")) return;
    startTransition(async () => {
      const res = await createProfile();
      if (!res.ok) return setMessage({ kind: "warn", text: res.error });
      const fresh = { id: res.id, name: `Profile ${profiles.length + 1}`, active: true, filters: clampToPlan({}, plan) };
      setProfiles((ps) => [...ps, fresh]);
      setSelectedId(fresh.id);
      setName(fresh.name);
      setDraft(fresh.filters);
      setMessage({ kind: "good", text: "New profile created. Adjust it and save." });
      router.refresh();
    });
  }

  function removeProfile() {
    if (!window.confirm(`Delete “${selected.name}”? This can't be undone.`)) return;
    startTransition(async () => {
      const res = await deleteProfile(selected.id);
      if (!res.ok) return setMessage({ kind: "warn", text: res.error });
      const rest = profiles.filter((p) => p.id !== selected.id);
      setProfiles(rest);
      setSelectedId(rest[0].id);
      setDraft(clampToPlan(rest[0].filters, plan));
      setName(rest[0].name);
      setMessage({ kind: "good", text: "Profile deleted." });
      router.refresh();
    });
  }

  function toggleActive() {
    const next = !selected.active;
    startTransition(async () => {
      await setProfileActive(selected.id, next);
      setProfiles((ps) => ps.map((p) => (p.id === selected.id ? { ...p, active: next } : p)));
      router.refresh();
    });
  }

  const index = profiles.findIndex((p) => p.id === selected.id);
  const overLimit = index >= plan.maxProfiles;

  return (
    <div>
      <div className="editor-top">
        <select aria-label="Choose a profile" value={selected.id} onChange={(e) => select(e.target.value)}>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>{p.name}{p.active ? "" : " (paused)"}</option>
          ))}
        </select>
        <span className={`badge ${selected.active && !overLimit ? "good" : "warn"}`}>
          {overLimit ? "Over your plan's limit" : selected.active ? "Running" : "Paused"}
        </span>
        <span className="small muted">
          {Math.min(profiles.length, plan.maxProfiles)} of {plan.maxProfiles} profile{plan.maxProfiles > 1 ? "s" : ""} running
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn sm" onClick={toggleActive} disabled={pending}>
          {selected.active ? "Pause" : "Resume"}
        </button>
        <button type="button" className="btn sm" onClick={addProfile} disabled={pending || atLimit} title={atLimit ? "Upgrade for more profiles" : ""}>
          New profile
        </button>
        <button type="button" className="btn sm danger" onClick={removeProfile} disabled={pending || profiles.length <= 1}>
          Delete
        </button>
      </div>
      {profiles.length > plan.maxProfiles && (
        <div className="notice warn">
          You have {profiles.length} profiles, but your {plan.label} plan runs {plan.maxProfiles}. Only the first
          {plan.maxProfiles > 1 ? ` ${plan.maxProfiles}` : ""} {plan.maxProfiles > 1 ? "are" : "is"} checking deals; the
          others are kept for you. <Link href="/app/billing">Upgrade</Link> to run them all, or delete the ones you don't need.
        </div>
      )}
      {atLimit && !premium && profiles.length <= plan.maxProfiles && (
        <div className="notice">
          Free includes 1 profile. <Link href="/app/billing">Premium</Link> gives you 15, so you can track vintage, modern
          and raw cards separately.
        </div>
      )}
      {message && <div className={`notice ${message.kind}`}>{message.text}</div>}
      {errors._ && <div className="notice bad">{errors._}</div>}

      <div className="summary">
        <div className="label">This profile looks for</div>
        <p>{describe(draft)}</p>
        <div className="catch">
          Would have caught {caught.length} of {sampleDeals.length} {isDemo ? "sample" : "recent"} deals
          {caught.length === 0 ? ". Try loosening a setting." : "."}
        </div>
      </div>

      <div className="panel">
        <label className="field" htmlFor="pname">Profile name</label>
        <input id="pname" type="text" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        <Err msg={errors.name} />
      </div>

      <div className="panel">
        <h2>Card type</h2>
        <div className="seg" role="group" aria-label="Card type">
          {[["graded", "Graded only"], ["raw", "Raw only"], ["both", "Both"]].map(([v, label]) => (
            <button key={v} type="button" className={typeMode === v ? "on" : ""}
              onClick={() => set("cardTypes", v === "both" ? ["graded", "raw"] : [v])}>
              {label}
            </button>
          ))}
        </div>
        <Err msg={errors.cardTypes} />
        <div className={typeMode === "graded" ? "dim" : ""} style={{ marginTop: 16, maxWidth: 360 }}>
          <label className="field" htmlFor="rawcond">Lowest raw condition</label>
          <select id="rawcond" value={draft.minRawCondition} onChange={(e) => set("minRawCondition", e.target.value)}>
            {RAW_CONDITIONS.map((c) => <option key={c} value={c}>{RAW_CONDITION_LABELS[c]}</option>)}
          </select>
          <div className="hint">Raw cards are valued at TCGplayer's market price for that condition and printing.</div>
        </div>
      </div>

      <div className="panel">
        <h2>Deal</h2>
        <label className="field" htmlFor="disc">Price + shipping at least this far below market</label>
        <div className="range-row">
          <input id="disc" type="range" min={plan.minDiscountFloor} max={80} step={1} value={draft.minDiscountPct}
            onChange={(e) => set("minDiscountPct", Number(e.target.value))} />
          <output htmlFor="disc">{draft.minDiscountPct}%</output>
        </div>
        {!premium && <div className="locked-note">Premium lets you go as low as {15}% below market.</div>}
        <Err msg={errors.minDiscountPct} />

        <label className="field" htmlFor="mins" style={{ marginTop: 16 }}>Auction ends within</label>
        <div className="range-row">
          <input id="mins" type="range" min={1} max={plan.maxWindowMinutes} step={1} value={draft.maxMinutesLeft}
            onChange={(e) => set("maxMinutesLeft", Number(e.target.value))} />
          <output htmlFor="mins">{draft.maxMinutesLeft} min</output>
        </div>
        {!premium && <div className="locked-note">Premium alerts up to 60 minutes before the end.</div>}
        <Err msg={errors.maxMinutesLeft} />
      </div>

      <div className="form-grid">
        <div className={`panel ${typeMode === "raw" ? "dim" : ""}`}>
          <h2>Grading <span className="small muted">(slabs)</span></h2>
          <label className="field">Graders</label>
          <div className="chips">
            {GRADERS.map((g) => (
              <button key={g} type="button" className={`chip ${draft.graders.includes(g) ? "on" : ""}`} onClick={() => toggle("graders", g)}>
                {g}
              </button>
            ))}
          </div>
          <Err msg={errors.graders} />
          <div className="row" style={{ marginTop: 16 }}>
            <div>
              <label className="field" htmlFor="gmin">Lowest grade</label>
              <select id="gmin" value={draft.minGrade} onChange={(e) => set("minGrade", Number(e.target.value))}>
                {GRADE_STEPS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="field" htmlFor="gmax">Highest grade</label>
              <select id="gmax" value={draft.maxGrade} onChange={(e) => set("maxGrade", Number(e.target.value))}>
                {GRADE_STEPS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>
          <Err msg={errors.minGrade} />
        </div>

        <div className="panel">
          <h2>Value and price</h2>
          <div className="row">
            <div>
              <label className="field" htmlFor="vmin">Card worth at least ($)</label>
              <input id="vmin" type="number" min={plan.minValueFloor} value={draft.minMarketValue}
                onChange={(e) => set("minMarketValue", e.target.value === "" ? "" : Number(e.target.value))} />
            </div>
            <div>
              <label className="field" htmlFor="vmax">Up to ($)</label>
              <input id="vmax" type="number" min={0} placeholder="No max" value={draft.maxMarketValue ?? ""}
                onChange={(e) => set("maxMarketValue", e.target.value === "" ? null : Number(e.target.value))} />
            </div>
          </div>
          <Err msg={errors.minMarketValue || errors.maxMarketValue} />
          <label className="field" htmlFor="pmax" style={{ marginTop: 14 }}>Most I'll pay, incl. shipping ($)</label>
          <input id="pmax" type="number" min={0} placeholder="No limit" value={draft.maxPrice ?? ""}
            onChange={(e) => set("maxPrice", e.target.value === "" ? null : Number(e.target.value))} />
          <Err msg={errors.maxPrice} />
        </div>
      </div>

      <div className="panel">
        <h2>Cards and sets</h2>
        <div className="form-grid">
          <TagInput id="pk" label="Only these Pokémon or cards" hint="Leave empty for any. Type and press Enter, or pick from the list."
            values={draft.pokemon} onChange={(v) => set("pokemon", v)} suggestions={POKEMON} placeholder="Start typing, e.g. Charizard" />
          <TagInput id="xpk" label="Never these" values={draft.excludePokemon} onChange={(v) => set("excludePokemon", v)}
            suggestions={POKEMON} placeholder="e.g. Pikachu" />
          <TagInput id="sets" label="Only these sets" hint="Leave empty for every set."
            values={draft.sets} onChange={(v) => set("sets", v)} suggestions={SETS} placeholder="e.g. Evolving Skies" />
          <TagInput id="xsets" label="Skip these sets" values={draft.excludeSets} onChange={(v) => set("excludeSets", v)}
            suggestions={SETS} placeholder="e.g. Celebrations" />
        </div>
      </div>

      <div className="form-grid">
        <div className="panel">
          <h2>Language</h2>
          <label className="check"><input type="checkbox" checked={draft.languages.includes("english")} onChange={() => toggle("languages", "english")} /> English</label>
          <label className={`check ${premium ? "" : "dim"}`}>
            <input type="checkbox" checked={draft.languages.includes("japanese")} disabled={!premium} onChange={() => toggle("languages", "japanese")} /> Japanese
          </label>
          {!premium && <div className="locked-note">Japanese cards are a Premium feature.</div>}
          <Err msg={errors.languages} />
        </div>
        <div className="panel">
          <h2>Seller and safety</h2>
          <label className="check"><input type="checkbox" checked={draft.usOnly} onChange={(e) => set("usOnly", e.target.checked)} /> US sellers only</label>
          <label className="check"><input type="checkbox" checked={draft.hideFlagged} onChange={(e) => set("hideFlagged", e.target.checked)} /> Hide listings with red flags</label>
          <div className="row" style={{ marginTop: 10 }}>
            <div>
              <label className="field" htmlFor="fb">Min seller feedback</label>
              <input id="fb" type="number" min={0} value={draft.minSellerFeedback} onChange={(e) => set("minSellerFeedback", Number(e.target.value || 0))} />
              <Err msg={errors.minSellerFeedback} />
            </div>
            <div>
              <label className="field" htmlFor="comps">Min sales behind the value</label>
              <input id="comps" type="number" min={3} value={draft.minComps} onChange={(e) => set("minComps", Number(e.target.value || 3))} />
              <Err msg={errors.minComps} />
            </div>
          </div>
        </div>
      </div>

      <div className="save-bar">
        {dirty && <span className="small muted" style={{ marginRight: "auto" }}>You have unsaved changes</span>}
        <button type="button" className="btn" disabled={!dirty || pending}
          onClick={() => { setDraft(clampToPlan(selected.filters, plan)); setName(selected.name); setErrors({}); }}>
          Discard
        </button>
        <button type="button" className="btn primary" disabled={!dirty || pending} onClick={save}>
          {pending ? "Saving..." : "Save profile"}
        </button>
      </div>
    </div>
  );
}
