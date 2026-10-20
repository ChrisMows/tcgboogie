import Link from "next/link";
import CardThumb from "@/components/CardThumb";
import DealTile from "@/components/DealTile";
import { withLinks } from "@/lib/deal-links";
import { money, pct, unitValue } from "@/lib/collection";
import { loadCollection } from "@/lib/portfolio";
import { dealsFor } from "@/lib/deals";
import { clampToPlan, matches } from "@/lib/filters";
import { requireUser } from "@/lib/session";
import * as store from "@/lib/store";
import { isRising, targetPrice } from "@/lib/watches";

// Home: one card per tool, each saying what needs you and offering one next step.
export default async function Home() {
  const user = await requireUser();
  const premium = user.tier === "premium";
  const [profiles, watches, coll, found] = await Promise.all([store.ensureStarterProfile(user), store.listWatches(user.id), loadCollection(user), dealsFor(user)]);

  const running = profiles.filter((p) => p.active).slice(0, user.plan.maxProfiles);
  const deals = found.deals.filter((d) => running.some((p) => matches(clampToPlan(p.filters, user.plan), d)));
  const best = withLinks([...deals].sort((a, b) => b.discountPct - a.discountPct).slice(0, 1), "home")[0];
  const hit = watches.filter((w) => w.status === "triggered");
  const closest = [...watches].filter((w) => w.status !== "triggered" && w.lastPrice && targetPrice(w))
    .map((w) => ({ ...w, gap: Math.abs(w.lastPrice - targetPrice(w)) / w.lastPrice }))
    .sort((a, b) => a.gap - b.gap).slice(0, 3);
  const top = [...coll.owned].sort((a, b) => (unitValue(b) ?? 0) * b.quantity - (unitValue(a) ?? 0) * a.quantity).slice(0, 3);
  const prev = [...coll.snapshots].reverse().find((s) => s.day < new Date().toISOString().slice(0, 10));
  const today = prev ? coll.summary.value - prev.value : null;

  const steps = [
    ["Add a few cards to your collection", coll.owned.length > 0, "/app/collection?add=1"],
    ["Set up a deal filter", profiles.some((p) => p.updatedAt > p.createdAt), "/app/deals"],
    ["Set a price alert", watches.length > 0, "/app/watches"],
  ];
  const left = steps.filter((s) => !s[1]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hi{user.name ? `, ${user.name.split(" ")[0]}` : ""}</h1>
          <p>Here&apos;s what&apos;s happening with your cards.</p>
        </div>
      </div>

      {left.length > 0 && (
        <div className="start-here">
          <b>Get set up</b>
          <ol>
            {steps.map(([label, done, href], i) => (
              <li key={label} className={done ? "done" : ""}>
                <span className="start-num">{done ? "✓" : i + 1}</span>
                {done ? <span>{label}</span> : <Link href={href}>{label} →</Link>}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="home-tiles">
        <section className="home-tile">
          <div className="home-tile-head"><span className="home-icon">⚡</span><h2>Deals</h2></div>
          {found.sample ? (
            <>
              <div className="home-big"><span>Example deals</span></div>
              <p className="small muted">Real deals appear here as the deal finder catches them. Here&apos;s the kind of deal your filters would get.</p>
            </>
          ) : (
            <>
              <div className="home-big">{deals.length} <span>{deals.length === 1 ? "deal matches" : "deals match"} your filters</span></div>
              <p className="small muted">{premium ? "You get these live, before the auction ends." : "On Free you see them after they end."}</p>
            </>
          )}
          {best ? <div className="home-deal"><DealTile deal={best} mode={premium && !best.ended ? "live" : "missed"} sample={found.sample} href={best.href} affiliate={best.affiliate} /></div>
            : <p className="muted small">No matches yet. Widen a filter to catch more.</p>}
          <Link href="/app/deals" className="btn primary home-cta">See deals</Link>
        </section>

        <section className="home-tile">
          <div className="home-tile-head"><span className="home-icon">🔔</span><h2>Price alerts</h2></div>
          <div className="home-big">{hit.length} <span>{hit.length === 1 ? "alert hit" : "alerts hit"} your price</span></div>
          <p className="small muted">{watches.length ? `${watches.length} ${watches.length === 1 ? "card" : "cards"} watched for buying or selling.` : "Pick a card and your price. We'll tell you when it gets there."}</p>
          {(hit.length ? hit.slice(0, 3) : closest).map((w) => (
            <Link key={w.id} href={`/app/cards/${w.productId}`} className="home-row">
              <CardThumb item={{ image: w.image, name: w.name, number: w.number, type: w.productType }} width={30} />
              <span className="home-row-text"><b>{w.name.replace(/\s*\(.*\)$/, "")}</b>
                <span className="small muted">{isRising(w) ? "Selling" : "Buying"} at {money(targetPrice(w))} · now {money(w.lastPrice)}</span></span>
              {w.status === "triggered" ? <span className="badge good">Hit</span> : <span className="small muted">{Math.round(w.gap * 100)}% to go</span>}
            </Link>
          ))}
          <Link href="/app/watches" className="btn primary home-cta">{watches.length ? "Price alerts" : "Set a price alert"}</Link>
        </section>

        <section className="home-tile">
          <div className="home-tile-head"><span className="home-icon">▦</span><h2>Collection</h2></div>
          <div className="home-big">{money(coll.summary.value, 0)}</div>
          <p className="small muted">
            {coll.summary.copies} cards & products
            {today !== null && Math.abs(today) >= 1 ? <> · <span className={today >= 0 ? "up" : "down"}>{today >= 0 ? "+" : ""}{money(today, 0)} today</span></> : null}
            {coll.summary.gain !== null ? <> · <span className={coll.summary.gain >= 0 ? "up" : "down"}>{pct(coll.summary.gainPct)}</span> on what you paid</> : null}
          </p>
          {top.map((it) => (
            <Link key={it.id} href={`/app/cards/${it.productId}`} className="home-row">
              <CardThumb item={it} width={30} />
              <span className="home-row-text"><b>{it.name.replace(/\s*\(.*\)$/, "")}</b><span className="small muted">{it.quantity > 1 ? `×${it.quantity}` : "1 copy"}</span></span>
              <span className="small">{money((unitValue(it) ?? 0) * it.quantity, 0)}</span>
            </Link>
          ))}
          {!top.length && <p className="muted small">Track what you own and what it&apos;s worth, free.</p>}
          <Link href={coll.owned.length ? "/app/collection" : "/app/collection?add=1"} className="btn primary home-cta">{coll.owned.length ? "Open collection" : "Add cards"}</Link>
        </section>
      </div>
    </>
  );
}
