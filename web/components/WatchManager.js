"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Sparkline from "@/components/Sparkline";
import { addWatch, editWatch, findProducts, rearmWatch, removeWatch } from "@/app/app/watches/actions";
import { PRICE_TYPES, currentPrice, isRising, targetPrice, trackingLabel } from "@/lib/watches";

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
  const now = currentPrice(product, { printing, condition, priceType });
  // Direction (buying: price drops / selling: price rises) and how (to a price / by a percent) make up the mode.
  const [rising, setRising] = useState(isRising(initial || {}));
  const [byPct, setByPct] = useState(initial?.mode === "drop" || initial?.mode === "rise");
  const mode = rising ? (byPct ? "rise" : "above") : (byPct ? "drop" : "below");
  const suggest = (up) => (now ? (up ? Math.ceil(now * 1.15) : Math.floor(now * 0.85)) : "");
  const [target, setTarget] = useState(initial?.targetPrice ?? suggest(isRising(initial || {})));
  const [dropPct, setDropPct] = useState(initial?.dropPct ?? 15);
  const ebayOk = product.type === "card" && product.language !== "japanese";
  const [alsoEbay, setAlsoEbay] = useState(ebayOk ? initial?.alsoEbay ?? true : false);
  const fires = byPct ? (now ? now * (rising ? 1 + dropPct / 100 : 1 - dropPct / 100) : null) : Number(target) || null;
  const already = fires && now ? (rising ? now >= fires : now <= fires) : false;
  const pickDirection = (up) => { if (up !== rising) { setRising(up); if (!initial) setTarget(suggest(up)); } };

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ printing, condition, priceType, mode, targetPrice: target, dropPct, alsoEbay: rising ? false : alsoEbay }); }}>
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

      <label className="field">I&apos;m</label>
      <div className="seg" role="group" aria-label="Buying or selling" style={{ marginBottom: 12 }}>
        <button type="button" className={!rising ? "on" : ""} onClick={() => pickDirection(false)}>📉 Buying: alert when it drops</button>
        <button type="button" className={rising ? "on" : ""} onClick={() => pickDirection(true)}>📈 Selling: alert when it climbs</button>
      </div>

      <label className="field">Alert me when the price</label>
      <div className="seg" role="group" aria-label="Alert type" style={{ marginBottom: 10 }}>
        <button type="button" className={!byPct ? "on" : ""} onClick={() => setByPct(false)}>{rising ? "Reaches" : "Falls to"}</button>
        <button type="button" className={byPct ? "on" : ""} onClick={() => setByPct(true)} disabled={!now}>{rising ? "Climbs by" : "Drops by"}</button>
      </div>
      {!byPct ? (
        <div style={{ maxWidth: 220 }}>
          <label className="field" htmlFor="target">Target price ($)</label>
          <input id="target" type="number" min="0.01" step="0.01" value={target} onChange={(e) => setTarget(e.target.value)} />
          <Err msg={errors?.targetPrice} />
        </div>
      ) : (
        <div>
          <div className="range-row" style={{ maxWidth: 420 }}>
            <input type="range" min={5} max={rising ? 200 : 60} step={1} value={dropPct} onChange={(e) => setDropPct(Number(e.target.value))} aria-label={rising ? "Rise percent" : "Drop percent"} />
            <output>{dropPct}%</output>
          </div>
          <Err msg={errors?.dropPct} />
        </div>
      )}
      {fires && now ? (
        <div className="hint" style={{ marginTop: 8 }}>
          Alerts at {money(fires)}
          {already ? <b style={{ color: "var(--accent)" }}> (already there today)</b>
            : `, ${Math.round(Math.abs(fires / now - 1) * 100)}% ${rising ? "above" : "below"} today's price`}.
        </div>
      ) : null}

      {!rising && (
        <>
          <label className={`check ${ebayOk ? "" : "dim"}`} style={{ marginTop: 14 }}>
            <input type="checkbox" checked={alsoEbay} disabled={!ebayOk} onChange={(e) => setAlsoEbay(e.target.checked)} />
            Also alert me when this card is listed on eBay at or below this price
          </label>
          <div className="hint" style={{ marginLeft: 27 }}>
            {ebayOk ? "Buy It Now listings of this exact card (raw), photo-checked, a few times an hour." : "eBay listing alerts cover English single cards for now."}
          </div>
        </>
      )}
      <Err msg={errors?._} />
      <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
        <button className="btn primary" disabled={pending}>{pending ? "Saving..." : submitLabel}</button>
      </div>
    </form>
  );
}

export default function WatchManager({ watches, products, plan, isDemo, owned = {}, listings = {} }) {
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
      setMessage({ kind: "good", text: res.alreadyBelow ? "Alert added. The price is already past your target today, so you'll hear from us on the next check." : "Alert added. We'll tell you when the price reaches your target." });
      setPicked(null); setResults(null); setQuery("");
      router.refresh();
    });
  }

  function save(id, input) {
    startTransition(async () => {
      const res = await editWatch(id, input);
      if (!res.ok) return setErrors(res.errors || {});
      setErrors({}); setEditing(null);
      setMessage({ kind: "good", text: "Alert updated." });
      router.refresh();
    });
  }

  function act(fn, id, text) {
    startTransition(async () => { await fn(id); setMessage({ kind: "good", text }); router.refresh(); });
  }

  return (
    <>
      {message && <div className={`notice ${message.kind}`}>{message.text}</div>}

      <div className="panel">
        <h2>Add a price alert</h2>
        {full ? (
          <div className="notice warn" style={{ marginBottom: 0 }}>
            You're using all {limit} price alerts. Remove one below to add another, or{" "}
            <Link href="/app/premium?from=watches">upgrade to Premium</Link> for unlimited alerts.
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
                      <span className="small muted" style={{ display: "block" }}>{p.setName}{p.number ? ` · ${p.number}` : ""} · {p.type === "sealed" ? "Sealed" : p.language === "japanese" ? "Japanese card" : "Card"}</span>
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
                <WatchForm key={picked.id} product={picked} onSubmit={create} submitLabel="Add alert" pending={pending} errors={errors} />
              </div>
            )}
          </>
        )}
      </div>

      <h2 style={{ fontSize: 17, margin: "24px 0 12px" }}>
        Your price alerts {limit !== null && <span className="small muted" style={{ fontWeight: 400 }}>· {watches.length} of {limit} used</span>}
      </h2>
      {watches.length === 0 ? (
        <div className="panel muted">No alerts yet. Find a card above, then choose buying or selling.</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {watches.map((w) => {
            const product = products[w.productId] || { type: w.productType, prices: {}, history: [] };
            const fires = targetPrice(w);
            const up = isRising(w);
            const gap = w.lastPrice && fires ? (up ? fires - w.lastPrice : w.lastPrice - fires) / w.lastPrice : null;
            return (
              <div className="panel" key={w.id} style={{ marginBottom: 0 }}>
                <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                  <Link href={`/app/cards/${w.productId}`} aria-label={`Open ${w.name}`}><ProductThumb product={{ ...w, type: w.productType }} /></Link>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                      <Link href={`/app/cards/${w.productId}`} style={{ flex: "none", color: "var(--text)", fontWeight: 700 }}>{w.name}</Link>
                      {owned[w.productId] ? <Link href={`/app/cards/${w.productId}`} className="badge accent" style={{ flex: "none" }}>You own {owned[w.productId]}</Link> : null}
                      <span className="badge" style={{ flex: "none" }}>{up ? "📈 Selling" : "📉 Buying"}</span>
                      {w.status === "triggered"
                        ? <span className="badge good" style={{ flex: "none" }}>{up ? "Hit your sell price" : "Hit your buy price"}</span>
                        : <span className="badge" style={{ flex: "none" }}>Watching</span>}
                      {w.alsoEbay && !up && <span className="badge accent" style={{ flex: "none" }} title="Also alerts you when it's listed on eBay at or under your price">+ eBay</span>}

                    </div>
                    <div className="small muted">{w.setName}{w.number ? ` · ${w.number}` : ""} · {trackingLabel({ type: w.productType }, w)}</div>
                    <div style={{ marginTop: 6 }}>
                      Now <b>{money(w.lastPrice)}</b> · target <b>{money(fires)}</b>
                      {w.mode === "drop" || w.mode === "rise" ? <span className="small muted"> ({w.dropPct}% {up ? "above" : "below"} {money(w.basePrice)})</span> : null}
                      {gap !== null && gap > 0 && <span className="small muted"> · {Math.round(gap * 100)}% to go</span>}
                    </div>
                  </div>
                  <Sparkline points={product.history} target={fires} />
                </div>
                {(listings[w.id] || []).length > 0 && (
                  <div className="watch-listings">
                    <div className="small muted">Listed on eBay at or under your price:</div>
                    {listings[w.id].map((l) => (
                      <a key={l.id} href={l.href} target="_blank" rel="noopener noreferrer sponsored" className="watch-listing">
                        <b>{money(l.price)}</b> <span className="small">{l.title}</span>
                        {l.photoCheck === "match" && <span className="badge good">✓ Photo checked</span>} ↗
                      </a>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <a className="btn sm" href={w.tcgplayerUrl} target="_blank" rel="noopener noreferrer sponsored">TCGplayer</a>
                  <button type="button" className="btn sm" onClick={() => { setErrors({}); setEditing(editing === w.id ? null : w.id); }}>
                    {editing === w.id ? "Close" : "Edit"}
                  </button>
                  {w.status === "triggered" && (
                    <button type="button" className="btn sm" disabled={pending} onClick={() => act(rearmWatch, w.id, "Alert re-armed.")}>Re-arm</button>
                  )}
                  <button type="button" className="btn sm danger" disabled={pending}
                    onClick={() => window.confirm(`Remove the alert for ${w.name}?`) && act(removeWatch, w.id, `Removed. You have room for another alert.`)}>
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
        TCGplayer prices update about once a day. Each alert fires once, then stays quiet until the price moves back
        past your target (or you re-arm it).
      </p>
    </>
  );
}
