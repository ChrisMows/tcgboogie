"use client";

import { useId, useRef } from "react";
import Link from "next/link";

// "Compare plans": Free and Premium side by side in a pop-up, grouped by area, with what Premium adds highlighted.
// The rows come from lib/plan-copy.js planGroups (the plans as Admin → Plans left them), passed in by the page.
// A native <dialog>: Esc closes it, focus stays inside, and a click on the dimmed backdrop closes it too.
const mark = (v) => (v === "✓" ? <span className="cmp-yes" aria-label="Included">✓</span> : v === "—" ? <span className="cmp-no" aria-label="Not included">—</span> : v);

export default function ComparePlans({ groups, free, premium, trial = 0, signedIn = false, label = "Compare plans", className = "btn" }) {
  const ref = useRef(null);
  const titleId = useId(); // the page can have more than one (hero and pricing)
  const close = () => ref.current?.close();
  const upgrade = signedIn ? "/app/premium?from=compare" : "/login?mode=signup&plan=premium";
  const start = signedIn ? "/app/collection" : "/login?mode=signup";
  const cta = trial > 0 ? `Try Premium free for ${trial} days` : "Get Premium";
  const Head = () => (
    <div className="cmp-head">
      <span />
      <div className="cmp-plan"><b>{free.label}</b><span className="cmp-price">$0</span><Link href={start} className="btn sm block" onClick={close}>{signedIn ? "Go to my collection" : "Start free"}</Link></div>
      <div className="cmp-plan featured"><b>{premium.label}</b><span className="cmp-price">${premium.price}<small>/mo</small></span><Link href={upgrade} className="btn sm primary block" onClick={close}>{cta}</Link></div>
    </div>
  );
  return (
    <>
      <button type="button" className={className} onClick={() => ref.current?.showModal()}>{label}</button>
      <dialog ref={ref} className="cmp-dialog" aria-labelledby={titleId} onClick={(e) => { if (e.target === ref.current) close(); }}>
        <div className="cmp-inner">
          <div className="cmp-top">
            <div>
              <h2 id={titleId}>Compare plans</h2>
              <p className="muted" style={{ margin: 0 }}>Everything in Free is in Premium too. <span className="cmp-key">Highlighted</span> rows are what Premium adds.</p>
            </div>
            <button type="button" className="cmp-close" onClick={close} aria-label="Close">✕</button>
          </div>
          <Head />
          {groups.map((g) => (
            <section key={g.group} className="cmp-group">
              <h3>{g.group}</h3>
              {g.rows.map(([what, a, b]) => (
                <div key={what} className={`cmp-row${a !== b ? " diff" : ""}`}>
                  <span className="cmp-what">{what}</span>
                  <span className="cmp-cell" data-plan={free.label}>{mark(a)}</span>
                  <span className="cmp-cell premium" data-plan={premium.label}>{mark(b)}</span>
                </div>
              ))}
            </section>
          ))}
          <div className="cmp-foot">
            <Link href={upgrade} className="btn primary" onClick={close}>{cta}</Link>
            <span className="small muted">
              {trial > 0 ? `$0 today, card required. Cancel before day ${trial} and you pay nothing.` : "Cancel anytime."} Plus applicable sales tax.
            </span>
          </div>
        </div>
      </dialog>
    </>
  );
}
