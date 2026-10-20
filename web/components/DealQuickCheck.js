"use client";

import { useEffect, useState } from "react";

/**
 * Shown when a member arrives from a deal alert: the deal at a glance and one button that opens the listing AND the
 * recent sold listings. Browsers allow one new tab per tap, so the listing opens in a new tab and this tab moves to
 * the sold listings. Both links carry the affiliate tracking (built on the server).
 */
export default function DealQuickCheck({ deal: d, listingHref, soldHref, affiliate }) {
  const [open, setOpen] = useState(true);
  const close = () => {
    setOpen(false);
    // Don't pop up again on refresh or when coming back.
    const u = new URL(window.location.href);
    u.searchParams.delete("from");
    window.history.replaceState(null, "", u.toString());
  };
  useEffect(() => {
    if (!open) return;
    const esc = (e) => e.key === "Escape" && close();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;

  const money = (v) => `$${Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const grade = d.kind === "raw" ? `Raw ${d.condition}` : `${d.grader} ${d.grade}`;
  const both = () => {
    window.open(listingHref, "_blank", "noopener");
    window.location.href = soldHref;
  };
  const rel = `noopener noreferrer${affiliate ? " sponsored" : ""}`;

  return (
    <div className="dq-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="dq-modal" role="dialog" aria-modal="true" aria-labelledby="dq-title">
        <button type="button" className="dq-x" aria-label="Close" onClick={close}>✕</button>
        <div className="dq-head">
          <span className="badge accent">⚡ Live deal</span>
          {d.photoCheck === "match" && <span className="badge good">✓ Photo checked</span>}
        </div>
        <h2 id="dq-title">{d.name}</h2>
        <div className="small muted">{d.setName}{d.number ? ` · ${d.number}` : ""} · {grade}{d.language === "japanese" ? " · Japanese" : ""}</div>
        <div className="dq-price">
          <b>{money(d.total)}</b>
          <span className="dq-off">{Math.round(d.discountPct)}% below {money(d.marketValue)}</span>
        </div>
        <div className="dq-time">◷ About {d.minutesLeft} min left</div>
        {d.flags?.length > 0 && <ul className="dq-flags">{d.flags.map((f) => <li key={f}>⚠ {f}</li>)}</ul>}
        <button type="button" className="btn primary dq-main" onClick={both}>Open listing + recent sales</button>
        <p className="hint" style={{ margin: "6px 0 12px", textAlign: "center" }}>
          The listing opens in a new tab; this tab shows recent sold {grade} copies on eBay.
        </p>
        <div className="dq-alt">
          <a className="btn" href={listingHref} target="_blank" rel={rel} onClick={close}>Just the listing ↗</a>
          <button type="button" className="btn ghost" onClick={close}>Stay on this page</button>
        </div>
        {affiliate && <p className="hint" style={{ margin: "10px 0 0", textAlign: "center" }}>eBay links may earn us a commission.</p>}
      </div>
    </div>
  );
}
