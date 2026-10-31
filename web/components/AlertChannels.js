"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleAlertChannel } from "@/app/app/actions";
import { enablePush } from "@/lib/push-client";

/**
 * "Alerts go to": Push, Email, Discord and Text as on/off switches, or a link to set one up (or unlock it). Push with
 * no device yet switches this device on right here (the browser asks; on iPhone, the home-screen steps first).
 */
export default function AlertChannels({ user, smsReady = true }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const can = (c) => user.plan.watchAlertChannels.includes(c); // Admin → Features decides which plan gets each
  const [on, setOn] = useState({ email: user.alertEmail !== false, push: Boolean(user.alertWebPush), discord: Boolean(user.alertDiscord), sms: Boolean(user.alertSms) });

  const [pushNote, setPushNote] = useState(null);
  const channels = [
    {
      key: "push", icon: "📲", label: "Push",
      ...(!can("push") ? { state: "locked" } : !user.pushDevices ? { state: "enable" }
        : { state: "ready", note: `${user.pushDevices} ${user.pushDevices === 1 ? "device" : "devices"}` }),
    },
    { key: "email", icon: "✉️", label: "Email", state: "ready", note: user.email },
    {
      key: "discord", icon: "💬", label: "Discord",
      ...(!can("discord") ? { state: "locked" } : !user.discordConnected ? { state: "todo", action: "Connect Discord", href: "/app/account#connections" }
        : { state: "ready", note: "DM from BoogieBot" }),
    },
    {
      key: "sms", icon: "📱", label: "Text",
      ...(!smsReady ? { state: "soon" } : !can("sms") ? { state: "locked" } : !user.phoneVerifiedAt ? { state: "todo", action: "Add your number", href: "/app/account#phone" }
        : { state: "ready", note: user.phone }),
    },
  ];
  const any = channels.some((c) => c.state === "ready" && on[c.key]);

  // Push with no device yet: switch this one on (savePush turns push alerts on for the account too).
  function enable() {
    setPushNote(null);
    start(async () => {
      const res = await enablePush();
      if (res.ok) { setOn((o) => ({ ...o, push: true })); router.refresh(); }
      else if (res.error) setPushNote(res.error);
    });
  }

  function flip(key) {
    const next = !on[key];
    setOn((o) => ({ ...o, [key]: next }));
    start(async () => {
      const res = await toggleAlertChannel(key, next);
      if (!res?.ok) setOn((o) => ({ ...o, [key]: !next }));
      router.refresh();
    });
  }

  return (
    <section className={`panel alert-channels ${any ? "" : "none"}`} data-tour="alert-channels">
      <div className="ac-head">
        <h2>Alerts go to</h2>
        <Link href="/app/account#alerts" className="small">Settings</Link>
      </div>
      <div className="ac-list">
        {channels.map((c) => {
          const inner = (<><span className="ac-icon" aria-hidden="true">{c.icon}</span><b className="ac-label">{c.label}</b></>);
          if (c.state === "ready") {
            return (
              <button key={c.key} type="button" role="switch" aria-checked={on[c.key]} className={`ac-option ${on[c.key] ? "on" : ""}`}
                disabled={pending} onClick={() => flip(c.key)} title={`${c.note ? `${c.note} · ` : ""}${on[c.key] ? "On" : "Off"}: tap to turn ${on[c.key] ? "off" : "on"}`}>
                {inner}<span className="ac-switch" aria-hidden="true"><i /></span>
              </button>
            );
          }
          if (c.state === "enable") {
            return (
              <button key={c.key} type="button" role="switch" aria-checked={false} className="ac-option" disabled={pending} onClick={enable}
                title="Off: tap to get push alerts on this device">
                {inner}<span className="ac-switch" aria-hidden="true"><i /></span>
              </button>
            );
          }
          if (c.state === "soon") {
            return (
              <span key={c.key} className="ac-option soon" title={`${c.label} alerts are coming soon`}>
                {inner}<span className="ac-tag ac-soon">Soon</span>
              </span>
            );
          }
          return (
            <Link key={c.key} href={c.state === "locked" ? "/app/premium?from=alerts" : c.href} className={`ac-option ${c.state}`}
              title={c.state === "locked" ? `${c.label} alerts are part of Premium` : `${c.action} to get ${c.label.toLowerCase()} alerts`}>
              {inner}<span className="ac-tag" aria-hidden="true">{c.state === "locked" ? "🔒" : "+"}</span>
            </Link>
          );
        })}
      </div>
      {pushNote && <div className="ac-warn">{pushNote}</div>}
      {!any && <div className="ac-warn">Nothing is switched on, so you won&apos;t hear about these alerts.</div>}
    </section>
  );
}
