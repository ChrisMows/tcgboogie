import Link from "next/link";
import CardThumb from "@/components/CardThumb";
import DealCard from "@/components/DealCard";
import { itemLabel, money, pct, unitValue } from "@/lib/collection";
import { loadCollection } from "@/lib/portfolio";
import { SAMPLE_DEALS } from "@/lib/demo-deals";
import { clampToPlan, matches } from "@/lib/filters";
import { requireUser } from "@/lib/session";
import * as store from "@/lib/store";

export default async function Dashboard() {
  const user = await requireUser();
  const profiles = await store.ensureStarterProfile(user);
  const premium = user.tier === "premium";
  const running = profiles.filter((p) => p.active).slice(0, user.plan.maxProfiles);
  const caught = SAMPLE_DEALS.filter((d) => running.some((p) => matches(clampToPlan(p.filters, user.plan), d)));
  const best = [...caught].sort((a, b) => b.soldFor - b.total - (a.soldFor - a.total))[0];
  const savings = caught.reduce((s, d) => s + (d.soldFor - d.total), 0);

  const coll = await loadCollection(user);
  const top = [...coll.owned].sort((a, b) => (unitValue(b) ?? 0) * b.quantity - (unitValue(a) ?? 0) * a.quantity).slice(0, 4);

  const steps = [
    ["Create your account", true, null],
    ["Add your first cards to your collection", coll.owned.length > 0, "/app/collection?add=1"],
    ["Set up your first filter profile", profiles.some((p) => p.updatedAt > p.createdAt), "/app/filters"],
    ["Connect Discord for instant alerts", user.discordConnected, "/app/account"],
    ["Upgrade to Premium to get deals live", premium, "/app/billing"],
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hi{user.name ? `, ${user.name.split(" ")[0]}` : ""}</h1>
          <p>{premium ? "Your deals arrive live while the auctions are still open." : "You're on Free: you see deals after their auctions end."}</p>
        </div>
        <Link href="/app/filters" className="btn primary">Edit filters</Link>
      </div>

      <div className="panel dash-collection">
        <div className="dash-coll-head">
          <div>
            <h2 style={{ marginBottom: 4 }}>Your collection</h2>
            <div className="dash-coll-value">{money(coll.summary.value)}</div>
            <div className="small muted">
              {coll.summary.copies} cards & products
              {coll.summary.gain !== null ? <> · <span className={coll.summary.gain >= 0 ? "up" : "down"}>{coll.summary.gain >= 0 ? "+" : ""}{money(coll.summary.gain)} ({pct(coll.summary.gainPct)})</span> on what you paid</> : null}
              {coll.wishlist.length ? <> · {coll.wishlist.length} on your wishlist</> : null}
            </div>
          </div>
          <div className="head-actions">
            <Link href="/app/collection?add=1" className="btn primary sm">+ Add cards</Link>
            <Link href="/app/collection" className="btn sm">Open collection</Link>
          </div>
        </div>
        {top.length > 0 ? (
          <div className="dash-top">
            {top.map((it) => (
              <Link key={it.id} href={`/app/cards/${it.productId}`} className="dash-top-card">
                <CardThumb item={it} width={64} />
                <span><b>{it.name.replace(/\s*\(.*\)$/, "")}</b><span className="small muted">{itemLabel(it)}{it.quantity > 1 ? ` · ×${it.quantity}` : ""}</span><span className="small">{money((unitValue(it) ?? 0) * it.quantity)}</span></span>
              </Link>
            ))}
          </div>
        ) : <p className="muted small" style={{ margin: "10px 0 0" }}>Track what you own and what it&apos;s worth, free. Start by adding a few cards or <Link href="/app/collection/sets">browsing a set</Link>.</p>}
      </div>

      <div className="stats">
        <div className="stat"><b>{running.length} / {user.plan.maxProfiles}</b><span>filter profiles running</span></div>
        <div className="stat"><b>{caught.length}</b><span>deals matched {user.demo ? "(sample data)" : "today"}</span></div>
        <div className="stat"><b>${savings.toLocaleString()}</b><span>below what they sold for</span></div>
        <div className="stat"><b>{premium ? "Instant" : "After it ends"}</b><span>when you see deals</span></div>
      </div>

      <div className="form-grid" style={{ alignItems: "start" }}>
        <div className="panel">
          <h2>Getting started</h2>
          <ul className="checklist">
            {steps.map(([label, done, href]) => (
              <li key={label}>
                <span className={`dot ${done ? "done" : ""}`}>{done ? "✓" : ""}</span>
                <span style={{ flex: 1 }}>{label}</span>
                {!done && href && <Link href={href} className="btn sm">Go</Link>}
              </li>
            ))}
          </ul>
        </div>
        <div className="panel">
          <h2>{premium ? "Best recent deal" : "The one that got away"}</h2>
          {best ? <DealCard deal={best} mode={premium ? "live" : "missed"} /> : (
            <p className="muted">No matches yet. Loosen your filters a little to catch more deals.</p>
          )}
        </div>
      </div>
    </>
  );
}
