"use client";

import { useState } from "react";
import { currentPrice, startingRecord } from "@/lib/watches";

const money = (v) => (v === null || v === undefined ? "—" : `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

/**
 * The simple way to set a price alert: pick one of three and go. A target price (up or down is worked out from the
 * number), a new high, or a new low, on the market price of a Near Mint copy (the member's own printing when they
 * have one). Everything else (condition, lowest listing, percent alerts, eBay on/off) lives behind onMore.
 * onCreate gets { mode, targetPrice?, printing?, condition, priceType }.
 */
export default function AlertSheet({ product, plan, owned = false, printing = null, pending = false, error = null, onCreate, onMore }) {
  const isCard = product.type === "card";
  const printings = isCard ? Object.keys(product.prices || {}) : [];
  const usePrinting = isCard ? (printings.includes(printing) ? printing : printings[0] || null) : null;
  const base = { printing: usePrinting, condition: isCard ? "Near Mint" : null, priceType: "market" };
  const now = currentPrice(product, base);
  const suggest = now ? (Math.round(now * (owned ? 1.15 : 0.85) * 100) / 100).toFixed(2) : "";
  const [choice, setChoice] = useState("price");
  const [target, setTarget] = useState(suggest);
  const t = Number(target);
  const up = now ? t > now : owned;
  const high = startingRecord(product, { ...base, mode: "high" }, now);
  const low = startingRecord(product, { ...base, mode: "low" }, now);
  const ebay = isCard && product.language !== "japanese" && plan?.ebayListingAlerts !== false;

  const submit = (e) => {
    e.preventDefault();
    if (choice === "price") onCreate({ ...base, mode: up ? "above" : "below", targetPrice: t, alsoEbay: !up && ebay });
    else onCreate({ ...base, mode: choice });
  };
  // A plain function, not a component, so the target box keeps its focus while you type.
  const option = ({ id, icon, title, sub, children }) => (
    <label className={`alert-opt ${choice === id ? "on" : ""}`}>
      <input type="radio" name="alert-kind" value={id} checked={choice === id} onChange={() => setChoice(id)} disabled={id !== "price" && !now} />
      <span className="alert-opt-icon" aria-hidden="true">{icon}</span>
      <span className="alert-opt-text">
        <b>{title}</b>
        {sub && <span className="small muted">{sub}</span>}
        {choice === id && children}
      </span>
    </label>
  );

  return (
    <form className="alert-sheet" onSubmit={submit}>
      <div className="alert-now">
        Today <b>{money(now)}</b>
        <span className="small muted"> · {isCard ? `Near Mint${usePrinting && printings.length > 1 ? `, ${usePrinting}` : ""}, ` : ""}market price</span>
      </div>
      <div className="small muted" style={{ margin: "14px 0 8px" }}>Tell me when this {isCard ? "card" : "product"}:</div>
      <div className="alert-opts" role="radiogroup" aria-label="Alert type">
        {option({ id: "price", icon: "🎯", title: "Reaches a price I pick", children: (
          <span className="alert-price">
          <span className="alert-target">
            <span className="alert-dollar">$</span>
            <input type="number" min="0.01" step="0.01" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Target price" />
          </span>
          {t > 0 && now ? (
            <span className="small muted">
              {t === now ? "That's today's price." : <>We&apos;ll tell you when it {up ? "climbs" : "drops"} to {money(t)}, {Math.round(Math.abs(t / now - 1) * 100)}% {up ? "above" : "below"} today.</>}
              {!up && ebay && plan?.ebayListingAlerts ? " We'll also watch eBay for listings at or under it." : ""}
            </span>
          ) : null}
          </span>
        ) })}
        {option({ id: "high", icon: "🚀", title: "Hits a new high",
          sub: now ? `Each time it beats the highest price we've recorded (${money(high)} now)` : "Needs a price first" })}
        {option({ id: "low", icon: "📉", title: "Hits a new low",
          sub: now ? `Each time it falls below the lowest price we've recorded (${money(low)} now)` : "Needs a price first" })}
      </div>
      {error && <div className="err" style={{ marginTop: 10 }}>{error}</div>}
      <div className="alert-foot">
        <button className="btn primary" disabled={pending || (choice === "price" && !(t > 0))}>{pending ? "Saving..." : "Set alert"}</button>
        {onMore && <button type="button" className="link-btn small" onClick={onMore}>More options</button>}
      </div>
      {plan?.maxPriceWatches !== null && plan?.maxPriceWatches !== undefined && (
        <div className="hint" style={{ marginTop: 8 }}>{plan.label} includes {plan.maxPriceWatches} price alert{plan.maxPriceWatches === 1 ? "" : "s"}.</div>
      )}
    </form>
  );
}
