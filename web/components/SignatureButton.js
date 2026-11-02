"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleSignature } from "@/app/app/profile/actions";

/** A card page's "☆ Make signature card": shows your copy on your Profile (up to 3 cards). */
export default function SignatureButton({ itemId, on, full }) {
  const router = useRouter();
  const [msg, setMsg] = useState(null);
  const [pending, start] = useTransition();
  const click = () => start(async () => {
    const r = await toggleSignature(itemId);
    setMsg(r.ok ? null : r.message);
    if (r.ok) router.refresh();
  });
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
