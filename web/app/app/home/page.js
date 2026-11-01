import Link from "next/link";
import CardThumb from "@/components/CardThumb";
import DealTile from "@/components/DealTile";
import HideValues from "@/components/HideValues";
import HomePromo from "@/components/HomePromo";
import Sparkline from "@/components/Sparkline";
import { itemLabel, marketChange, money, unitValue } from "@/lib/collection";
import { withLinks } from "@/lib/deal-links";
import { dealsFor } from "@/lib/deals";
import { clampToPlan, matches } from "@/lib/filters";
import { marketFeed } from "@/lib/market";
import { loadCollection } from "@/lib/portfolio";
import { listSubscriptions } from "@/lib/push";
import { RELEASES } from "@/lib/release-notes";
import { requireUser } from "@/lib/session";
import * as store from "@/lib/store";

export const metadata = { title: "Home" };

// The member area's front page: everything that changed for this member in one place (collection value, deals their
// filters caught, price alerts that hit, their cards that moved, the market), with a way into each part of the app.
// It reads the same saved prices as the Collection page plus the 15-minute market cache: no extra price service or eBay
// calls, since it's opened all day.
const pct = (v) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
const shortDay = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const cleanName = (s) => String(s || "").replace(/\s*\(.*\)$/, "");

export default async function HomePage() {
  const user = await requireUser("/app/home");
  const premium = Boolean(user.plan.liveFeed);
  const [c, watches, profiles, found, feed, pushDevices, lastVisit] = await Promise.all([
    loadCollection(user),
    store.listWatches(user.id),
    store.listProfiles(user.id),
    dealsFor(user),
    marketFeed().catch(() => ({ highs: [], big: [], deals: [] })),
    user.demo ? [] : listSubscriptions(user.id).catch(() => []),
    store.lastVisit(user.id, "home").catch(() => null),
  ]);

  // Collection value: today's change, since the last visit (when that was before yesterday), and the last 30 days.
  const day = marketChange(c.owned, c.snapshots, 1);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const sinceVisit = lastVisit && lastVisit < yesterday ? marketChange(c.owned, c.snapshots, null, new Date(), lastVisit) : null;
  const spark = [...c.snapshots].sort((a, b) => String(a.day).localeCompare(String(b.day))).slice(-30).map((s) => ({ price: s.value }));

  // Deals their running filters caught. Premium: live ones first (ending soonest). Free: after they ended.
  const running = profiles.filter((p) => p.active).slice(0, user.plan.maxProfiles);
  const mine = found.sample ? [] : found.deals.filter((d) => running.some((p) => matches(clampToPlan(p.filters, user.plan), d)));
  const live = mine.filter((d) => !d.ended).sort((a, b) => (a.minutesLeft ?? 0) - (b.minutesLeft ?? 0));
  const ended = mine.filter((d) => d.ended).sort((a, b) => String(b.endsAt).localeCompare(String(a.endsAt)));
  const shownDeals = found.sample ? found.deals.slice(0, 3) : (live.length ? live : ended).slice(0, 3);
  const newDeals = lastVisit ? mine.filter((d) => String(d.foundAt).slice(0, 10) >= lastVisit).length : mine.length;

  const hits = watches.filter((w) => w.status === "triggered")
    .sort((a, b) => new Date(b.triggeredAt || 0) - new Date(a.triggeredAt || 0));

  // The cards they own that moved most this week, by dollars: risers and fallers.
  const moving = c.owned.filter((it) => it.change7 !== null && Math.abs(it.change7) >= 0.005 && unitValue(it) !== null)
    .map((it) => ({ it, dollars: it.change7 * unitValue(it) * (it.quantity || 1) }));
  const risers = moving.filter((m) => m.dollars > 0).sort((a, b) => b.dollars - a.dollars).slice(0, 3).map((m) => m.it);
  const fallers = moving.filter((m) => m.dollars < 0).sort((a, b) => a.dollars - b.dollars).slice(0, 3).map((m) => m.it);

  // Market: caught deals, new highs and big sales, mixed so each kind shows.
  const market = [];
  for (let i = 0; market.length < 9 && i < 9; i++) for (const list of [feed.deals, feed.highs, feed.big]) if (list[i] && market.length < 9) market.push(list[i]);

  const latest = RELEASES[0];
  const hasCards = c.owned.length > 0;
  const since = lastVisit ? `since ${shortDay(lastVisit)}` : "this week";

  return (
    <>
      <h1 className="sr-only">Home</h1>

      {/* Collection value, with a 30-day line. Tapping it opens the collection. */}
      {hasCards ? (
        <Link href="/app/collection" className="panel home-value">
          <div>
            <div className="small muted">Collection value</div>
            <div className="home-value-row">
              <b className="home-value-num sensitive">{money(c.summary.value)}</b>
              <HideValues className="icon-only" />
            </div>
            {day ? (
              <div className={`small sensitive ${day.change >= 0 ? "up" : "down"}`}>
                {day.change >= 0 ? "▲" : "▼"} {money(Math.abs(day.change))} ({pct(day.pct)}) <span className="muted">today</span>
              </div>
            ) : <div className="small muted">Your day-to-day change shows from tomorrow.</div>}
            {sinceVisit && sinceVisit.since !== day?.since && (
              <div className={`small sensitive ${sinceVisit.change >= 0 ? "up" : "down"}`}>
                {sinceVisit.change >= 0 ? "▲" : "▼"} {money(Math.abs(sinceVisit.change))} ({pct(sinceVisit.pct)}) <span className="muted">since your last visit</span>
              </div>
            )}
          </div>
          <div className="home-spark sensitive"><Sparkline points={spark} width={150} height={52} /></div>
        </Link>
      ) : (
        <div className="panel home-value empty">
          <div>
            <b>Start your collection</b>
            <p className="small muted" style={{ margin: "4px 0 0" }}>Add the cards you own and see what they&apos;re worth, updated every day.</p>
          </div>
          <Link href="/app/collection?add=1" className="btn primary">Add cards</Link>
        </div>
      )}

      <nav className="home-actions" aria-label="Quick actions">
        <Link href="/app/collection?add=1"><span aria-hidden="true">＋</span>Add cards</Link>
        <Link href="/app/collection/photo"><span aria-hidden="true">📷</span>Scan cards</Link>
        <Link href="/app/watches"><span aria-hidden="true">🔔</span>Price alert</Link>
        <Link href="/app/deals"><span aria-hidden="true">⚡</span>Deal filter</Link>
      </nav>

      <HomePromo
        canPush={!user.demo && user.plan.watchAlertChannels.includes("push")}
        pushOn={Boolean(user.alertWebPush && pushDevices.length)}
        premium={user.tier === "premium"}
      />

      {/* Price alerts that hit. */}
      {hits.length > 0 && (
        <section className="home-section">
          <div className="home-head"><h2>🔔 Price alerts that hit</h2><Link href="/app/watches">See all</Link></div>
          <div className="panel home-list">
            {hits.slice(0, 3).map((w) => (
              <Link key={w.id} href={`/app/cards/${w.productId}`} className="mini-row">
                <CardThumb item={{ image: w.image, name: w.name, number: w.number, productType: w.productType }} width={34} />
                <span className="mini-text"><b>{cleanName(w.name)}</b><span className="small muted">{w.setName || ""}</span></span>
                <span className="small">{w.lastPrice ? money(w.lastPrice) : ""}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Deals their filters caught. */}
      <section className="home-section">
        <div className="home-head">
          <h2>⚡ {premium && live.length ? "Live deals for you" : "Deals your filters caught"}</h2>
          <Link href={premium ? "/app/deals" : "/app/deals?tab=history"}>See all</Link>
        </div>
        {!found.sample && (
          <p className="small muted home-sub">
            {newDeals > 0 ? `${newDeals} new ${since}.` : running.length ? `Nothing new ${since}.` : "Turn on a deal filter and we'll catch underpriced eBay auctions for you."}
            {!premium && newDeals > 0 ? " On Premium you get them live, while you can still bid." : ""}
          </p>
        )}
        {shownDeals.length ? (
          <div className="home-deals">
            {withLinks(shownDeals, "home").map((d) => <DealTile key={d.id} deal={d} mode={premium ? "live" : "missed"} href={d.href} affiliate={d.affiliate} cardHref={d.cardHref} sample={found.sample} />)}
          </div>
        ) : (
          <div className="panel empty-state small">
            {running.length ? "No deals matched your filters this week. Try widening one." : <Link href="/app/deals">Set up a deal filter →</Link>}
          </div>
        )}
        {!premium && <Link href="/app/premium?from=home" className="btn sm primary" style={{ marginTop: 10 }}>Get deals live with Premium</Link>}
      </section>

      {/* Their cards that moved most this week. */}
      {(risers.length > 0 || fallers.length > 0) && (
        <section className="home-section">
          <div className="home-head"><h2>📈 Your movers this week</h2><Link href="/app/collection">Collection</Link></div>
          <div className="home-movers">
            {[["Up", risers], ["Down", fallers]].filter(([, list]) => list.length).map(([label, list]) => (
              <div key={label} className="panel home-list">
                <div className="small muted">{label}</div>
                {list.map((it) => (
                  <Link key={it.id} href={`/app/cards/${it.productId}`} className="mini-row">
                    <CardThumb item={it} width={34} />
                    <span className="mini-text"><b>{cleanName(it.name)}</b><span className="small muted">{itemLabel(it)}</span></span>
                    <span className="home-move">
                      <b className="small sensitive">{money(unitValue(it))}</b>
                      <span className={`small ${it.change7 >= 0 ? "up" : "down"}`}>{it.change7 >= 0 ? "▲" : "▼"} {pct(it.change7)}</span>
                    </span>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* The market: what sold on eBay, from the sales the deal bot watched end (lib/market.js). */}
      {market.length > 0 && (
        <section className="home-section">
          <div className="home-head"><h2>💰 Market today</h2><Link href="/sales">Market Movers</Link></div>
          <ul className="home-market">
            {market.map((x) => {
              const thumb = x.grader ? { kind: "graded", grader: x.grader, grade: x.grade, image: x.image, name: x.name, number: x.number } : { image: x.image, name: x.name, number: x.number };
              return (
                <li key={x.id}>
                  <Link href={x.productId ? `/app/cards/${x.productId}` : `/sales#${x.kind === "deal" ? "deals" : x.kind === "high" ? "highs" : "big"}`}>
                    <CardThumb item={thumb} width={96} />
                    <span className={`sale-kicker ${x.kind}`}>{x.kind === "high" ? "📈 New high" : x.kind === "deal" ? `⚡ ${x.off}% under` : "💰 Big sale"}</span>
                    <b>{money(x.price, 0)}</b>
                    <span className="small home-market-name">{[x.grader ? `${x.grader} ${x.grade}` : null, x.name].filter(Boolean).join(" · ")}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {latest && (
        <Link href="/updates" className="home-new small">
          <span className="badge accent">New</span> v{latest.version}: {latest.title} →
        </Link>
      )}
    </>
  );
}
