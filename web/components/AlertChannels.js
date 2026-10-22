"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleAlertChannel } from "@/app/app/actions";

/** "Alerts go to": Email, Discord and Text as on/off switches, or a link to set one up (or unlock it). */
export default function AlertChannels({ user }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const premium = user.plan.watchAlertChannels.includes("sms");
  const [on, setOn] = useState({ email: user.alertEmail !== false, discord: Boolean(user.alertDiscord), sms: Boolean(user.alertSms) });

  const channels = [
    { key: "email", icon: "✉️", label: "Email", state: "ready", note: user.email },
    {
      key: "discord", icon: "💬", label: "Discord",
      ...(!premium ? { state: "locked" } : !user.discordConnected ? { state: "todo", action: "Connect", href: "/app/account#connections" }
        : { state: "ready", note: "DM from BoogieBot" }),
    },
    {
      key: "sms", icon: "📱", label: "Text",
      ...(!premium ? { state: "locked" } : !user.phoneVerifiedAt ? { state: "todo", action: "Add number", href: "/app/account#phone" }
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
        {channels.map((c) => (
          <div key={c.key} className={`ac-option ${c.state === "ready" && on[c.key] ? "on" : ""} ${c.state}`}>
            <span className="ac-icon" aria-hidden="true">{c.icon}</span>
            <span className="ac-text">
              <b>{c.label}</b>
              {c.note && <span className="small muted">{c.note}</span>}
            </span>
            {c.state === "ready" && (
              <button type="button" role="switch" aria-checked={on[c.key]} aria-label={`${c.label} alerts`} className="ac-switch" disabled={pending} onClick={() => flip(c.key)}>
                <i />
              </button>
            )}
            {c.state === "todo" && <Link href={c.href} className="btn sm">{c.action}</Link>}
            {c.state === "locked" && <Link href="/app/premium?from=alerts" className="ac-lock small">🔒 Premium</Link>}
          </div>
        ))}
      </div>
      {!any && <div className="ac-warn">Nothing is switched on, so you won&apos;t hear about these alerts.</div>}
    </section>
  );
}
