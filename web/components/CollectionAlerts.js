"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { saveCollectionPrefs } from "@/app/app/collection/actions";

/** Premium: deals on cards missing from your sets, and a nudge when something you own jumps in value. */
export default function CollectionAlerts({ plan, prefs }) {
  const [p, setP] = useState(prefs);
  const [saved, setSaved] = useState(null);
  const [pending, start] = useTransition();
  const locked = !plan.collectionAlerts;

  const update = (patch) => {
    const next = { ...p, ...patch };
    setP(next);
    start(async () => { const r = await saveCollectionPrefs(next); setSaved(r.ok ? "Saved." : r.error); });
  };

  return (
    <div className={`panel coll-alerts ${locked ? "is-locked" : ""}`} style={{ marginTop: 20 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <h2 style={{ flex: "none" }}>Collection alerts</h2>
        {locked ? <Link href="/app/billing" className="btn sm primary" style={{ flex: "none" }}>Unlock with Premium</Link>
          : saved && <span className="small muted" style={{ flex: "none" }}>{pending ? "Saving…" : saved}</span>}
      </div>
      <label className="check">
        <input type="checkbox" checked={Boolean(p.setDeals)} disabled={locked} onChange={(e) => update({ setDeals: e.target.checked })} />
        <span><b>Deals on cards missing from my sets.</b> <span className="muted">When an underpriced eBay listing is a card you still need for a set you&apos;ve started (or one on your wishlist), it comes to you as a deal alert.</span></span>
      </label>
      <label className="check">
        <input type="checkbox" checked={Boolean(p.sellHigh)} disabled={locked} onChange={(e) => update({ sellHigh: e.target.checked })} />
        <span><b>Tell me when to sell high.</b> <span className="muted">When a card you own climbs</span>{" "}
          <select value={p.sellHighPct} disabled={locked || !p.sellHigh} onChange={(e) => update({ sellHighPct: Number(e.target.value) })} aria-label="Rise percent" style={{ width: "auto", padding: "2px 6px" }}>
            {[10, 15, 25, 40, 60, 100].map((n) => <option key={n} value={n}>{n}%</option>)}
          </select>{" "}
          <span className="muted">or more in a week.</span></span>
      </label>
      <p className="hint" style={{ marginBottom: 0 }}>These are delivered with your other alerts (Discord and email) once live alerts launch.</p>
    </div>
  );
}
