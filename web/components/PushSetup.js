"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { removePush, testPush, toggleAlertChannel } from "@/app/app/actions";
import { currentSubscription, enablePush, needsInstall, pushSupported } from "@/lib/push-client";

// Push alerts on this phone or computer (lib/push.js sends them, public/sw.js shows them), as the first switch in
// Settings → How we reach you. Ticking it asks the browser's permission right there; on an iPhone in Safari it shows
// the home-screen steps first (lib/push-client.js). Unticking switches this device off.

/** devices: [{ endpoint, device }] this member already switched on. alertOn: push alerts switched on for the account. */
export default function PushSetup({ canPush, devices = [], alertOn = true }) {
  const router = useRouter();
  const [state, setState] = useState("checking"); // checking / unsupported / ios-install / blocked / off / on
  const [endpoint, setEndpoint] = useState(null);
  const [note, setNote] = useState(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      if (!pushSupported()) return setState(needsInstall() ? "ios-install" : "unsupported");
      if (Notification.permission === "denied") return setState("blocked");
      const sub = await currentSubscription().catch(() => null);
      const mine = sub && devices.some((d) => d.endpoint === sub.endpoint);
      setEndpoint(mine ? sub.endpoint : null);
      setState(mine ? "on" : "off");
    })();
  }, [devices]);

  const turnOn = () => start(async () => {
    setNote(null);
    // This device is already set up but push was switched off (Alerts go to): just switch it back on.
    if (state === "on" && !alertOn) {
      await toggleAlertChannel("push", true);
      setNote({ text: "Push alerts are back on." });
      return router.refresh();
    }
    const res = await enablePush();
    if (!res.ok) {
      if (res.state) setState(res.state);
      if (res.error) setNote({ bad: true, text: res.error });
      return;
    }
    setEndpoint(res.endpoint);
    setState("on");
    setNote({ text: "Push alerts are on for this device. Send a test to see one." });
    router.refresh();
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

  const checked = state === "on" && alertOn;
  const others = devices.filter((d) => d.endpoint !== endpoint);
  const usable = canPush && state !== "checking" && state !== "unsupported";
  return (
    <div className="push-setup">
      <label className={`check ${usable ? "" : "dim"}`}>
        <input type="checkbox" checked={checked} disabled={!usable || pending}
          onChange={(e) => (e.target.checked ? turnOn() : turnOff())} />
        {" "}📲 Push notifications on this device <span className="badge good" style={{ marginLeft: 6 }}>Instant</span>
        {!canPush && <span className="badge" style={{ marginLeft: 6 }}>Premium</span>}
        {checked && <button type="button" className="link-btn small" style={{ marginLeft: 8 }} onClick={(e) => { e.preventDefault(); test(); }} disabled={pending}>Send a test</button>}
      </label>
      <div className="hint" style={{ marginLeft: 27 }}>
        {!canPush ? <>Instant alerts on your phone, even when TCG Boogie isn&apos;t open. <Link href="/app/premium?from=push">Unlock with Premium</Link></>
          : checked ? "Deal and price alerts pop up here the moment they're sent."
          : state === "on" ? "This device is set up, but push alerts are switched off. Tick the box to switch them back on."
          : state === "blocked" ? "Notifications are blocked for TCG Boogie in this browser. Allow them in the browser's site settings, then tick the box."
          : state === "ios-install" ? "On iPhone, tick the box and we'll show you how to add TCG Boogie to your home screen (Apple needs that for notifications)."
          : state === "unsupported" ? "This browser can't show push notifications. Try Chrome, Edge, Firefox or Safari."
          : "Alerts pop up on this phone or computer, even when TCG Boogie isn't open. Tick it on each device you want them on."}
        {others.length > 0 && ` Also on: ${others.map((d) => d.device || "another device").join(", ")}.`}
      </div>
      {note && <div className={`small ${note.bad ? "bad" : "good"}`} style={{ marginLeft: 27, marginTop: 4 }}>{note.text}</div>}
    </div>
  );
}
