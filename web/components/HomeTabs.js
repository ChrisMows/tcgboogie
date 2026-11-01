"use client";

import Link from "next/link";
import { useRef, useState } from "react";

// Home's two views, Overview and Performance, as tabs at the top. Switching slides the new view in (a swipe left or
// right on a phone does too). The collection value sits above Overview; Performance's chart shows it there. Performance
// is Premium: for Free members it slides in blurred, with an invitation to Premium in front of it. The view is kept in
// the address (?view=performance).
export default function HomeTabs({ initial = "overview", locked, header, overview, performance }) {
  const [tab, setTab] = useState(initial);
  const [dir, setDir] = useState(0);
  const touch = useRef(null);

  const go = (next) => {
    if (next === tab) return;
    setDir(next === "performance" ? 1 : -1);
    setTab(next);
    try {
      const u = new URL(window.location.href);
      if (next === "performance") u.searchParams.set("view", "performance"); else u.searchParams.delete("view");
      window.history.replaceState(window.history.state, "", u);
    } catch { /* fine */ }
  };
  // A sideways swipe, not a scroll; rows that scroll sideways themselves (the market) keep their own swipes.
  const onTouchStart = (e) => {
    touch.current = e.target.closest(".home-market, .value-chart, .coll-chart") ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current.x, dy = e.changedTouches[0].clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) go(dx < 0 ? "performance" : "overview");
  };

  return (
    <>
      <div className="home-tabs" role="tablist" aria-label="Home views">
        <button type="button" role="tab" aria-selected={tab === "overview"} className={tab === "overview" ? "on" : ""} onClick={() => go("overview")}>Overview</button>
        <button type="button" role="tab" aria-selected={tab === "performance"} className={tab === "performance" ? "on" : ""} onClick={() => go("performance")}>
          Performance{locked && <span className="home-pro">PREMIUM</span>}
        </button>
      </div>
      {/* Performance opens on its own chart, which shows the value; locked, the value stays above the blurred view. */}
      {(tab === "overview" || locked) && header}
      <div key={tab} className="home-pane" data-dir={dir} role="tabpanel" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {tab === "overview" ? overview : locked ? (
          <div className="home-locked">
            <div className="home-locked-view" aria-hidden="true" inert>{performance}</div>
            <div className="panel home-upsell" role="dialog" aria-label="Performance is part of Premium">
              <span className="home-pro">PREMIUM</span>
              <h2>See how your collection performs</h2>
              <ul className="small">
                <li>Your value chart for all time, with what you paid</li>
                <li>Profit on every card, and your best and worst buys</li>
                <li>Returns for a day, a week, a month, a year</li>
              </ul>
              <Link href="/app/premium?from=performance" className="btn primary block">Try Premium</Link>
              <button type="button" className="link-btn small" onClick={() => go("overview")}>Back to Overview</button>
            </div>
          </div>
        ) : performance}
      </div>
    </>
  );
}
