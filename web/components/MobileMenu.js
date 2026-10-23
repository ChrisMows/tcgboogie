"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Phones and narrow windows: the header's links (hidden there to make room) behind a ☰ button, plus Log in and
 * Get started for visitors. Closes on a tap outside, Escape, or when a page opens.
 */
export default function MobileMenu({ links, signedIn }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const path = usePathname();

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div className="mobile-menu" ref={box}>
      <button type="button" className="mobile-menu-btn" aria-expanded={open} aria-controls="mobile-menu-list"
        aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">{open ? "✕" : "☰"}</span>
      </button>
      {open && (
        <nav id="mobile-menu-list" className="mobile-menu-list" aria-label="Menu">
          {links.map((l) => <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>{l.label}</Link>)}
          {!signedIn && (
            <div className="mobile-menu-auth">
              <Link href="/login" className="btn" onClick={() => setOpen(false)}>Log in</Link>
              <Link href="/login?mode=signup" className="btn primary" onClick={() => setOpen(false)}>Get started free</Link>
            </div>
          )}
        </nav>
      )}
    </div>
  );
}
