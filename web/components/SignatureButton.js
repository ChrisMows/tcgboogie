"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleSignature } from "@/app/app/profile/actions";

/** A card page's "☆ Make signature card": shows your copy on your Profile (up to 3 cards). */
export default function SignatureButton({ itemId, on, full, icon = false }) {
  const router = useRouter();
  const [msg, setMsg] = useState(null);
  const [pending, start] = useTransition();
  const click = () => start(async () => {
    const r = await toggleSignature(itemId);
    setMsg(r.ok ? null : r.message);
    if (r.ok) router.refresh();
  });
  // A star among the icons at the top of a card page.
  const star = (
    <svg viewBox="0 0 24 24" width="20" height="20" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.7l6.2-.9L12 3z" />
    </svg>
  );
  if (icon) {
    if (full && !on) return <Link href="/app/profile" className="alert-bell" title="You have 3 signature cards. Swap one on your Profile." aria-label="Signature cards full: swap one on your Profile">{star}</Link>;
    return (
      <button type="button" className={`alert-bell ${on ? "set" : ""}`} onClick={click} disabled={pending} aria-pressed={on}
        title={msg || (on ? "Signature card: shown on your Profile. Tap to take it off." : "Make this a signature card on your Profile (up to 3)")}
        aria-label={on ? "Remove signature card" : "Make signature card"}>{star}</button>
    );
  }
  if (full && !on) {
    return <Link href="/app/profile" className="btn sig-btn" title="You have 3 signature cards. Swap one on your Profile.">☆ Signature cards full · Swap</Link>;
  }
  return (
    <>
      <button type="button" className={`btn sig-btn ${on ? "on" : ""}`} onClick={click} disabled={pending} aria-pressed={on}
        title={on ? "Shown on your Profile. Tap to take it off." : "Show this card on your Profile (up to 3)"}>
        {pending ? "Saving…" : on ? "★ Signature card" : "☆ Make signature card"}
      </button>
      {msg && <span className="small warn">{msg}</span>}
    </>
  );
}
