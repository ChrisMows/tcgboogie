"use client";

import { useEffect, useState } from "react";

// "Add TCG Boogie to your home screen" (app/manifest.js makes the site installable).
//   Android / Chrome: the browser's own install prompt, kept from beforeinstallprompt and shown on tap.
//   iPhone / iPad (Safari): Apple has no install prompt for websites, so we show the two taps instead.
// Hidden when the site is already open as an installed app.
let deferred = null; // the browser's install prompt, if it offered one
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; window.dispatchEvent(new Event("tcgb-installable")); });
}

const standalone = () => typeof window !== "undefined"
  && (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true);
const isIOS = () => typeof navigator !== "undefined"
  && (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

/** Can this device add the site to its home screen right now? "prompt" (Android), "ios" (steps), or null. */
export function useInstall() {
  const [mode, setMode] = useState(null);
  useEffect(() => {
    const check = () => setMode(standalone() ? null : deferred ? "prompt" : isIOS() ? "ios" : null);
    check();
    window.addEventListener("tcgb-installable", check);
    window.addEventListener("appinstalled", check);
    return () => { window.removeEventListener("tcgb-installable", check); window.removeEventListener("appinstalled", check); };
  }, []);
  return mode;
}

/** Start the install: the browser's prompt on Android, or the iPhone steps (forPush: say push gets switched on after). */
export async function install({ forPush = false } = {}) {
  if (deferred) {
    deferred.prompt();
    await deferred.userChoice.catch(() => null);
    deferred = null;
    window.dispatchEvent(new Event("tcgb-installable"));
    return;
  }
  window.dispatchEvent(new CustomEvent("tcgb-install-ios", { detail: { forPush } }));
}

/** A menu button: "📲 Add to home screen", only on devices that can. */
export function InstallButton({ className = "", onDone }) {
  const mode = useInstall();
  if (!mode) return null;
  return <button type="button" className={className} onClick={() => { onDone?.(); install(); }}>📲 Add to home screen</button>;
}

const DISMISS = "tcgb-install-hint";

/**
 * Mounted once in the root layout: the iPhone steps when asked for, and a one-time hint for members on a phone
 * (dismissed for good with ✕, or after they install).
 */
export default function InstallApp({ signedIn }) {
  const mode = useInstall();
  const [steps, setSteps] = useState(false);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    const show = (e) => setSteps(e.detail?.forPush ? "push" : true);
    window.addEventListener("tcgb-install-ios", show);
    return () => window.removeEventListener("tcgb-install-ios", show);
  }, []);
  useEffect(() => {
    if (!signedIn || !mode || window.innerWidth > 860) return;
    let seen = false;
    try { seen = Boolean(localStorage.getItem(DISMISS)); } catch { /* storage blocked: show it */ }
    if (!seen) { const t = setTimeout(() => setHint(true), 4000); return () => clearTimeout(t); }
  }, [signedIn, mode]);

  const dismiss = () => { setHint(false); try { localStorage.setItem(DISMISS, "1"); } catch { /* fine */ } };

  return (
    <>
      {hint && mode && (
        <div className="install-hint" role="dialog" aria-label="Add TCG Boogie to your home screen">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" width={44} height={44} />
          <div className="install-hint-text">
            <b>Get the TCG Boogie app</b>
            <span className="small muted">Add it to your home screen: opens full-screen, one tap away.</span>
          </div>
          <button type="button" className="btn sm primary" onClick={() => { dismiss(); install(); }}>{mode === "ios" ? "Show me" : "Install"}</button>
          <button type="button" className="install-x" onClick={dismiss} aria-label="Not now">✕</button>
        </div>
      )}
      {steps && (
        <div className="dq-backdrop" onClick={() => setSteps(false)}>
          <div className="panel install-steps" role="dialog" aria-label="Add to Home Screen" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="" width={64} height={64} />
            <h2>{steps === "push" ? "Push alerts need TCG Boogie on your home screen" : "Add TCG Boogie to your home screen"}</h2>
            {steps === "push" && <p className="small muted" style={{ marginTop: -4 }}>On iPhone, Apple only lets apps on the home screen send notifications. Here&apos;s how:</p>}
            <ol>
              <li>Tap the <b>Share</b> button <span className="install-share" aria-hidden="true">⬆︎</span> at the bottom of Safari (top right on iPad).</li>
              <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
              <li>Tap <b>Add</b>. TCG Boogie opens full-screen from your home screen, like an app.</li>
              {steps === "push" && <li>Open TCG Boogie from your home screen and tap <b>Turn on push</b> when we ask.</li>}
            </ol>
            <p className="small muted">In Chrome on iPhone, the Share button is at the right of the address bar; the rest is the same.</p>
            <button type="button" className="btn primary" onClick={() => setSteps(false)}>Got it</button>
          </div>
        </div>
      )}
    </>
  );
}
