"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { pushKey, removePush, savePush, testPush } from "@/app/app/actions";
import { InstallButton } from "@/components/InstallApp";

// Push alerts on this phone or computer (lib/push.js sends them, public/sw.js shows them). The browser asks the
// member's permission, so each device is switched on here with a tap. On iPhone, push works only once TCG Boogie is
// on the home screen and opened from there (Apple's rule), so the button there is "Add to home screen" first.

const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const isIOS = () => typeof navigator !== "undefined"
  && (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
const standalone = () => typeof window !== "undefined"
  && (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true);

function keyBytes(base64) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

/** devices: [{ endpoint, device }] this member already switched on. */
export default function PushSetup({ canPush, devices = [] }) {
  const router = useRouter();
  const [state, setState] = useState("checking"); // checking / unsupported / ios-install / blocked / off / on
  const [endpoint, setEndpoint] = useState(null);
  const [note, setNote] = useState(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      if (!supported()) return setState(isIOS() && !standalone() ? "ios-install" : "unsupported");
      if (Notification.permission === "denied") return setState("blocked");
      const sub = await currentSubscription().catch(() => null);
      const mine = sub && devices.some((d) => d.endpoint === sub.endpoint);
      setEndpoint(mine ? sub.endpoint : null);
      setState(mine ? "on" : "off");
    })();
  }, [devices]);

  const turnOn = () => start(async () => {
    setNote(null);
    try {
      const key = await pushKey();
      if (!key) return setNote({ bad: true, text: "Push alerts work on the live site, not in this preview." });
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "blocked" : "off");
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
      const res = await savePush(sub.toJSON(), navigator.userAgent);
      if (!res.ok) return setNote({ bad: true, text: res.error });
      setEndpoint(sub.endpoint);
      setState("on");
      setNote({ text: "Push alerts are on for this device. Send a test to see one." });
      router.refresh();
    } catch {
      setNote({ bad: true, text: "This browser wouldn't switch push on. Please try again, or try another browser." });
    }
  });

  const turnOff = () => start(async () => {
    const sub = await currentSubscription().catch(() => null);
    await sub?.unsubscribe().catch(() => {});
    await removePush(endpoint || sub?.endpoint || "");
    setEndpoint(null);
    setState("off");
    setNote(null);
    router.refresh();
  });

  const test = () => start(async () => {
    const res = await testPush();
    setNote(res.ok ? { text: `Sent to ${res.devices} ${res.devices === 1 ? "device" : "devices"}. It should pop up in a few seconds.` } : { bad: true, text: res.error });
  });

  const others = devices.filter((d) => d.endpoint !== endpoint);
  return (
    <div className="push-setup">
      <div className="push-row">
        <span>📲 <b>Push notifications</b> <span className="badge good" style={{ marginLeft: 6 }}>Instant</span>{!canPush && <span className="badge" style={{ marginLeft: 6 }}>Premium</span>}</span>
        {!canPush ? (
          <Link href="/app/premium?from=push" className="btn sm">Unlock with Premium</Link>
        ) : state === "on" ? (
          <span className="row" style={{ gap: 6, flex: "none" }}>
            <button type="button" className="btn sm" onClick={test} disabled={pending}>Send a test</button>
            <button type="button" className="btn sm ghost" onClick={turnOff} disabled={pending}>Turn off here</button>
          </span>
        ) : state === "off" ? (
          <button type="button" className="btn sm primary" onClick={turnOn} disabled={pending}>Turn on for this device</button>
        ) : state === "ios-install" ? (
          <InstallButton className="btn sm primary" />
        ) : null}
      </div>
      <div className="hint" style={{ marginLeft: 27 }}>
        {state === "on" ? "On for this device. Deal and price alerts pop up here the moment they're sent."
          : state === "blocked" ? "Notifications are blocked for TCG Boogie in this browser. Allow them in the browser's site settings, then come back here."
          : state === "ios-install" ? "On iPhone, add TCG Boogie to your home screen and open it from there, then turn push on in Settings."
          : state === "unsupported" ? "This browser can't show push notifications. Try Chrome, Edge, Firefox or Safari, or add TCG Boogie to your home screen."
          : canPush ? "Alerts pop up on this phone or computer, even when TCG Boogie isn't open. Switch on each device you want them on." : "Instant alerts on your phone, even when TCG Boogie isn't open."}
        {others.length > 0 && ` Also on: ${others.map((d) => d.device || "another device").join(", ")}.`}
      </div>
      {note && <div className={`small ${note.bad ? "bad" : "good"}`} style={{ marginLeft: 27, marginTop: 4 }}>{note.text}</div>}
    </div>
  );
}
