"use client";

import { useState } from "react";

// Profile's tabs (Showcase / Settings / Support), kept in the address (?tab=settings) so a link can open one.
// tabs: [[key, label]], panes: { key: content }.
export default function ProfileTabs({ initial, tabs, panes }) {
  const [tab, setTab] = useState(initial);
  const go = (next) => {
    setTab(next);
    try {
      const u = new URL(window.location.href);
      if (next === tabs[0][0]) u.searchParams.delete("tab"); else u.searchParams.set("tab", next);
      window.history.replaceState(window.history.state, "", u);
    } catch { /* fine */ }
  };
  return (
    <>
      <div className="prof-tabs" role="tablist" aria-label="Profile">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "on" : ""} onClick={() => go(key)}>{label}</button>
        ))}
      </div>
      <div role="tabpanel" className="prof-pane">{panes[tab]}</div>
    </>
  );
}
