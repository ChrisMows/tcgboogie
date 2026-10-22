"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The whole member area: Home first, then the rest A–Z, plus Settings (account, plan, alerts). Sign out lives in the profile-picture menu.
const LINKS = [
  ["/app", "Home", "⌂", (p) => p === "/app"],
  ["/app/collection", "Collection", "▦", (p) => p.startsWith("/app/collection") || p.startsWith("/app/cards")],
  ["/app/deals", "Deals", "⚡", (p) => p.startsWith("/app/deals")],
  ["/app/watches", "Price alerts", "🔔", (p) => p.startsWith("/app/watches")],
];
// Bottom section, also A–Z. Admin and Logs are for admins only.
const BOTTOM = [
  ["/app/admin", "Admin", "🛡", true],
  ["/app/logs", "Logs", "📜", true],
  ["/app/account", "Settings", "⚙", false],
];

const TABS = [
  { href: "/app", label: "Home", icon: "⌂", isOn: (p) => p === "/app" },
  { href: "/app/collection", label: "Collection", icon: "▦", isOn: (p) => p.startsWith("/app/collection") || p.startsWith("/app/cards") },
  { href: "/app/deals", label: "Deals", icon: "⚡", isOn: (p) => p.startsWith("/app/deals") },
  { href: "/app/watches", label: "Alerts", icon: "🔔", isOn: (p) => p.startsWith("/app/watches") },
  { href: "/app/admin", label: "Admin", icon: "🛡", isOn: (p) => p.startsWith("/app/admin") || p.startsWith("/app/logs"), adminOnly: true },
  { href: "/app/account", label: "Settings", icon: "⚙", isOn: (p) => p.startsWith("/app/account") || p.startsWith("/app/premium") },
];

export default function SideNav({ planLabel, premium, isAdmin }) {
  const path = usePathname();
  return (
    <aside className="side">
      <nav aria-label="Member">
        {LINKS.map(([href, label, icon, isOn]) => (
          <Link key={href} href={href} className={isOn(path) ? "on" : ""} aria-current={isOn(path) ? "page" : undefined}>
            <span className="side-icon" aria-hidden="true">{icon}</span>{label}
          </Link>
        ))}
        <div className="side-sep" />
        {BOTTOM.filter(([, , , adminOnly]) => isAdmin || !adminOnly).map(([href, label, icon]) => (
          <Link key={href} href={href} className={path.startsWith(href) ? "on" : ""} aria-current={path.startsWith(href) ? "page" : undefined}>
            <span className="side-icon" aria-hidden="true">{icon}</span>{label}
          </Link>
        ))}
        {!premium && (
          <Link href="/app/premium" className="side-upgrade">
            <b>Go Premium</b>
            <span>Every deal live, before it ends.</span>
          </Link>
        )}
        {premium && <div className="plan-chip"><span className="badge accent">{planLabel} plan</span></div>}
      </nav>
      {/* Phones: the same places as a tab bar fixed to the bottom of the screen, always in reach. */}
      <nav className="tabbar" aria-label="Member (mobile)">
        {TABS.filter((t) => isAdmin || !t.adminOnly).map((t) => {
          const on = t.isOn(path);
          return (
            <Link key={t.href} href={t.href} className={on ? "on" : ""} aria-current={on ? "page" : undefined}>
              <span className="tabbar-icon" aria-hidden="true">{t.icon}</span>
              <span className="tabbar-label">{t.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
