"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/** A Premium-only button for Free members: explains what it does and offers the upgrade, instead of jumping away. */
export default function LockedButton({ label, title, children, upgrade = "feature" }) {
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
    <span ref={ref} className="locked-wrap">
      <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{label} 🔒</button>
      {open && (
        <span className="locked-pop" role="dialog" aria-label={title}>
          <b>{title}</b>
          <span className="small muted">{children}</span>
          <Link href={`/app/premium?from=${encodeURIComponent(upgrade)}`} className="btn sm primary">See Premium</Link>
        </span>
      )}
    </span>
  );
}
