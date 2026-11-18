"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { repairPicture } from "@/app/app/actions";
import { InstallButton } from "@/components/InstallApp";

const ITEMS = [
  ["/app/home", "Home"],
  ["/app/profile", "Profile"],
  ["/app/collection", "Collection"],
  ["/app/account", "Settings"],
  ["/app/account#plan", "Plan & billing"],
];

/** Round profile picture in the header; opens a menu with the member's pages and Sign out. */
export default function UserMenu({ name, email, avatarUrl, initials, planLabel, isAdmin, onLogOut }) {
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  useEffect(() => { if (!open) setConfirmOut(false); }, [open]);
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

  // If the saved picture stops loading (e.g. it was changed on Discord), try once to fetch the current one.
  const [url, setUrl] = useState(avatarUrl);
  useEffect(() => { setUrl(avatarUrl); setBroken(false); }, [avatarUrl]);
  async function onImgError() {
    setBroken(true);
    try {
      if (sessionStorage.getItem("tcg-avatar-repair") === avatarUrl) return;
      sessionStorage.setItem("tcg-avatar-repair", avatarUrl || "");
    } catch { /* storage unavailable: still try once per page */ }
    const r = await repairPicture().catch(() => null);
    if (r?.url && r.url !== avatarUrl) { setUrl(r.url); setBroken(false); }
  }

  const face = url && !broken
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={url} alt="" referrerPolicy="no-referrer" onError={onImgError} />
    : <span>{initials}</span>;

  return (
    <div className="user-menu" ref={box}>
      <button type="button" className="avatar-btn" aria-haspopup="menu" aria-expanded={open} aria-label="Open your account menu"
        onClick={() => setOpen((o) => !o)}>
        {face}
      </button>
      {open && (
        <div className="user-dropdown" role="menu">
          <div className="ud-head">
            <span className="avatar-btn sm" aria-hidden="true">{face}</span>
            <span className="ud-who">
              <b>{name || "Your account"}</b>
              <span className="small muted">{email}</span>
              <span className="ud-plan">{isAdmin ? "Admin · " : ""}{planLabel} plan</span>
            </span>
          </div>
          {ITEMS.map(([href, label]) => (
            <Link key={href} href={href} role="menuitem" onClick={() => setOpen(false)}>{label}</Link>
          ))}
          <InstallButton className="ud-signout ud-install" onDone={() => setOpen(false)} />
          {/* Asks first: signing back in from the app means a trip through the browser (QA report S-02, Nov 2026). */}
          {confirmOut ? (
            <form action={onLogOut} className="ud-confirm">
              <span>Sign out of TCG Boogie?</span>
              <button type="submit" role="menuitem" className="btn sm">Sign out</button>
              <button type="button" className="btn ghost sm" onClick={(e) => { e.stopPropagation(); setConfirmOut(false); }}>Cancel</button>
            </form>
          ) : (
            <button type="button" role="menuitem" className="ud-signout" onClick={(e) => { e.stopPropagation(); setConfirmOut(true); }}>Sign out</button>
          )}
        </div>
      )}
    </div>
  );
}
