"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Sparkline from "@/components/Sparkline";
import { addWatch, editWatch, findProducts, rearmWatch, removeWatch } from "@/app/app/watches/actions";
import { PRICE_TYPES, currentPrice, targetPrice, trackingLabel } from "@/lib/watches";

const money = (v) => (v === null || v === undefined ? "—" : `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const Err = ({ msg }) => (msg ? <div className="err">{msg}</div> : null);

function ProductThumb({ product, size = 56 }) {
  return product.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={product.image} alt="" width={size} height={size} style={{ borderRadius: 8, objectFit: "contain", background: "#fff1", flex: "none" }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: 8, background: "var(--panel-3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--muted)", flex: "none" }}>
      {product.type === "sealed" ? "Sealed" : "Card"}
    </div>
  );
}

function WatchForm({ product, initial, onSubmit, submitLabel, pending, errors }) {
  const printings = product.type === "card" ? Object.keys(product.prices || {}) : [];
  const [printing, setPrinting] = useState(initial?.printing || printings[0] || null);
  const conditions = product.type === "card" ? Object.keys(product.prices?.[printing] || {}) : [];
  const [condition, setCondition] = useState(initial?.condition || (conditions.includes("Near Mint") ? "Near Mint" : conditions[0]));
  const [priceType, setPriceType] = useState(initial?.priceType || "market");
  const [mode, setMode] = useState(initial?.mode || "below");
  const now = currentPrice(product, { printing, condition, priceType });
  const [target, setTarget] = useState(initial?.targetPrice ?? (now ? Math.floor(now * 0.85) : ""));
  const [dropPct, setDropPct] = useState(initial?.dropPct ?? 15);
  const [alsoEbay, setAlsoEbay] = useState(product.type === "card" ? initial?.alsoEbay ?? true : false);
  const fires = mode === "drop" ? (now ? now * (1 - dropPct / 100) : null) : Number(target) || null;

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ printing, condition, priceType, mode, targetPrice: target, dropPct, alsoEbay }); }}>
      {product.type === "card" && (
        <div className="row" style={{ marginBottom: 14 }}>
          <div>
            <label className="field" htmlFor="printing">Printing</label>
            <select id="printing" value={printing || ""} onChange={(e) => setPrinting(e.target.value)}>
              {printings.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="field" htmlFor="condition">Condition</label>
            <select id="condition" value={condition || ""} onChange={(e) => setCondition(e.target.value)}>
              {conditions.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
      )}
      <Err msg={errors?.printing} />

      <label className="field">Which price</label>
      <div className="seg" role="group" aria-label="Which price" style={{ marginBottom: 6 }}>
        {Object.entries(PRICE_TYPES).map(([k, v]) => (
          <button key={k} type="button" className={priceType === k ? "on" : ""} onClick={() => setPriceType(k)}
            disabled={currentPrice(product, { printing, condition, priceType: k }) === null}>
            {v.label}
          </button>
        ))}
      </div>
      <div className="hint" style={{ marginBottom: 14 }}>{PRICE_TYPES[priceType].hint} Right now: <b>{money(now)}</b></div>

      <label className="field">Alert me when the price</label>
      <div className="seg" role="group" aria-label="Alert type" style={{ marginBottom: 10 }}>
        <button type="button" className={mode === "below" ? "on" : ""} onClick={() => setMode("below")}>Is at or below</button>
        <button type="button" className={mode === "drop" ? "on" : ""} onClick={() => setMode("drop")} disabled={!now}>Drops by</button>
      </div>
      {mode === "below" ? (
        <div style={{ maxWidth: 220 }}>
          <label className="field" htmlFor="target">Target price ($)</label>
          <input id="target" type="number" min="0.01" step="0.01" value={target} onChange={(e) => setTarget(e.target.value)} />
          <Err msg={errors?.targetPrice} />
        </div>
      ) : (
        <div>
          <div className="range-row" style={{ maxWidth: 420 }}>
            <input type="range" min={5} max={60} step={1} value={dropPct} onChange={(e) => setDropPct(Number(e.target.value))} aria-label="Drop percent" />
            <output>{dropPct}%</output>
          </div>
          <Err msg={errors?.dropPct} />
        </div>
      )}
      {fires && now ? (
        <div className="hint" style={{ marginTop: 8 }}>
          Alerts at {money(fires)}{fires >= now ? <b style={{ color: "var(--good)" }}> (already there today)</b> : `, ${Math.round((1 - fires / now) * 100)}% below today's price`}.
        </div>
      ) : null}

      <label className={`check ${product.type === "card" ? "" : "dim"}`} style={{ marginTop: 14 }}>
        <input type="checkbox" checked={alsoEbay} disabled={product.type !== "card"} onChange={(e) => setAlsoEbay(e.target.checked)} />
        Also alert me when this card is listed on eBay at or below this price
      </label>
      <div className="hint" style={{ marginLeft: 27 }}>
        {product.type === "card" ? "eBay listings are checked live, around the clock." : "eBay listing alerts cover single cards for now."}
      </div>
      <Err msg={errors?._} />
      <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
        <button className="btn primary" disabled={pending}>{pending ? "Saving..." : submitLabel}</button>
      </div>
    </form>
  );
}

export default function WatchManager({ watches, products, plan, isDemo }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [findError, setFindError] = useState(null);
  const [picked, setPicked] = useState(null);
  const [errors, setErrors] = useState({});
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  const limit = plan.maxPriceWatches;
  const full = limit !== null && watches.length >= limit;

  function search(e) {
    e.preventDefault();
    setFindError(null);
    setPicked(null);
    startTransition(async () => {
      const res = await findProducts(query);
      if (!res.ok) { setResults(null); setFindError(res.error); return; }
      setResults(res.results);
      if (res.results.length === 1) setPicked(res.results[0]);
    });
  }

  function create(input) {
    startTransition(async () => {
      const res = await addWatch(picked.id, input);
      if (!res.ok) return setErrors(res.errors || {});
      setErrors({});
      setMessage({ kind: "good", text: res.alreadyBelow ? "Watch added. It's already at or below your target today, so you'll get an alert on the next check." : "Watch added. We'll alert you when the price reaches your target." });
      setPicked(null); setResults(null); setQuery("");
      router.refresh();
    });
  }

  function save(id, input) {
    startTransition(async () => {
      const res = await editWatch(id, input);
      if (!res.ok) return setErrors(res.errors || {});
      setErrors({}); setEditing(null);
      setMessage({ kind: "good", text: "Watch updated." });
      router.refresh();
    });
  }

  function act(fn, id, text) {
    startTransition(async () => { await fn(id); setMessage({ kind: "good", text }); router.refresh(); });
  }

  return (
    <>
      <div className="stats">
        <div className="stat"><b>{watches.length}{limit !== null ? ` / ${limit}` : ""}</b><span>price watches {limit === null ? "(unlimited)" : "used"}</span></div>
        <div className="stat"><b>{watches.filter((w) => w.status === "triggered").length}</b><span>at or below target</span></div>
        <div className="stat"><b>{watches.filter((w) => w.alsoEbay).length}</b><span>also watching eBay</span></div>
        <div className="stat"><b>{plan.watchAlertChannels.includes("discord") ? "Discord + email" : "Email"}</b><span>where alerts go</span></div>
      </div>
      {message && <div className={`notice ${message.kind}`}>{message.text}</div>}

      <div className="panel">
        <h2>Add a price watch</h2>
        {full ? (
          <div className="notice warn" style={{ marginBottom: 0 }}>
            You're using all {limit} price watches. Remove one below to add another, or{" "}
            <Link href="/app/billing">upgrade to Premium</Link> for unlimited watches.
          </div>
        ) : (
          <>
            <form onSubmit={search} className="row" style={{ alignItems: "flex-start" }}>
              <div>
                <label className="sr-only" htmlFor="q">TCGplayer link or card name</label>
                <input id="q" type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Paste a TCGplayer link, or search: Umbreon VMAX Evolving Skies" />
                <div className="hint">
                  {isDemo ? "Demo: try “Charizard”, “Umbreon”, “Evolving Skies”, or https://www.tcgplayer.com/product/517045" : "Cards and sealed products. Prices come from TCGplayer and update about once a day."}
                </div>
              </div>
              <button className="btn" style={{ flex: "none" }} disabled={pending || query.trim().length < 2}>Find</button>
            </form>
            {findError && <div className="notice bad" style={{ marginTop: 12 }}>{findError}</div>}
            {results && results.length > 1 && !picked && (
              <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
                {results.map((p) => (
                  <button key={p.id} type="button" className="deal" style={{ display: "flex", gap: 12, alignItems: "center", cursor: "pointer", font: "inherit", color: "inherit" }}
                    onClick={() => setPicked(p)}>
                    <ProductThumb product={p} size={44} />
                    <span style={{ textAlign: "left" }}>
                      <b>{p.name}</b>
                      <span className="small muted" style={{ display: "block" }}>{p.setName}{p.number ? ` · ${p.number}` : ""} · {p.type === "sealed" ? "Sealed" : "Card"}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {picked && (
              <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
                  <ProductThumb product={picked} size={72} />
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <b>{picked.name}</b>
                    <div className="small muted">{picked.setName}{picked.number ? ` · ${picked.number}` : ""} · <a href={picked.tcgplayerUrl} target="_blank" rel="noopener noreferrer">View on TCGplayer</a></div>
                  </div>
                  <Sparkline points={picked.history} width={180} />
                  <button type="button" className="btn ghost sm" onClick={() => setPicked(null)}>Change</button>
                </div>
                <WatchForm key={picked.id} product={picked} onSubmit={create} submitLabel="Add watch" pending={pending} errors={errors} />
              </div>
            )}
          </>
        )}
      </div>

      <h2 style={{ fontSize: 17, margin: "24px 0 12px" }}>Your price watches</h2>
      {watches.length === 0 ? (
        <div className="panel muted">No watches yet. Add a card or sealed product above.</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {watches.map((w) => {
            const product = products[w.productId] || { type: w.productType, prices: {}, history: [] };
            const fires = targetPrice(w);
            const gap = w.lastPrice && fires ? (w.lastPrice - fires) / w.lastPrice : null;
            return (
              <div className="panel" key={w.id} style={{ marginBottom: 0 }}>
                <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                  <ProductThumb product={{ ...w, type: w.productType }} />
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                      <b style={{ flex: "none" }}>{w.name}</b>
                      {w.status === "triggered" ? <span className="badge good" style={{ flex: "none" }}>At or below target</span> : <span className="badge" style={{ flex: "none" }}>Watching</span>}
                      {w.alsoEbay && <span className="badge accent" style={{ flex: "none" }}>+ eBay</span>}
                    </div>
                    <div className="small muted">{w.setName}{w.number ? ` · ${w.number}` : ""} · {trackingLabel({ type: w.productType }, w)}</div>
                    <div style={{ marginTop: 6 }}>
                      Now <b>{money(w.lastPrice)}</b> · target <b>{money(fires)}</b>
                      {w.mode === "drop" ? <span className="small muted"> ({w.dropPct}% below {money(w.basePrice)})</span> : null}
                      {gap !== null && gap > 0 && <span className="small muted"> · {Math.round(gap * 100)}% to go</span>}
                    </div>
                  </div>
                  <Sparkline points={product.history} target={fires} />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <a className="btn sm" href={w.tcgplayerUrl} target="_blank" rel="noopener noreferrer sponsored">TCGplayer</a>
                  <button type="button" className="btn sm" onClick={() => { setErrors({}); setEditing(editing === w.id ? null : w.id); }}>
                    {editing === w.id ? "Close" : "Edit"}
                  </button>
                  {w.status === "triggered" && (
                    <button type="button" className="btn sm" disabled={pending} onClick={() => act(rearmWatch, w.id, "Watch re-armed.")}>Re-arm</button>
                  )}
                  <button type="button" className="btn sm danger" disabled={pending}
                    onClick={() => window.confirm(`Stop watching ${w.name}?`) && act(removeWatch, w.id, `Removed. You have a free slot for another watch.`)}>
                    Remove
                  </button>
                </div>
                {editing === w.id && products[w.productId] && (
                  <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                    <WatchForm product={products[w.productId]} initial={w} onSubmit={(input) => save(w.id, input)} submitLabel="Save changes" pending={pending} errors={errors} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="hint" style={{ marginTop: 16 }}>
        TCGplayer prices update about once a day, so price watches are best for tracking trends. After an alert, a watch
        stays quiet until the price climbs back above your target (or you re-arm it). Links to TCGplayer may earn us a
        commission.
      </p>
    </>
  );
}
