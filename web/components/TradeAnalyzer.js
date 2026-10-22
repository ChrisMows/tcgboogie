"use client";

import CardRequest from "@/components/CardRequest";
import { useEffect, useRef, useState } from "react";
import CardThumb from "@/components/CardThumb";
import { productDetails, searchCatalog } from "@/app/app/collection/actions";
import { CONDITIONS, GRADERS, gradesFor, marketValue, money, nmPrice } from "@/lib/collection";

const FAIR = 0.05; // within 5% either way counts as a fair trade
let seq = 0;
const short = (name) => name.replace(/\s*\(.*\)$/, "");

/** What one copy of an entry is worth: the member's own figure if they typed one, else the market value. */
function copyValue(e) {
  if (e.override !== null && e.override !== "" && Number.isFinite(Number(e.override))) return Number(e.override);
  if (!e.edited && e.base !== null && e.base !== undefined) return e.base; // straight from the collection (may be a custom value)
  return marketValue(e.product, e.spec);
}

function entryFromProduct(p) {
  const kind = p.type === "sealed" ? "sealed" : "raw";
  return {
    key: ++seq, product: p, name: p.name, setName: p.setName, number: p.number, image: p.image, productType: p.type, language: p.language,
    spec: { kind, printing: Object.keys(p.prices || {})[0] || null, condition: "Near Mint", grader: "PSA", grade: "10" },
    qty: 1, override: null, base: null, edited: true, loading: p.type === "card",
  };
}

function entryFromItem(it) {
  return {
    key: ++seq, product: it.product, name: it.name, setName: it.setName, number: it.number, image: it.image, productType: it.productType,
    spec: { ...it.spec, grader: it.spec.grader || "PSA", grade: it.spec.grade || "10" }, qty: 1, max: it.quantity,
    override: null, base: it.value, edited: false, itemId: it.id,
  };
}

function Search({ onPick, isDemo }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [searching, setSearching] = useState(false);
  const n = useRef(0);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults(null); setError(null); return; }
    const mine = ++n.current;
    setSearching(true);
    const t = setTimeout(async () => {
      const res = await searchCatalog(term);
      if (mine !== n.current) return;
      setSearching(false);
      setError(res.ok ? null : res.error);
      setResults(res.ok ? res.results : []);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div>
      <div className="search-box small">
        <span aria-hidden="true">⌕</span>
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder={isDemo ? "Try Charizard, Umbreon, 151…" : "Search any card or sealed product"} aria-label="Search cards" />
        {searching && <span className="small muted">Searching…</span>}
      </div>
      {error && <div className="hint">{error}</div>}
      {q.trim().length >= 2 && !searching && <CardRequest query={q} />}
      {results && results.length > 0 && (
        <ul className="results trade-results">
          {results.slice(0, 8).map((p) => (
            <li key={`${p.id}-${p.language || "en"}`}>
              <button type="button" className="result-main" onClick={() => { onPick(p); setQ(""); setResults(null); }}>
                <CardThumb item={p} width={34} />
                <span className="result-text">
                  <b>{p.name}</b>
                  <span className="small muted">{p.setName}{p.number ? ` · ${p.number}` : ""}{p.type === "sealed" ? " · Sealed" : ""}{p.language === "japanese" ? " · Japanese" : ""}</span>
                </span>
                <span className="result-price">{money(p.type === "sealed" ? p.prices?.market : nmPrice(p))}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MinePicker({ mine, taken, onPick }) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const list = mine.filter((it) => (taken[it.id] || 0) < it.quantity)
    .filter((it) => !term || `${it.name} ${it.setName} ${it.number || ""} ${it.label}`.toLowerCase().includes(term)).slice(0, 8);
  if (!mine.length) return <p className="small muted">Your collection is empty. Switch to “Any card” to search the catalog.</p>;
  return (
    <div>
      <div className="search-box small">
        <span aria-hidden="true">⌕</span>
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter your cards" aria-label="Filter your cards" />
      </div>
      <ul className="results trade-results">
        {list.map((it) => (
          <li key={it.id}>
            <button type="button" className="result-main" onClick={() => onPick(it)}>
              <CardThumb item={it} width={34} />
              <span className="result-text">
                <b>{short(it.name)}</b>
                <span className="small muted">{it.setName}{it.number ? ` · ${it.number}` : ""} · {it.label}{it.quantity > 1 ? ` · ×${it.quantity}` : ""}</span>
              </span>
              <span className="result-price">{money(it.value)}</span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="small muted">No match in your collection.</li>}
      </ul>
    </div>
  );
}

function Entry({ e, onChange, onRemove }) {
  const set = (patch) => onChange({ ...e, ...patch });
  const spec = (patch) => set({ spec: { ...e.spec, ...patch }, edited: true });
  const v = copyValue(e);
  const printings = Object.keys(e.product?.prices || {});
  const isCard = e.productType !== "sealed";
  return (
    <div className="trade-entry">
      <CardThumb item={e} width={44} />
      <div className="trade-entry-main">
        <div className="trade-entry-name"><b title={e.name}>{short(e.name)}</b></div>
        <div className="small muted trade-entry-set">{e.setName}{e.number ? ` · ${e.number}` : ""}{e.language === "japanese" ? " · Japanese" : ""}</div>
        <div className="trade-entry-opts">
          {isCard && (
            <>
              <select value={e.spec.kind} onChange={(x) => spec({ kind: x.target.value })} aria-label="Raw or graded">
                <option value="raw">Raw</option>
                <option value="graded">Graded</option>
              </select>
              {e.spec.kind === "graded" ? (
                <>
                  <select value={e.spec.grader} onChange={(x) => spec({ grader: x.target.value, grade: gradesFor(x.target.value).includes(e.spec.grade) ? e.spec.grade : "10" })} aria-label="Grader">
                    {GRADERS.map((g) => <option key={g}>{g}</option>)}
                  </select>
                  <select value={e.spec.grade} onChange={(x) => spec({ grade: x.target.value })} aria-label="Grade">
                    {gradesFor(e.spec.grader).map((g) => <option key={g} value={g}>{e.spec.grader === "CGC" && g === "10" ? "10 Gem Mint" : g}</option>)}
                  </select>
                </>
              ) : (
                <>
                  {printings.length > 1 && (
                    <select value={e.spec.printing || ""} onChange={(x) => spec({ printing: x.target.value })} aria-label="Printing">
                      {printings.map((p) => <option key={p}>{p}</option>)}
                    </select>
                  )}
                  <select value={e.spec.condition || "Near Mint"} onChange={(x) => spec({ condition: x.target.value })} aria-label="Condition">
                    {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </>
              )}
            </>
          )}
          <div className="stepper sm" aria-label="Quantity">
            <button type="button" onClick={() => set({ qty: Math.max(1, e.qty - 1) })} disabled={e.qty <= 1} aria-label="One fewer">−</button>
            <span>{e.qty}</span>
            <button type="button" onClick={() => set({ qty: e.qty + 1 })} disabled={e.max !== undefined && e.qty >= e.max} aria-label="One more">+</button>
          </div>
          <button type="button" className="link-btn small" onClick={onRemove} aria-label={`Remove ${short(e.name)}`}>Remove</button>
        </div>
      </div>
      <div className="trade-entry-value">
        <span className="muted small">$</span>
        <input type="number" min="0" step="0.01" inputMode="decimal" value={e.override ?? ""} onChange={(x) => set({ override: x.target.value === "" ? null : x.target.value })}
          placeholder={e.loading ? "…" : v !== null ? v.toFixed(2) : "Value?"} aria-label="Value of one copy" title="Today's market value. Type your own to override it." />
      </div>
    </div>
  );
}

function Side({ title, hint, entries, setEntries, cash, setCash, total, mine, isDemo }) {
  const [source, setSource] = useState(mine ? "mine" : "any");
  const [adding, setAdding] = useState(false);
  const taken = {};
  for (const e of entries) if (e.itemId) taken[e.itemId] = (taken[e.itemId] || 0) + e.qty;

  const add = (e) => { setEntries((list) => [...list, e]); setAdding(false); };
  const pickProduct = (p) => {
    const e = entryFromProduct(p);
    add(e);
    if (p.type !== "card") return;
    // Search results don't carry graded sales: load the card's full prices.
    productDetails(p.id, p.language).then((full) => setEntries((list) => list.map((x) => (x.key === e.key ? { ...x, product: full || x.product, loading: false } : x))));
  };
  const pickMine = (it) => {
    const same = entries.find((x) => x.itemId === it.id);
    if (same) setEntries((list) => list.map((x) => (x.key === same.key ? { ...x, qty: Math.min(x.max, x.qty + 1) } : x)));
    else add(entryFromItem(it));
    setAdding(false);
  };

  return (
    <section className="panel trade-side">
      <div className="trade-side-head">
        <div>
          <h2>{title}</h2>
          <div className="small muted">{hint}</div>
        </div>
        <div className="trade-side-total">{money(total)}</div>
      </div>

      {entries.length === 0 && !adding && <p className="small muted">Nothing here yet.</p>}
      {entries.map((e) => (
        <Entry key={e.key} e={e} onChange={(n) => setEntries((list) => list.map((x) => (x.key === e.key ? n : x)))}
          onRemove={() => setEntries((list) => list.filter((x) => x.key !== e.key))} />
      ))}

      {adding ? (
        <div className="trade-add">
          {mine && (
            <div className="seg" role="group" aria-label="Add from">
              <button type="button" className={source === "mine" ? "on" : ""} onClick={() => setSource("mine")}>My collection</button>
              <button type="button" className={source === "any" ? "on" : ""} onClick={() => setSource("any")}>Any card</button>
            </div>
          )}
          {source === "mine" && mine ? <MinePicker mine={mine} taken={taken} onPick={pickMine} /> : <Search onPick={pickProduct} isDemo={isDemo} />}
          <button type="button" className="btn ghost sm" onClick={() => setAdding(false)}>Cancel</button>
        </div>
      ) : (
        <button type="button" className="btn sm trade-add-btn" onClick={() => setAdding(true)}>+ Add a card</button>
      )}

      <label className="trade-cash">
        <span className="small">Plus cash</span>
        <span className="trade-cash-input"><span className="muted small">$</span>
          <input type="number" min="0" step="1" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="0" aria-label={`Cash: ${title}`} />
        </span>
      </label>
    </section>
  );
}

const sideTotal = (entries, cash) => entries.reduce((s, e) => s + (copyValue(e) ?? 0) * e.qty, 0) + (Number(cash) || 0);

export default function TradeAnalyzer({ mine, isDemo }) {
  const [give, setGive] = useState([]);
  const [get, setGet] = useState([]);
  const [giveCash, setGiveCash] = useState("");
  const [getCash, setGetCash] = useState("");
  const out = sideTotal(give, giveCash);
  const inn = sideTotal(get, getCash);
  const diff = inn - out;
  const base = Math.max(out, inn);
  const ratio = base ? diff / base : 0;
  const unpriced = [...give, ...get].filter((e) => !e.loading && copyValue(e) === null).length;
  const started = out > 0 || inn > 0;

  let verdict = null;
  if (started && out > 0 && inn > 0) {
    const cents = Math.round((inn / out) * 100);
    if (Math.abs(ratio) <= FAIR) verdict = { cls: "fair", title: "Fair trade", text: `Within ${money(Math.abs(diff))} of even.` };
    else if (diff > 0) verdict = { cls: "up", title: `You come out ahead by ${money(diff)}`, text: `You get $${(inn / out).toFixed(2)} in value for every $1 you give.` };
    else verdict = { cls: "down", title: `You'd give up ${money(-diff)}`, text: `You get back ${cents}¢ for every $1 you give. Ask for ${money(-diff, 0)} more in cash or cards to even it out.` };
  } else if (started) {
    verdict = { cls: "", title: out > 0 ? "Now add what you'd get" : "Now add what you'd give", text: "Both sides need something to compare." };
  }

  return (
    <>
      <div className="trade-grid">
        <Side title="You give" hint="From your collection or any card" entries={give} setEntries={setGive} cash={giveCash} setCash={setGiveCash} total={out} mine={mine} isDemo={isDemo} />
        <div className="trade-swap" aria-hidden="true">⇄</div>
        <Side title="You get" hint="Search any card or sealed product" entries={get} setEntries={setGet} cash={getCash} setCash={setGetCash} total={inn} isDemo={isDemo} />
      </div>

      {verdict && (
        <div className={`panel trade-verdict ${verdict.cls}`}>
          <div className="trade-bar" aria-hidden="true">
            <i className="give" style={{ flexGrow: out || 0.0001 }} />
            <i className="get" style={{ flexGrow: inn || 0.0001 }} />
          </div>
          <div className="trade-bar-legend small"><span>You give {money(out)}</span><span>You get {money(inn)}</span></div>
          <h2>{verdict.title}</h2>
          <p className="small muted" style={{ margin: 0 }}>{verdict.text}</p>
          {unpriced > 0 && <p className="hint" style={{ marginBottom: 0 }}>{unpriced} {unpriced === 1 ? "card has" : "cards have"} no market value yet and {unpriced === 1 ? "counts" : "count"} as $0. Type a value on {unpriced === 1 ? "it" : "them"} to include {unpriced === 1 ? "it" : "them"}.</p>}
        </div>
      )}
      <p className="hint">Values are today&apos;s market prices for the condition or grade you pick (raw by printing and condition, slabs from recent graded sales). Nothing here changes your collection.</p>
    </>
  );
}
