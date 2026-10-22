"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleAlertChannel } from "@/app/app/actions";

/** "Alerts go to": Email, Discord and Text as on/off switches, or a link to set one up (or unlock it). */
export default function AlertChannels({ user }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const can = (c) => user.plan.watchAlertChannels.includes(c); // Admin → Features decides which plan gets each
  const [on, setOn] = useState({ email: user.alertEmail !== false, discord: Boolean(user.alertDiscord), sms: Boolean(user.alertSms) });

  const channels = [
    { key: "email", icon: "✉️", label: "Email", state: "ready", note: user.email },
    {
      key: "discord", icon: "💬", label: "Discord",
      ...(!can("discord") ? { state: "locked" } : !user.discordConnected ? { state: "todo", action: "Connect Discord", href: "/app/account#connections" }
        : { state: "ready", note: "DM from BoogieBot" }),
    },
    {
      key: "sms", icon: "📱", label: "Text",
      ...(!can("sms") ? { state: "locked" } : !user.phoneVerifiedAt ? { state: "todo", action: "Add your number", href: "/app/account#phone" }
        : { state: "ready", note: user.phone }),
    },
  ];
  const any = channels.some((c) => c.state === "ready" && on[c.key]);

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
    <section className={`panel alert-channels ${any ? "" : "none"}`}>
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
          return (
            <Link key={c.key} href={c.state === "locked" ? "/app/premium?from=alerts" : c.href} className={`ac-option ${c.state}`}
              title={c.state === "locked" ? `${c.label} alerts are part of Premium` : `${c.action} to get ${c.label.toLowerCase()} alerts`}>
              {inner}<span className="ac-tag" aria-hidden="true">{c.state === "locked" ? "🔒" : "+"}</span>
            </Link>
          );
        })}
      </div>
      {!any && <div className="ac-warn">Nothing is switched on, so you won&apos;t hear about these alerts.</div>}
    </section>
  );
}
