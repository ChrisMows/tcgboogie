"use client";

import { useEffect, useState } from "react";

const KEY = "tcgb-hide-values";

/** Eye toggle that hides collection totals (anything marked className="sensitive"), remembered on this device. */
export default function HideValues({ className = "" }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => { setHidden(document.documentElement.classList.contains("hide-values")); }, []);
  const toggle = () => {
    const next = !hidden;
    setHidden(next);
    document.documentElement.classList.toggle("hide-values", next);
    try { localStorage.setItem(KEY, next ? "1" : "0"); } catch { /* storage blocked: works for this visit */ }
  };
  return (
    <button type="button" className={`hide-values-btn ${className}`} onClick={toggle} aria-pressed={hidden}
      title={hidden ? "Show your collection's value" : "Hide your collection's value (for screenshots or in public)"}>
      {hidden ? (
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-3.2 3.6M6.4 7.4A16.6 16.6 0 0 0 3 12s4 6 9 6a9 9 0 0 0 4.2-1M9.9 9.9a3 3 0 0 0 4.2 4.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6z" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
      )}
      <span>{hidden ? "Show value" : "Hide value"}</span>
    </button>
  );
}
