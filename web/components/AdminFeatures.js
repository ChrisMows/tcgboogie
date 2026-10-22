"use client";

import { useState } from "react";
import { saveFeatureChoices } from "@/app/app/admin/actions";

/**
 * Admin → Features: one row per feature, a Free and a Premium box. Free on means Premium on too (that box locks).
 * Nothing changes until Save; then every page and alert follows the new choices within about a minute.
 */
export default function AdminFeatures({ features, choices, saved }) {
  const [state, setState] = useState(choices);
  const [dirty, setDirty] = useState(false);
  const set = (key, plan, on) => {
    setDirty(true);
    setState((s) => {
      const cur = s[key];
      const next = plan === "free" ? { free: on, premium: on || cur.premium } : { ...cur, premium: on };
      return { ...s, [key]: next };
    });
  };
  const groups = [...new Set(features.map((f) => f.group))];

  return (
    <form action={saveFeatureChoices}>
      {saved !== undefined && !dirty && (
        <div className="notice good">{Number(saved) ? `Saved ${saved} ${Number(saved) === 1 ? "change" : "changes"}. Members see it within about a minute.` : "Saved. Nothing had changed."}</div>
      )}
      <p className="small muted" style={{ marginTop: 0 }}>
        Tick who gets each feature. Ticking <b>Free</b> also gives it to Premium. Untick both to switch a feature off for everyone.
        Members who lose a feature see a short “part of Premium” note instead. Every change is written to the Admin log.
      </p>
      {groups.map((g) => (
        <div key={g} className="panel feat-group">
          <div className="feat-row feat-head">
            <h2>{g}</h2>
            <span>Free</span>
            <span>Premium</span>
          </div>
          {features.filter((f) => f.group === g).map((f) => {
            const c = state[f.key];
            return (
              <div key={f.key} className="feat-row">
                <div className="feat-name">
                  <b>{f.label}</b>
                  {f.help && <span className="small muted">{f.help}</span>}
                </div>
                <label className="feat-box" aria-label={`${f.label}: Free`}>
                  <input type="checkbox" name={`${f.key}:free`} checked={c.free} onChange={(e) => set(f.key, "free", e.target.checked)} />
                </label>
                <label className="feat-box" aria-label={`${f.label}: Premium`} title={c.free ? "On for Free, so always on for Premium" : undefined}>
                  <input type="checkbox" checked={c.premium} disabled={c.free} onChange={(e) => set(f.key, "premium", e.target.checked)} />
                  {/* a disabled box isn't sent with the form, so send its value here */}
                  {c.premium && <input type="hidden" name={`${f.key}:premium`} value="on" />}
                </label>
              </div>
            );
          })}
        </div>
      ))}
      <div className="feat-save">
        <button className="btn primary" disabled={!dirty}>Save changes</button>
        {dirty && <button type="button" className="btn ghost" onClick={() => { setState(choices); setDirty(false); }}>Undo</button>}
      </div>
    </form>
  );
}
