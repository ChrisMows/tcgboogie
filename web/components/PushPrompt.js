"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { enablePush, pushSupported, standalone } from "@/lib/push-client";

// In the home-screen app, a member who hasn't been asked about notifications yet gets one prompt to turn push on.
// That's the last step after "Add to home screen" on iPhone (lib/push-client.js), where the home-screen app is the
// only place push can be switched on. "Not now" hides it on this device for good.
const DISMISS = "tcgb-push-prompt";

export default function PushPrompt({ canPush }) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [error, setError] = useState(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!canPush || !standalone() || !pushSupported() || Notification.permission !== "default") return;
    try { if (localStorage.getItem(DISMISS)) return; } catch { /* storage blocked: ask anyway */ }
    const t = setTimeout(() => setShow(true), 1500);
    return () => clearTimeout(t);
  }, [canPush]);

  const close = () => { setShow(false); try { localStorage.setItem(DISMISS, "1"); } catch { /* fine */ } };
  const turnOn = () => start(async () => {
    setError(null);
    const res = await enablePush();
    if (res.ok) { close(); router.refresh(); }
    else if (res.error) setError(res.error);
    else close(); // they said no in the browser's prompt
  });

  if (!show) return null;
  return (
    <div className="dq-backdrop" onClick={close}>
      <div className="panel install-steps" role="dialog" aria-label="Turn on push alerts" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={64} height={64} />
        <h2>Turn on push alerts</h2>
        <p className="muted" style={{ marginTop: 0 }}>Deals and price alerts pop up on this phone the moment they happen, even when TCG Boogie is closed.</p>
        {error && <div className="small bad" style={{ marginBottom: 10 }}>{error}</div>}
        <div className="row" style={{ gap: 10, justifyContent: "center" }}>
          <button type="button" className="btn" onClick={close}>Not now</button>
          <button type="button" className="btn primary" onClick={turnOn} disabled={pending}>{pending ? "Turning on..." : "Turn on push"}</button>
        </div>
      </div>
    </div>
  );
}
