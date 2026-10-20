import Link from "next/link";

/** "Alerts go to: ✉️ Email · 💬 Discord · 📱 Text" with what's on, what needs setting up, and a Change button. */
export default function AlertChannels({ user }) {
  const premium = user.plan.watchAlertChannels.includes("sms");
  const channels = [
    {
      key: "email", icon: "✉️", label: "Email",
      state: user.alertEmail === false ? "off" : "on", note: user.alertEmail === false ? "off" : user.email,
    },
    {
      key: "discord", icon: "💬", label: "Discord",
      ...(!premium ? { state: "locked", note: "Premium" }
        : !user.discordConnected ? { state: "todo", note: "connect Discord", href: "/app/account#connections" }
        : { state: user.alertDiscord ? "on" : "off", note: user.alertDiscord ? "DM from BoogieBot" : "off" }),
    },
    {
      key: "sms", icon: "📱", label: "Text",
      ...(!premium ? { state: "locked", note: "Premium" }
        : !user.phoneVerifiedAt ? { state: "todo", note: "add your number", href: "/app/account#phone" }
        : { state: user.alertSms ? "on" : "off", note: user.alertSms ? user.phone : "off" }),
    },
  ];
  const on = channels.filter((c) => c.state === "on").length;

  return (
    <div className={`alert-channels ${on ? "" : "none"}`}>
      <span className="ac-title">Alerts go to</span>
      <div className="ac-list">
        {channels.map((c) => (
          <Link key={c.key} href={c.state === "locked" ? "/app/premium?from=alerts" : c.href || "/app/account#alerts"} className={`ac-chip ${c.state}`}
            title={c.state === "on" ? `${c.label} alerts are on` : c.state === "off" ? `${c.label} alerts are off` : c.note}>
            <span aria-hidden="true">{c.icon}</span> {c.label}
            <span className="ac-note">{c.state === "on" ? "✓" : c.state === "locked" ? "🔒" : c.state === "todo" ? `· ${c.note}` : "· off"}</span>
          </Link>
        ))}
      </div>
      <Link href="/app/account#alerts" className="btn sm">{on ? "Change" : "Turn alerts on"}</Link>
      {!on && <div className="ac-warn">No channel is on, so you won&apos;t hear about these alerts.</div>}
    </div>
  );
}
