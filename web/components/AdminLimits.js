"use client";

import { useState } from "react";
import { saveLimitChoices } from "@/app/app/admin/actions";

/**
 * Admin → Plans: the number limits for Free and Premium (filters, cards per filter, price alerts, monthly photo and
 * listing allowances, deal floors). "Unlimited" where it makes sense. Nothing changes until Save; then the pricing
 * sheet, lock screens and alerts follow within about a minute.
 */
export default function AdminLimits({ limits, values, saved }) {
  const [state, setState] = useState(values);
  const [dirty, setDirty] = useState(false);
  const set = (tier, key, v) => {
    setDirty(true);
    setState((s) => ({ ...s, [tier]: { ...s[tier], [key]: v } }));
  };
  const groups = [...new Set(limits.map((l) => l.group))];

  const Cell = ({ tier, l }) => {
    if (l.premiumOnly && tier === "free") return <div className="limit-cell small muted">—</div>;
    const v = state[tier][l.key];
    const unlimited = v === null;
    return (
      <div className="limit-cell">
        <input type="number" name={`${l.key}:${tier}`} min={l.min} max={l.max} step="1" disabled={unlimited}
          value={unlimited ? "" : v ?? ""} onChange={(e) => set(tier, l.key, e.target.value === "" ? "" : Number(e.target.value))}
          aria-label={`${l.label}: ${tier === "free" ? "Free" : "Premium"}`} />
        {unlimited && <input type="hidden" name={`${l.key}:${tier}`} value="unlimited" />}
        {l.unlimited && (
          <label className="small limit-unl">
            <input type="checkbox" checked={unlimited} onChange={(e) => set(tier, l.key, e.target.checked ? null : l.min)} /> Unlimited
          </label>
        )}
      </div>
    );
  };

  return (
    <form action={saveLimitChoices}>
      {saved !== undefined && !dirty && (
        <div className="notice good">{Number(saved) ? `Saved ${saved} ${Number(saved) === 1 ? "change" : "changes"}. The pricing sheet and members follow within about a minute.` : "Saved. Nothing had changed."}</div>
      )}
      <p className="small muted" style={{ marginTop: 0 }}>
        How much of each feature a plan includes. Changes reach the pricing sheet, the Premium page, lock screens and alerts
        within about a minute, with no code change. Members over a new limit keep what they have but can&apos;t add more.
      </p>
      {groups.map((g) => (
        <div key={g} className="panel feat-group">
          <div className="feat-row feat-head"><h2>{g}</h2><span>Free</span><span>Premium</span></div>
          {limits.filter((l) => l.group === g).map((l) => (
            <div key={l.key} className="feat-row limit-row">
              <div className="feat-name">
                <b>{l.label}</b>
                {(l.help || l.unit) && <span className="small muted">{[l.unit, l.help].filter(Boolean).join(" · ")}</span>}
              </div>
              <Cell tier="free" l={l} />
              <Cell tier="premium" l={l} />
            </div>
          ))}
        </div>
      ))}
      <div className="feat-save">
        <button className="btn primary" disabled={!dirty}>Save limits</button>
        {dirty && <button type="button" className="btn ghost" onClick={() => { setState(values); setDirty(false); }}>Undo</button>}
      </div>
    </form>
  );
}
