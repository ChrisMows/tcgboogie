"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import CardThumb from "@/components/CardThumb";
import { DealGrid } from "@/components/DealTile";
import { cardOptions, createProfile, deleteProfile, saveProfile, setProfileActive } from "@/app/app/actions";
import { FACETS, activeFacets, hasCards } from "@/lib/facets";
import { GRADE_STEPS, GRADERS, RAW_CONDITION_LABELS, RAW_CONDITIONS, clampToPlan, defaultFilters, matches, ALERT_CHANNELS, ALERT_CHANNEL_LABELS } from "@/lib/filters";

const Err = ({ msg }) => (msg ? <div className="err">{msg}</div> : null);
const Lock = ({ children }) => <div className="locked-note">🔒 {children} <Link href="/app/premium?from=filters">Upgrade</Link></div>;
const short = (n) => String(n || "").replace(/\s*\(.*\)$/, "");
const cardNo = (n) => String(n || "").split("/")[0].replace(/^0+(?=\d)/, "");
const sameCard = (a, b) => a.name === b.name && (a.number || "") === (b.number || "") && (a.setName || "") === (b.setName || "");

function Check({ checked, onChange, disabled, children }) {
  return (
    <label className={`fs-check ${disabled ? "dim" : ""}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} /> {children}
    </label>
  );
}

function SortToggle({ value, onChange, options }) {
  return (
    <div className="seg fs-sort" role="group" aria-label="Sort">
      {options.map(([k, label]) => <button key={k} type="button" className={value === k ? "on" : ""} onClick={() => onChange(k)}>{label}</button>)}
    </div>
  );
}

/** Sets: type to narrow, tick to choose. */
function SetPicker({ f, set, allSets }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("new");
  const shown = useMemo(() => {
    const w = q.toLowerCase().trim();
    const list = allSets.filter((s) => !w || s.name.toLowerCase().includes(w));
    return sort === "az" ? [...list].sort((a, b) => a.name.localeCompare(b.name))
      : [...list].sort((a, b) => String(b.releaseDate || "").localeCompare(String(a.releaseDate || "")));
  }, [allSets, q, sort]);
  const toggleSet = (name) => set("sets", f.sets.includes(name) ? f.sets.filter((x) => x !== name) : [...f.sets, name]);
  return (
    <>
      <input type="search" className="fs-search" placeholder="Type a set name" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <SortToggle value={sort} onChange={setSort} options={[["new", "Newest"], ["az", "A–Z"]]} />
      <div className="fs-list">
        {shown.map((s) => (
          <Check key={s.name} checked={f.sets.includes(s.name)} onChange={() => toggleSet(s.name)}>
            <span className="fs-opt"><b>{s.name}</b>{s.releaseDate ? <span className="small muted"> · {String(s.releaseDate).slice(0, 4)}</span> : null}</span>
          </Check>
        ))}
        {!shown.length && <div className="small muted">No sets match.</div>}
      </div>
      <div className="hint">Optional. Picking sets narrows the Cards list to those sets.</div>
    </>
  );
}

/** Cards: type a name or number; the list narrows as you go. Tick as many as you like. */
function CardPicker({ f, set }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("az");
  const [res, setRes] = useState({ cards: [], loading: true });
  const seq = useRef(0);
  useEffect(() => {
    const n = ++seq.current;
    setRes((r) => ({ ...r, loading: true }));
    const t = setTimeout(async () => {
      const r = await cardOptions(q, f.sets).catch(() => ({ ok: false }));
      if (n !== seq.current) return;
      setRes(r.ok ? { cards: r.cards, needsQuery: r.needsQuery, loading: false } : { cards: [], error: r.error || "Card list didn't load.", loading: false });
    }, 250);
    return () => clearTimeout(t);
  }, [q, f.sets]);

  const sorted = useMemo(() => {
    const list = [...res.cards];
    if (sort === "az") return list.sort((a, b) => short(a.name).localeCompare(short(b.name)) || cardNo(a.number).localeCompare(cardNo(b.number), undefined, { numeric: true }));
    return list.sort((a, b) => String(a.release).localeCompare(String(b.release)) || a.setName.localeCompare(b.setName)
      || cardNo(a.number).localeCompare(cardNo(b.number), undefined, { numeric: true }));
  }, [res.cards, sort]);

  const cards = f.cards || [];
  const isOn = (c) => cards.some((x) => sameCard(x, { name: c.name, number: c.number, setName: c.setName }));
  const flip = (c) => {
    const entry = { name: c.name, setName: c.setName, number: c.number };
    set("cards", isOn(c) ? cards.filter((x) => !sameCard(x, entry)) : [...cards, entry]);
  };
  const term = q.trim();
  const anyOn = term.length >= 2 && f.pokemon.some((p) => p.toLowerCase() === term.toLowerCase());

  return (
    <>
      {(cards.length > 0 || f.pokemon.length > 0) && (
        <div className="fs-chips">
          {f.pokemon.map((p) => <span key={p} className="fs-chip">Any {p} <button type="button" aria-label={`Remove ${p}`} onClick={() => set("pokemon", f.pokemon.filter((x) => x !== p))}>✕</button></span>)}
          {cards.map((c) => (
            <span key={`${c.name}|${c.number}|${c.setName}`} className="fs-chip">
              {short(c.name)}{c.number ? ` #${cardNo(c.number)}` : ""}
              <button type="button" aria-label={`Remove ${c.name}`} onClick={() => set("cards", cards.filter((x) => !sameCard(x, c)))}>✕</button>
            </span>
          ))}
        </div>
      )}
      <input type="search" className="fs-search" placeholder="Type a card name or number, e.g. Charizard 199" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <SortToggle value={sort} onChange={setSort} options={[["az", "A–Z"], ["set", "Set order"]]} />
      <div className="fs-list cards">
        {term.length >= 2 && (
          <Check checked={anyOn} onChange={() => set("pokemon", anyOn ? f.pokemon.filter((p) => p.toLowerCase() !== term.toLowerCase()) : [...f.pokemon, term])}>
            <span className="fs-opt"><b>Any card named “{term}”</b><span className="small muted"> · every set and version</span></span>
          </Check>
        )}
        {res.loading && !res.cards.length ? <div className="small muted">Loading cards…</div> : null}
        {res.error && <div className="err">{res.error}</div>}
        {res.needsQuery && <div className="small muted">Type at least 2 letters, or pick a set first.</div>}
        {sorted.map((c) => (
          <label key={c.id} className={`fs-card ${c.owned ? "owned" : ""}`}>
            <input type="checkbox" checked={isOn(c)} onChange={() => flip(c)} />
            <CardThumb item={c} width={30} />
            <span className="fs-opt">
              <b>{short(c.name)}</b>
              <span className="small muted">{c.setName}{c.number ? ` · #${cardNo(c.number)}` : ""}</span>
            </span>
            {c.owned > 0 && <span className="fs-owned" title="In your collection">✓ In collection{c.owned > 1 ? ` ×${c.owned}` : ""}</span>}
          </label>
        ))}
        {!res.loading && !res.error && !res.needsQuery && !sorted.length && <div className="small muted">No cards match. Try fewer letters.</div>}
      </div>
    </>
  );
}

/** The controls for one facet (used in the pill dropdowns and in the All filters panel). */
function FacetControl({ k, f, set, toggle, plan, errors, allSets, ready }) {
  const premium = plan.key === "premium";
  switch (k) {
    case "sets": return <SetPicker f={f} set={set} allSets={allSets} />;
    case "cards": return <CardPicker f={f} set={set} />;
    case "product": {
      const cards = hasCards(f);
      const sealed = f.cardTypes.includes("sealed");
      return (<>
        <Check checked={cards} onChange={() => set("cardTypes", cards ? f.cardTypes.filter((t) => t === "sealed") : ["graded", "raw", ...(sealed ? ["sealed"] : [])])}>
          Cards <span className="small muted">(graded slabs and raw cards)</span>
        </Check>
        <Check checked={sealed} onChange={() => toggle("cardTypes", "sealed")}>
          Sealed products <span className="small muted">(booster boxes, ETBs, bundles, tins, packs)</span>
        </Check>
        <Err msg={errors.cardTypes} />
      </>);
    }
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
      </>);
    case "gradeRange":
      return (<>
        <div className="fs-row">
          <label>From <select value={f.minGrade} onChange={(e) => set("minGrade", Number(e.target.value))}>{GRADE_STEPS.map((g) => <option key={g} value={g}>{g}</option>)}</select></label>
          <label>to <select value={f.maxGrade} onChange={(e) => set("maxGrade", Number(e.target.value))}>{GRADE_STEPS.map((g) => <option key={g} value={g}>{g}</option>)}</select></label>
        </div>
        <Err msg={errors.minGrade} />
      </>);
    case "condition":
      return RAW_CONDITIONS.map((c) => (
        <label key={c} className="fs-check">
          <input type="radio" name={`cond-${k}`} checked={f.minRawCondition === c} onChange={() => set("minRawCondition", c)} /> {RAW_CONDITION_LABELS[c]}
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
    case "channels":
      return (<>
        {ALERT_CHANNELS.map((c) => (
          <Check key={c} checked={(f.channels || ALERT_CHANNELS).includes(c)} onChange={() => toggle("channels", c)}>
            {ALERT_CHANNEL_LABELS[c]}
            {ready && !ready[c] && <span className="small muted"> · not set up yet (<a href="/app/account#alerts">Settings</a>)</span>}
          </Check>
        ))}
        <Err msg={errors.channels} />
        <div className="hint">How this filter&apos;s live deal alerts reach you. Pick one, two or all three.</div>
        {!premium && <Lock>Live deal alerts come with Premium. On Free, deals show on this page after they end.</Lock>}
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

export default function FilterStudio({ profiles: initial, plan, deals, sample, prefill, allSets, ready }) {
  const router = useRouter();
  const defaults = useMemo(() => defaultFilters(plan), [plan]);
  const [profiles, setProfiles] = useState(initial);
  const [openId, setOpenId] = useState(initial[0]?.id ?? null); // the expanded filter
  const selected = profiles.find((p) => p.id === openId) || null;
  const [draft, setDraft] = useState(() => {
    const f = clampToPlan(initial[0]?.filters, plan);
    if (!prefill) return f;
    const add = (list, v) => (v && !list.includes(v) ? [...list, v] : list);
    return { ...f, pokemon: add(f.pokemon, prefill.pokemon), sets: add(f.sets, prefill.set) };
  });
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(prefill ? { kind: "warn", text: `Added ${[prefill.pokemon, prefill.set].filter(Boolean).join(" from ")}. Check it, then Update this filter.` } : null);
  const [pop, setPop] = useState(null); // open pill dropdown
  const [drawer, setDrawer] = useState(false);
  const [pending, start] = useTransition();
  const barRef = useRef(null);

  useEffect(() => setProfiles(initial), [initial]);
  useEffect(() => {
    if (!pop && !drawer) return;
    const close = (e) => { if (pop && barRef.current && !barRef.current.contains(e.target)) setPop(null); };
    const esc = (e) => { if (e.key === "Escape") { setPop(null); setDrawer(false); } };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [pop, drawer]);

  const saved = selected ? clampToPlan(selected.filters, plan) : null;
  const dirty = Boolean(selected) && JSON.stringify(draft) !== JSON.stringify(saved);
  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const toggle = (key, value) => setDraft((d) => ({ ...d, [key]: d[key].includes(value) ? d[key].filter((x) => x !== value) : [...d[key], value] }));
  const reset = (facet) => setDraft((d) => ({ ...d, ...facet.reset(defaults, d) }));
  const premium = plan.key === "premium";
  const atLimit = profiles.length >= plan.maxProfiles;
  const filtersOf = (p) => (p.id === openId ? draft : clampToPlan(p.filters, plan));
  const statusOf = (p, i) => (i >= plan.maxProfiles ? "locked" : p.active ? "on" : "paused");
  const confirmDiscard = () => !dirty || window.confirm("You have changes you haven't saved. Discard them?");

  function openBox(p) {
    if (p.id === openId) { if (confirmDiscard()) { setOpenId(null); setPop(null); setRenaming(false); } return; }
    if (!confirmDiscard()) return;
    setOpenId(p.id); setDraft(clampToPlan(p.filters, plan)); setErrors({}); setMessage(null); setPop(null); setRenaming(false);
  }
  function update() {
    start(async () => {
      const res = await saveProfile(selected.id, { ...draft, name: selected.name });
      if (!res.ok) { setErrors(res.errors || {}); setMessage({ kind: "bad", text: "A setting needs a fix. Look for the note in red." }); return; }
      setErrors({}); setMessage({ kind: "good", text: `“${selected.name}” updated. It applies from the next check, within a minute.` });
      setProfiles((ps) => ps.map((p) => (p.id === selected.id ? { ...p, filters: draft } : p)));
      router.refresh();
    });
  }
  function rename() {
    const name = newName.trim().slice(0, 40);
    if (!name) return setRenaming(false);
    start(async () => {
      const res = await saveProfile(selected.id, { ...saved, name });
      if (!res.ok) return setMessage({ kind: "bad", text: res.errors?.name || "Couldn't rename this filter." });
      setProfiles((ps) => ps.map((p) => (p.id === selected.id ? { ...p, name } : p)));
      setRenaming(false); setMessage({ kind: "good", text: `Renamed to “${name}”.` });
      router.refresh();
    });
  }
  function addFilter() {
    if (!confirmDiscard()) return;
    start(async () => {
      const res = await createProfile();
      if (!res.ok) return setMessage({ kind: "warn", text: res.error });
      const fresh = { id: res.id, name: `Filter ${profiles.length + 1}`, active: true, filters: clampToPlan({}, plan) };
      setProfiles((ps) => [...ps, fresh]); setOpenId(fresh.id); setDraft(fresh.filters);
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
      setProfiles(rest); setOpenId(rest[0]?.id ?? null); setDraft(clampToPlan(rest[0]?.filters, plan));
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

  return (
    <div className="fs">
      <div className="fs-legend small muted">
        <span><span className="fs-dot on" /> Running</span><span><span className="fs-dot paused" /> Paused</span>
        {profiles.length > plan.maxProfiles && <span><span className="fs-dot locked" /> Not running on {plan.label} · <Link href="/app/premium?from=filters">Upgrade</Link></span>}
      </div>

      {profiles.map((p, i) => {
        const f = filtersOf(p);
        const isOpen = p.id === openId;
        const st = statusOf(p, i);
        const applied = activeFacets(f, defaults);
        const results = deals.filter((d) => matches(f, d));
        return (
          <section key={p.id} className={`fx ${isOpen ? "open" : ""} ${isOpen && dirty ? "dirty" : ""}`}>
            <div className="fx-head">
              <button type="button" className="fx-toggle" aria-expanded={isOpen} onClick={() => openBox(p)}>
                <span className={`fs-dot ${st}`} aria-hidden="true" />
                {!(isOpen && renaming) && <span className="fx-name">{p.name}</span>}
                <span className="sr-only">{st === "on" ? "running" : st === "paused" ? "paused" : "not running on your plan"}</span>
              </button>
              {isOpen && renaming ? (
                <form className="fx-rename" onSubmit={(e) => { e.preventDefault(); rename(); }}>
                  <input value={newName} maxLength={40} autoFocus onChange={(e) => setNewName(e.target.value)} aria-label="Filter name"
                    onKeyDown={(e) => e.key === "Escape" && setRenaming(false)} />
                  <button className="btn sm primary" disabled={pending} aria-label="Save name">✓</button>
                  <button type="button" className="btn sm ghost" onClick={() => setRenaming(false)} aria-label="Cancel">✕</button>
                </form>
              ) : isOpen ? (
                <button type="button" className="fx-pencil" title="Rename" aria-label={`Rename ${p.name}`} onClick={() => { setNewName(p.name); setRenaming(true); }}>✎</button>
              ) : null}
              <button type="button" className="fx-rest" onClick={() => openBox(p)} tabIndex={-1} aria-hidden="true">
                {!isOpen && <span className="fx-summary">{applied.length ? applied.map((x) => `${x.label}: ${x.summary(f)}`).join(" · ") : "Every deal over your plan's minimums"}</span>}
                <span className="fs-count">{results.length} {results.length === 1 ? "deal" : "deals"}</span>
                <span className="fx-chev">{isOpen ? "▴" : "▾"}</span>
              </button>
            </div>

            {isOpen && (
              <div className="fx-body">
                <div className="fs-bar" ref={barRef}>
                  <div className={`fs-pill-wrap all ${applied.length ? "has" : ""}`}>
                    <button type="button" className="fs-pill" onClick={() => { setDrawer(true); setPop(null); }}>
                      ☰ All filters {applied.length > 0 && <span className="fs-badge">{applied.length}</span>}
                    </button>
                  </div>
                  {FACETS.map((x) => {
                    const off = x.disabled?.(draft);
                    const on = !off && x.active(draft, defaults);
                    const wide = x.key === "cards" || x.key === "sets";
                    return (
                      <div key={x.key} className={`fs-pill-wrap ${on ? "on" : ""} ${pop === x.key ? "open" : ""} ${off ? "off" : ""}`}>
                        <button type="button" className="fs-pill" disabled={off} aria-expanded={pop === x.key}
                          onClick={() => setPop(pop === x.key ? null : x.key)} title={off ? (hasCards(draft) ? "Doesn't apply to the card types picked" : "Only for cards: turn on Cards under Product type") : ""}>
                          {on ? <><span className="fs-pill-k">{x.label}:</span> {x.summary(draft)}</> : x.label}
                          {!on && <span className="fs-caret" aria-hidden="true">▾</span>}
                        </button>
                        {on && <button type="button" className="fs-x" aria-label={`Clear ${x.label}`} onClick={() => reset(x)}>✕</button>}
                        {pop === x.key && (
                          <div className={`fs-pop ${wide ? "wide" : ""}`} role="dialog" aria-label={x.label}>
                            <FacetControl k={x.key} f={draft} set={set} toggle={toggle} plan={plan} errors={errors} allSets={allSets} ready={ready} />
                            <div className="fs-pop-foot">
                              <button type="button" className="link-btn small" onClick={() => reset(x)}>Reset</button>
                              <button type="button" className="btn sm primary" onClick={() => setPop(null)}>Done</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button type="button" className="link-btn fs-clear" disabled={!applied.length} onClick={() => setDraft({ ...defaults })}>Clear filter</button>
                </div>

                <div className="fx-actions">
                  <span className="small muted">{dirty ? "Unsaved changes" : st === "on" ? "Running" : st === "paused" ? "Paused" : `Not running on ${plan.label}`}</span>
                  <span className="fs-spacer" />
                  <button type="button" className="btn sm ghost" onClick={pause} disabled={pending}>{p.active ? "⏸ Pause" : "▶ Resume"}</button>
                  <button type="button" className="btn sm ghost danger" onClick={remove} disabled={pending || profiles.length <= 1}>Delete</button>
                  {dirty && <button type="button" className="btn sm" onClick={() => { setDraft(saved); setErrors({}); }}>Discard</button>}
                  <button type="button" className="btn sm primary" onClick={update} disabled={!dirty || pending}>{pending ? "Saving…" : "Update this filter"}</button>
                </div>
                {message && <div className={`notice ${message.kind}`} style={{ margin: "0 0 12px" }}>{message.text}</div>}

                <div className="fs-results-head">
                  <b>{results.length} {results.length === 1 ? "deal matches" : "deals match"}</b>
                  <span className="small muted">{sample ? "example deals: real ones appear as the deal finder catches them" : `deals from the last 7 days · ${premium ? "you get new ones live" : "Free shows them after they end"}`}</span>
                </div>
                <DealGrid deals={results} mode={premium ? "live" : "missed"}
                  empty={<>Nothing matches yet. Try <button type="button" className="link-btn" onClick={() => setDraft({ ...defaults })}>clearing this filter</button> or widening a setting.</>} />
              </div>
            )}
          </section>
        );
      })}

      <button type="button" className="fx-add" onClick={addFilter} disabled={pending || atLimit}
        title={atLimit ? `${plan.label} includes ${plan.maxProfiles} filter${plan.maxProfiles > 1 ? "s" : ""}` : ""}>
        + New filter{atLimit && !premium ? <> · 🔒 <Link href="/app/premium?from=filters">Premium</Link> for up to {15}</> : null}
      </button>

      {drawer && selected && (
        <div className="fs-drawer-bg" onClick={() => setDrawer(false)}>
          <aside className="fs-drawer" role="dialog" aria-label="All filters" onClick={(e) => e.stopPropagation()}>
            <div className="fs-drawer-head">
              <b>All filters · {selected.name}</b>
              <button type="button" className="btn sm ghost" onClick={() => setDrawer(false)} aria-label="Close">✕</button>
            </div>
            <div className="fs-applied">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <b style={{ flex: "none" }}>Applied</b>
                <button type="button" className="link-btn small" style={{ flex: "none" }} disabled={!activeFacets(draft, defaults).length} onClick={() => setDraft({ ...defaults })}>Reset all</button>
              </div>
              <div className="fs-chips">
                {activeFacets(draft, defaults).length ? activeFacets(draft, defaults).map((x) => (
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
                <FacetControl k={x.key} f={draft} set={set} toggle={toggle} plan={plan} errors={errors} allSets={allSets} ready={ready} />
              </section>
            ))}
            <div className="fs-drawer-foot">
              <span className="small muted">{deals.filter((d) => matches(draft, d)).length} deals match</span>
              <button type="button" className="btn primary" onClick={() => { setDrawer(false); if (dirty) update(); }}>{dirty ? "Update this filter" : "Done"}</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
