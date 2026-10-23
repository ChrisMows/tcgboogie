"use client";

import { useEffect, useState } from "react";

const OFF_KEY = "tcgb-reveal-off";

/** Settings: the pack opening when a card is added (kept on this device, like Hide values). */
export default function RevealSetting() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    try { setOn(localStorage.getItem(OFF_KEY) !== "1"); } catch { /* storage blocked: stays on */ }
  }, []);
  const change = (v) => {
    setOn(v);
    try { if (v) localStorage.removeItem(OFF_KEY); else localStorage.setItem(OFF_KEY, "1"); } catch { /* ignore */ }
  };
  return (
    <label className="check" style={{ marginTop: 14 }}>
      <input type="checkbox" checked={on} onChange={(e) => change(e.target.checked)} />
      <span>✨ Pack opening when I add a card <span className="muted small">· on this device</span></span>
    </label>
  );
}
