"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  ["/app", "Dashboard"],
  ["/app/filters", "Filters"],
  ["/app/feed", "Deal feed"],
  ["/app/watches", "Price watches"],
  ["/app/alerts", "Alert history"],
  ["/app/account", "Account"],
  ["/app/billing", "Plan and billing"],
];

export default function SideNav({ planLabel, premium, onLogOut }) {
  const path = usePathname();
  return (
    <aside className="side">
      <nav aria-label="Member">
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} className={path === href ? "on" : ""}>
            {label}
          </Link>
        ))}
        <form action={onLogOut}>
          <button className="btn ghost" style={{ width: "100%", justifyContent: "flex-start", padding: "9px 12px" }}>Log out</button>
        </form>
        <div className="plan-chip">
          <span className={`badge ${premium ? "accent" : ""}`}>{planLabel} plan</span>
          {!premium && (
            <div style={{ marginTop: 8 }}>
              <Link href="/app/billing" className="small">Upgrade to Premium</Link>
            </div>
          )}
        </div>
      </nav>
    </aside>
  );
}
