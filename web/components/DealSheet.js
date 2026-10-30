"use client";

import Link from "next/link";
import { useState } from "react";

const money = (v) => (v === null || v === undefined ? "—" : `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

/**
 * The simple way to get deal alerts on one card (the lightning on a card page): three quick choices, then "Create
 * deal alert". Choices below the plan's floors are locked; "More options" opens the full filter page.
 * onCreate gets { types: "raw" | "graded" | "both", pct, minutes }.
 */
export default function DealSheet({ product, plan, price, moreHref, pending = false, error = null, onCreate }) {
  const [types, setTypes] = useState("both");
  const pcts = [20, 30, 40];
  const mins = [5, 10, 20];
  const [pct, setPct] = useState(Math.max(30, plan.minDiscountFloor));
  const [minutes, setMinutes] = useState(Math.min(10, plan.maxWindowMinutes));
  const cheap = price && price < plan.minValueFloor;

  const Seg = ({ label, options, value, set, locked, fmt }) => (
    <div className="deal-q">
      <span className="small muted">{label}</span>
      <div className="seg">
        {options.map((o) => (
          <button key={o} type="button" className={value === o ? "on" : ""} disabled={locked(o)} title={locked(o) ? "Premium" : undefined}
            onClick={() => set(o)}>{fmt(o)}{locked(o) ? " 🔒" : ""}</button>
        ))}
      </div>
    </div>
  );

  return (
    <form className="alert-sheet" onSubmit={(e) => { e.preventDefault(); onCreate({ types, pct, minutes }); }}>
      <div className="alert-now">
        Market <b>{money(price)}</b><span className="small muted"> · we watch eBay auctions for this card</span>
      </div>
      <div className="deal-qs">
        {Seg({ label: "Copies", options: ["raw", "graded", "both"], value: types, set: setTypes, locked: () => false,
          fmt: (o) => ({ raw: "Raw", graded: "Graded", both: "Both" })[o] })}
        {Seg({ label: "At least this far under market", options: pcts, value: pct, set: setPct, locked: (o) => o < plan.minDiscountFloor, fmt: (o) => `${o}%` })}
        {Seg({ label: "Tell me when the auction ends within", options: mins, value: minutes, set: setMinutes, locked: (o) => o > plan.maxWindowMinutes, fmt: (o) => `${o} min` })}
      </div>
      {cheap && <div className="hint" style={{ marginTop: 8 }}>Deals cover cards worth ${plan.minValueFloor} or more, so a card at {money(price)} may not turn up.</div>}
      {error && <div className="err" style={{ marginTop: 10 }}>{error}</div>}
      <div className="alert-foot">
        <button className="btn primary" disabled={pending}>{pending ? "Saving..." : "Create deal alert"}</button>
        <Link href={moreHref} className="link-btn small">More options</Link>
      </div>
      {(plan.minDiscountFloor > 20 || plan.maxWindowMinutes < 20) && (
        <div className="hint" style={{ marginTop: 8 }}>Premium goes down to 20% under market and up to 20 minutes before the end.</div>
      )}
    </form>
  );
}
