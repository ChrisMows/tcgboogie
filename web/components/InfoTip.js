"use client";

import { useEffect, useRef, useState } from "react";

/** A small ⓘ button that shows a note on hover, focus or tap (tap again or tap elsewhere to close). */
export default function InfoTip({ children, label = "More info" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <span ref={ref} className={`info-tip ${open ? "open" : ""}`}>
      <button type="button" className="info-tip-btn" aria-label={label} aria-expanded={open}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}>i</button>
      <span className="info-tip-pop" role="tooltip">{children}</span>
    </span>
  );
}
