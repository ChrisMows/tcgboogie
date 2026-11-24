"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// The whole member area: Home first, then the rest A–Z, plus Settings (account, plan, alerts). Sign out lives in the profile-picture menu.
const PHOTO = "/app/collection/photo";
const SETS_PAGE = "/app/collection/sets";
const inCollection = (p) => (p.startsWith("/app/collection") && !p.startsWith(PHOTO) && !p.startsWith(SETS_PAGE)) || p.startsWith("/app/cards");
const LINKS = [
  ["/app/home", "Home", "⌂", (p) => p.startsWith("/app/home")],
  [PHOTO, "Card scanner", "📷", (p) => p.startsWith(PHOTO)],
  ["/app/collection", "Collection", "▦", inCollection],
  ["/app/deals", "Deals", "⚡", (p) => p.startsWith("/app/deals")],
  ["/app/grade-and-flip", "Grade & Flip", "💎", (p) => p.startsWith("/app/grade-and-flip")],
  ["/app/watches", "Price alerts", "🔔", (p) => p.startsWith("/app/watches")],
  [SETS_PAGE, "Sets", "🗂", (p) => p.startsWith(SETS_PAGE)], // members' Sets (not in the top bar once signed in)
];
// Bottom section, also A–Z. Admin and Logs are for admins only.
const BOTTOM = [
  ["/app/admin", "Admin", "🛡", true],
  ["/app/logs", "Logs", "📜", true],
  ["/app/profile", "Profile", "👤", false],
  ["/app/account", "Settings", "⚙", false],
];

// Phones: Profile last (Settings is in the profile-picture menu at the top, and in Profile). The paid features share one
// Premium button that opens a menu (PREMIUM below), so Sets fits as its own tab and the bar stays at six (seven for admins).
const SETS = SETS_PAGE;
const TABS = [
  { href: "/app/home", label: "Home", icon: "⌂", isOn: (p) => p.startsWith("/app/home") },
  { href: "/app/collection", label: "Collection", icon: "▦", isOn: (p) => inCollection(p) && !p.startsWith(SETS) },
  { href: SETS, label: "Sets", icon: "🗂", isOn: (p) => p.startsWith(SETS) },
  { href: PHOTO, label: "Scan", icon: "📷", isOn: (p) => p.startsWith(PHOTO) },
  { premium: true, label: "Premium", icon: "💎" },
  { href: "/app/admin", label: "Admin", icon: "🛡", isOn: (p) => p.startsWith("/app/admin") || p.startsWith("/app/logs"), adminOnly: true },
  { href: "/app/profile", label: "Profile", icon: "👤", isOn: (p) => p.startsWith("/app/profile") },
];
// The Premium menu. Everyone sees every item; `lock` says what the member's plan is missing (null = all of it).
const PREMIUM = [
  { href: "/app/deals", label: "Deals", icon: "⚡", note: "Underpriced eBay auctions",
    lock: (a) => (a.liveDeals ? null : "Live with Premium") },
  { href: "/app/watches", label: "Price alerts", icon: "🔔", note: "Alerts when a card hits your price",
    lock: (a) => (a.plan === "free" ? "More with Premium" : null) },
  { href: "/app/grade-and-flip", label: "Grade & Flip", icon: "🏅", note: "Raw cards worth grading and selling",
    lock: (a) => (a.gradeFlip ? null : "🔒 Ultra") },
];
const inPremium = (p) => PREMIUM.some((f) => p.startsWith(f.href));

/**
 * A new page opens at its top. Next scrolls the new page into view, which left its title under the sticky header when
 * the last page was scrolled down (QA report M-02, Nov 2026). Back and forward keep the browser's own scroll position,
 * and links to a section (#...) still jump there.
 */
function useTopOnNewPage(path) {
  const first = useRef(true);
  const back = useRef(false);
  useEffect(() => {
    const onPop = () => { back.current = true; };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (back.current) { back.current = false; return; }
    if (location.hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [path]);
}

/** tabsOnly: just the phone tab bar, for member pages outside the member area (Market Movers). */
export default function SideNav({ planLabel, premium, isAdmin, access = {}, tabsOnly = false }) {
  const path = usePathname();
  useTopOnNewPage(path);
  if (tabsOnly) return <aside className="side tabs-only"><TabBar path={path} isAdmin={isAdmin} access={access} /></aside>;
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
      <TabBar path={path} isAdmin={isAdmin} access={access} />
    </aside>
  );
}

function TabBar({ path, isAdmin, access }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const plan = access.plan || "free";
  return (
    <nav ref={ref} className="tabbar" aria-label="Member (mobile)">
      {TABS.filter((t) => isAdmin || !t.adminOnly).map((t) => {
        if (t.premium) {
          const on = inPremium(path);
          return (
            <button key="premium" type="button" className={`tabbar-premium${on ? " on" : ""}${open ? " open" : ""}`}
              aria-expanded={open} aria-controls="tabbar-premium-menu" onClick={() => setOpen((o) => !o)}>
              <span className="tabbar-icon" aria-hidden="true">{t.icon}</span>
              <span className="tabbar-label">{t.label}</span>
            </button>
          );
        }
        const on = t.isOn(path);
        return (
          <Link key={t.href} href={t.href} className={on ? "on" : ""} aria-current={on ? "page" : undefined}>
            <span className="tabbar-icon" aria-hidden="true">{t.icon}</span>
            <span className="tabbar-label">{t.label}</span>
          </Link>
        );
      })}
      {open && (
        <div id="tabbar-premium-menu" className="tabbar-sheet" role="menu" aria-label="Premium features">
          <div className="tabbar-sheet-head">💎 Premium features</div>
          {PREMIUM.map((f) => {
            const on = path.startsWith(f.href);
            const lock = f.lock(access);
            return (
              <Link key={f.href} href={f.href} role="menuitem" className={on ? "on" : ""} aria-current={on ? "page" : undefined} onClick={() => setOpen(false)}>
                <span className="tabbar-sheet-icon" aria-hidden="true">{f.icon}</span>
                <span className="tabbar-sheet-text"><b>{f.label}</b><span>{f.note}</span></span>
                {lock && <span className="tabbar-sheet-lock">{lock}</span>}
              </Link>
            );
          })}
          {plan === "free" && <Link href="/app/premium?from=tabbar" className="btn sm primary tabbar-sheet-cta" onClick={() => setOpen(false)}>Go Premium</Link>}
          {plan === "premium" && <Link href="/app/ultra?from=tabbar" className="btn sm tabbar-sheet-cta" onClick={() => setOpen(false)}>See Ultra</Link>}
        </div>
      )}
    </nav>
  );
}
