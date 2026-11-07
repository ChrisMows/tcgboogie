"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { install as startInstall, useInstall } from "@/components/InstallApp";
import { enablePush, needsInstall, pushPermission, pushSupported } from "@/lib/push-client";

// Home: the one thing this member most needs next, in order: turn on push alerts (Premium), add TCG Boogie to the
// home screen (phones), go Premium. ✕ hides that card on this device and the next one in line shows.
const KEY = (kind) => `tcgb-home-promo-${kind}`;
const hidden = (kind) => { try { return Boolean(localStorage.getItem(KEY(kind))); } catch { return false; } };

export default function HomePromo({ canPush, pushOn, premium }) {
  const router = useRouter();
  const install = useInstall();
  const [kind, setKind] = useState(null);
  const [error, setError] = useState(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const pushable = canPush && !pushOn && (pushSupported() ? pushPermission() !== "denied" : needsInstall());
    const order = [pushable && "push", install && window.innerWidth <= 860 && "install", !premium && "premium"].filter(Boolean);
    setKind(order.find((k) => !hidden(k)) || null);
  }, [canPush, pushOn, premium, install]);

  const close = () => {
    try { localStorage.setItem(KEY(kind), "1"); } catch { /* fine */ }
    setKind(null); // the next one in line shows on the next visit, not straight away
  };
  const turnOnPush = () => start(async () => {
    setError(null);
    const res = await enablePush();
    if (res.ok) { setKind(null); router.refresh(); } else if (res.error) setError(res.error);
  });

  if (!kind) return null;
  const card = {
    push: { icon: "📲", title: "Get deals the second they're found", text: "Push alerts pop up on your phone, even when TCG Boogie is closed.",
      action: <button type="button" className="btn sm primary" onClick={turnOnPush} disabled={pending}>{pending ? "Turning on..." : "Turn on push"}</button> },
    install: { icon: "🏠", title: "Put TCG Boogie on your home screen", text: "It opens full-screen like an app, one tap away.",
      action: <button type="button" className="btn sm primary" onClick={() => startInstall()}>{install === "ios" ? "Show me" : "Install"}</button> },
    premium: { icon: "⚡", title: "Catch deals before the auction ends", text: "Premium sends you every deal live, while you can still bid, with instant push alerts.",
      action: <Link href="/app/premium?from=home" className="btn sm primary">Try Premium</Link> },
  }[kind];
  return (
    <div className="panel home-promo">
      <span className="home-promo-icon" aria-hidden="true">{card.icon}</span>
      <div className="home-promo-text">
        <b>{card.title}</b>
        <span className="small muted">{card.text}</span>
        {error && <span className="small bad">{error}</span>}
      </div>
      {card.action}
      <button type="button" className="install-x" onClick={close} aria-label="Hide this">✕</button>
    </div>
  );
}
