"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import InfoTip from "@/components/InfoTip";
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
    <div className={`panel coll-alerts ${locked ? "is-locked" : ""}`}>
      <h2>Collection alerts</h2>
      <div className="coll-alert-opts">
        <span className="coll-alert-group">
        <label className="coll-alert-opt">
          <input type="checkbox" checked={Boolean(p.setDeals)} disabled={locked} onChange={(e) => update({ setDeals: e.target.checked })} />
          <b>Deals on cards missing from my sets</b>
        </label>
        <InfoTip label="About deals on cards missing from your sets">
          When an underpriced eBay listing is a card you still need for a set you&apos;ve started (or one on your wishlist), it comes to you as a deal alert, by Discord and email with your other alerts.
        </InfoTip>
        </span>
        <span className="coll-alert-sep" aria-hidden="true" />
        <span className="coll-alert-group">
        <label className="coll-alert-opt">
          <input type="checkbox" checked={Boolean(p.sellHigh)} disabled={locked} onChange={(e) => update({ sellHigh: e.target.checked })} />
          <b>Tell me when to sell high</b>
        </label>
        <select value={p.sellHighPct} onChange={(e) => (locked ? setP({ ...p, sellHighPct: Number(e.target.value) }) : update({ sellHighPct: Number(e.target.value) }))} aria-label="Alert when a card climbs this much in a week" className="coll-alert-pct">
          {[10, 15, 25, 40, 60, 100].map((n) => <option key={n} value={n}>{n}%</option>)}
        </select>
        <InfoTip label="About sell-high alerts">
          When a card you own climbs by the percentage you picked (or more) within a week, we tell you, so you can sell while it&apos;s high. Sent by Discord and email with your other alerts.
        </InfoTip>
        </span>
      </div>
      <div className="coll-alert-end">
        {locked ? <Link href="/app/premium?from=collection-alerts" className="btn sm primary" title="Collection alerts are part of Premium">🔒 Premium</Link>
          : saved && <span className="small muted">{pending ? "Saving…" : saved}</span>}
      </div>
    </div>
  );
}
