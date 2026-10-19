"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The whole member area: four places, plus Settings (account, plan, alerts). Sign out lives in the profile-picture menu.
const LINKS = [
  ["/app", "Home", "⌂", (p) => p === "/app"],
  ["/app/deals", "Deals", "⚡", (p) => p.startsWith("/app/deals")],
  ["/app/watches", "Price alerts", "🔔", (p) => p.startsWith("/app/watches")],
  ["/app/collection", "Collection", "▦", (p) => p.startsWith("/app/collection") || p.startsWith("/app/cards")],
];

export default function SideNav({ planLabel, premium }) {
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
        <Link href="/app/account" className={path.startsWith("/app/account") ? "on" : ""} aria-current={path.startsWith("/app/account") ? "page" : undefined}>
          <span className="side-icon" aria-hidden="true">⚙</span>Settings
        </Link>
        {!premium && (
          <Link href="/app/account#plan" className="side-upgrade">
            <b>Go Premium</b>
            <span>Every deal live, before it ends.</span>
          </Link>
        )}
        {premium && <div className="plan-chip"><span className="badge accent">{planLabel} plan</span></div>}
      </nav>
    </aside>
  );
}
