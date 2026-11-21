"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { eraSlug, setLabel } from "@/lib/sets";

const ERAS = ["Mega Evolution", "Scarlet & Violet", "Sword & Shield", "Sun & Moon", "XY", "Black & White", "Classic (Base to Gym)"];
const month = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "");

/**
 * The header's Sets item, like TCGplayer's: hover (or tap) to see the newest sets and jump into one, pick an era, or
 * open every set (/sets). Clicking "Sets" itself opens /sets.
 */
export default function SetsMenu({ sets }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const closeTimer = useRef(null);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  // A short delay before closing, so moving the mouse from "Sets" down into the menu doesn't close it.
  const show = () => { clearTimeout(closeTimer.current); setOpen(true); };
  const hide = () => { clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setOpen(false), 160); };

  return (
    <span ref={box} className={`sets-menu ${open ? "open" : ""}`} onMouseEnter={show} onMouseLeave={hide} onFocus={show}>
      <Link href="/sets" aria-haspopup="true" aria-expanded={open}>Sets <span className="sets-caret" aria-hidden="true">▾</span></Link>
      {open && (
        <div className="sets-pop" role="menu">
          <div className="sets-pop-main">
            <div className="sets-pop-head">Newest sets</div>
            {sets.length ? (
              <div className="sets-pop-grid">
                {sets.map((s) => {
                  const { name, code } = setLabel(s.name);
                  return (
                    <Link key={s.id} role="menuitem" href={`/sets/${encodeURIComponent(s.name)}`} className="sets-pop-set" onClick={() => setOpen(false)}>
                      {s.image
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={s.image} alt="" loading="lazy" />
                        : <span className="sets-pop-ph">{name.split(/\s+/).map((w) => w[0]).join("").slice(0, 3)}</span>}
                      <span><b>{name}</b><span className="small muted">{[code, month(s.releaseDate)].filter(Boolean).join(" · ")}</span></span>
                    </Link>
                  );
                })}
              </div>
            ) : <p className="small muted" style={{ margin: 0 }}>The set list is loading. Open All sets to browse.</p>}
          </div>
          <div className="sets-pop-side">
            <div className="sets-pop-head">By era</div>
            {ERAS.map((e) => <Link key={e} role="menuitem" href={`/sets?era=${eraSlug(e)}`} onClick={() => setOpen(false)}>{e}</Link>)}
            <Link role="menuitem" href="/sets" className="sets-pop-all" onClick={() => setOpen(false)}>All sets →</Link>
          </div>
        </div>
      )}
    </span>
  );
}
