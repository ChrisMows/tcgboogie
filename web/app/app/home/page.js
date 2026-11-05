import Link from "next/link";
import CardThumb from "@/components/CardThumb";
import DealTile from "@/components/DealTile";
import HideValues from "@/components/HideValues";
import HomePromo from "@/components/HomePromo";
import HomeTabs from "@/components/HomeTabs";
import Sparkline from "@/components/Sparkline";
import PerformanceChart from "@/components/PerformanceChart";
import { chartSeries, gradeName, itemLabel, marketChange, money, unitValue } from "@/lib/collection";
import { hasLiveSubscription, trialDaysFor } from "@/lib/billing";
import { withLinks } from "@/lib/deal-links";
import { dealsFor } from "@/lib/deals";
import { clampToPlan, matches } from "@/lib/filters";
import { marketFeed } from "@/lib/market";
import { effectivePlans, planGroups } from "@/lib/plan-copy";
import { PLANS } from "@/lib/plans";
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
// Tiny moves keep two decimals, so -$2 on $9,000 reads -0.02%, not -0.0%.
const pct = (v) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(v !== 0 && Math.abs(v) < 0.001 ? 2 : 1)}%`;
const shortDay = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const cleanName = (s) => String(s || "").replace(/\s*\(.*\)$/, "");

export default async function HomePage({ searchParams }) {
  const user = await requireUser("/app/home");
  const onPremium = user.tier === "premium";
  const asked = (await searchParams)?.view;
  const view = ["performance", "premium", "ultra"].includes(asked) ? asked : "overview";
  const premium = Boolean(user.plan.liveFeed);
  const [c, watches, profiles, found, feed, pushDevices, lastVisit, plans] = await Promise.all([
    loadCollection(user),
    store.listWatches(user.id),
    store.listProfiles(user.id),
    dealsFor(user),
    marketFeed().catch(() => ({ highs: [], big: [], deals: [] })),
    user.demo ? [] : listSubscriptions(user.id).catch(() => []),
    store.lastVisit(user.id, "home").catch(() => null),
    effectivePlans(),
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

  // The cards they own that moved most this week, by dollars (all their copies of it): risers and fallers.
  // change7 is against the price 7 days ago, so the dollar move is today's price less that one.
  const moving = c.owned.filter((it) => it.change7 !== null && Math.abs(it.change7) >= 0.005 && unitValue(it) !== null)
    .map((it) => ({ ...it, dollars: (unitValue(it) - unitValue(it) / (1 + it.change7)) * (it.quantity || 1) }));
  const risers = moving.filter((m) => m.dollars > 0).sort((a, b) => b.dollars - a.dollars).slice(0, 3);
  const fallers = moving.filter((m) => m.dollars < 0).sort((a, b) => a.dollars - b.dollars).slice(0, 3);

  // Market: caught deals, new highs and big sales, newest first in each (the feed itself is sorted by size, so its top
  // items stay the same for days), mixed so each kind shows.
  const newest = (list) => [...list].sort((a, b) => String(b.soldAt || "").localeCompare(String(a.soldAt || "")));
  const lists = [newest(feed.deals), newest(feed.highs), newest(feed.big)];
  const market = [];
  for (let i = 0; market.length < 9 && i < 9; i++) for (const list of lists) if (list[i] && market.length < 9) market.push(list[i]);

  const latest = RELEASES[0];
  const hasCards = c.owned.length > 0;
  const since = lastVisit ? `since ${shortDay(lastVisit)}` : "this week";

  return (
    <>
      <h1 className="sr-only">Home</h1>

      <HomeTabs
        initial={view}
        locked={!user.plan.collectionPerformance}
        header={(
          <>
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
          </>
        )}
        overview={(
          <>
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
                <div className="home-head"><h2>📈 Your movers this week</h2><Link href="/app/collection/movers">See all</Link></div>
                <div className="home-movers">
                  {[["Up", risers], ["Down", fallers]].filter(([, list]) => list.length).map(([label, list]) => (
                    <div key={label} className="panel home-list">
                      <div className="small muted">{label}</div>
                      {list.map((it) => (
                        <Link key={it.id} href={`/app/cards/${it.productId}`} className="mini-row">
                          <CardThumb item={it} width={34} />
                          <span className="mini-text"><b>{cleanName(it.name)}</b><span className="small muted">{it.quantity > 1 ? `${it.quantity}× · ` : ""}{itemLabel(it)}</span></span>
                          <span className="home-move">
                            <b className="small sensitive">{money(unitValue(it) * (it.quantity || 1))}</b>
                            <span className={`small sensitive ${it.dollars >= 0 ? "up" : "down"}`}>{it.dollars >= 0 ? "▲" : "▼"} {money(Math.abs(it.dollars))} ({pct(it.change7)})</span>
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
                          <span className="small home-market-name">{[x.grader ? gradeName(x.grader, x.grade) : null, x.name].filter(Boolean).join(" · ")}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {latest && (
              <section className="home-section">
                <div className="home-head"><h2>✨ What&apos;s new</h2><Link href="/updates">All updates</Link></div>
                <Link href="/updates" className="home-new small">
                  <span className="badge accent">New</span> v{latest.version}: {latest.title} →
                </Link>
              </section>
            )}
          </>
        )}
        performance={<Performance c={c} hasCards={hasCards} historyDays={user.plan.collectionPerformance ? null : user.plan.collectionHistoryDays} />}
        premium={<PremiumTab plans={plans} onPremium={onPremium} onUltra={user.plan.key === "ultra"} trial={trialDaysFor(user)} missed={premium ? 0 : mine.length} watches={watches.length} />}
        ultra={<UltraTab plans={plans} onUltra={user.plan.key === "ultra"} subscribed={hasLiveSubscription(user)} trial={trialDaysFor(user)} />}
      />
    </>
  );
}

// Performance (Premium; Free members see it blurred behind an invitation, components/HomeTabs.js): the all-time value
// chart with what they paid, returns for each range, profit on what they paid, best and worst cards since they bought
// them, the most valuable cards and how the value splits between raw, graded and sealed.
const RANGE_ROWS = [[1, "1 day"], [7, "7 days"], [30, "30 days"], [90, "90 days"], [365, "1 year"], [0, "All time"]];
const held = (it) => unitValue(it) * (it.quantity || 1);

/** A return card's small line with a fill under it, in the card's color. */
function RetLine({ points, up, id }) {
  if (points.length < 2) return <span className="ret-line" />;
  const W = 140, H = 56, min = Math.min(...points), max = Math.max(...points), span = max - min || 1;
  const d = points.map((v, i) => `${i ? "L" : "M"}${((i / (points.length - 1)) * W).toFixed(1)},${(H - 4 - ((v - min) / span) * (H - 8)).toFixed(1)}`).join(" ");
  const color = up ? "#d3ff66" : "#f85149";
  return (
    <svg className="ret-line sensitive" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`ret-fill-${id}`} x2="0" y2="1">
          <stop stopColor={color} stopOpacity=".28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${W},${H} L0,${H} Z`} fill={`url(#ret-fill-${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

function Row({ it, children }) {
  return (
    <Link href={`/app/cards/${it.productId}`} className="mini-row">
      <CardThumb item={it} width={34} />
      <span className="mini-text"><b>{cleanName(it.name)}</b><span className="small muted">{it.quantity > 1 ? `${it.quantity}× · ` : ""}{itemLabel(it)}</span></span>
      <span className="home-move">{children}</span>
    </Link>
  );
}

function Performance({ c, hasCards, historyDays }) {
  if (!hasCards) {
    return <div className="panel empty-state">Add cards and we chart how your collection performs: its value over time, profit on what you paid, and your best and worst cards.</div>;
  }
  const changes = Object.fromEntries(RANGE_ROWS.map(([d]) => [d, marketChange(c.owned, c.snapshots, d || null)]));
  const priced = c.owned.filter((it) => unitValue(it) !== null);
  const bought = priced.filter((it) => it.purchasePrice > 0).map((it) => {
    const gain = (unitValue(it) - it.purchasePrice) * (it.quantity || 1);
    return { ...it, gain, gainPct: gain / (it.purchasePrice * (it.quantity || 1)) };
  });
  const best = bought.filter((b) => b.gain > 0).sort((a, b) => b.gain - a.gain).slice(0, 3);
  const worst = bought.filter((b) => b.gain < 0).sort((a, b) => a.gain - b.gain).slice(0, 3);
  const top = [...priced].sort((a, b) => held(b) - held(a)).slice(0, 5);
  const total = priced.reduce((t, it) => t + held(it), 0) || 1;
  const kinds = [["raw", "Raw cards"], ["graded", "Graded"], ["sealed", "Sealed"]]
    .map(([k, label]) => ({ k, label, value: priced.filter((it) => it.kind === k).reduce((t, it) => t + held(it), 0) })).filter((x) => x.value > 0);
  const { summary } = c;
  const signed = (v) => `${v >= 0 ? "+" : "−"}${money(Math.abs(v))}`;
  const costed = c.owned.filter((it) => it.purchasePrice !== null && it.purchasePrice !== undefined).length;
  const allSince = changes[0]?.since || null;
  // A range shows when the history reaches back that far (and isn't the same day as All time); All time always shows.
  const first = c.snapshots.filter((p) => p.value > 0).map((p) => p.day).sort()[0];
  const reaches = (d) => first && first <= new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
  // Each range's line, price moves only like its figure: the saved daily values from the range's start, less what the
  // cards added since then are worth (so a card bought mid-range doesn't read as a jump).
  const line = (since) => {
    const start = new Date(`${since}T23:59:59.999Z`).getTime();
    const later = c.owned.filter((it) => new Date(it.createdAt).getTime() > start && unitValue(it) !== null)
      .map((it) => ({ at: new Date(it.createdAt).getTime(), value: held(it) }));
    return c.snapshots.filter((p) => p.value > 0 && p.day >= since).sort((a, b) => a.day.localeCompare(b.day)).map((p) => {
      const end = new Date(`${p.day}T23:59:59.999Z`).getTime();
      return p.value - later.filter((x) => x.at <= end).reduce((t, x) => t + x.value, 0);
    });
  };
  const ranges = RANGE_ROWS.map(([d, label]) => ({ d, label, ch: changes[d] }))
    .filter((r) => r.ch && (r.d === 0 || (reaches(r.d) && r.ch.since !== allSince)))
    .map((r) => ({ ...r, line: line(r.ch.since) }));

  return (
    <>
      <PerformanceChart points={chartSeries(c.snapshots, historyDays)} summary={summary} changes={changes} historyDays={historyDays} />

      {/* Returns: a card per range the history covers, with its price-only line. */}
      <section className="home-section">
        <div className="home-head home-head-note"><h2>Returns</h2><span className="small muted">Market price changes only.</span></div>
        <div className="ret-cards">
          {ranges.map(({ d, label, ch, line: pts }) => {
            const up = ch.change >= 0;
            return (
              <div key={d} className={`panel ret-card ${up ? "up" : "down"}`}>
                <span className="ret-label">{label}</span>
                <span className="ret-arrow" aria-hidden="true">{up ? "↗" : "↘"}</span>
                <b className="ret-amount sensitive">{signed(ch.change)}</b>
                <span className="ret-pill">{pct(ch.pct)}</span>
                <RetLine points={pts} up={up} id={d} />
              </div>
            );
          })}
        </div>
        <p className="hint">Newly added cards are excluded from returns.{allSince ? ` All time is since ${shortDay(allSince)}.` : ""}</p>
      </section>

      {/* Profit: the number, then what they paid against what those cards are worth now, as two bars. */}
      <section className="home-section">
        <div className="home-head"><h2>Profit on what you paid</h2></div>
        {summary.cost > 0 ? (
          <div className="panel home-profit">
            <div className="home-profit-head">
              <b className={`home-profit-num sensitive ${summary.gain >= 0 ? "up" : "down"}`}>{signed(summary.gain)}</b>
              <span className={`small ${summary.gain >= 0 ? "up" : "down"}`}>{pct(summary.gainPct)} on what you paid</span>
            </div>
            <div className="home-bars">
              {[["You paid", summary.cost, "paid"], ["Worth now", summary.cost + summary.gain, summary.gain >= 0 ? "up" : "down"]].map(([label, v, cls]) => (
                <div key={label} className="home-bar-row">
                  <span className="small muted">{label}</span>
                  <span className="home-bar"><i className={cls} style={{ width: `${Math.max(2, (v / Math.max(summary.cost, summary.cost + summary.gain)) * 100)}%` }} /></span>
                  <b className="small sensitive">{money(v)}</b>
                </div>
              ))}
            </div>
            <p className="hint" style={{ margin: 0 }}>From the {costed} of your {c.owned.length} cards with a price paid. Add the rest from Edit in your collection.</p>
          </div>
        ) : <div className="panel small muted">Add what you paid for your cards (Edit on any card in your collection) and we work out your profit, card by card.</div>}
        {(best.length > 0 || worst.length > 0) && (
          <div className="home-movers" style={{ marginTop: 14 }}>
            {[["Best since you bought", best], ["Worst since you bought", worst]].filter(([, list]) => list.length).map(([label, list]) => (
              <div key={label} className="panel home-list">
                <div className="small muted">{label}</div>
                {list.map((it) => (
                  <Row key={it.id} it={it}>
                    <b className="small sensitive">{money(held(it))}</b>
                    <span className={`small sensitive ${it.gain >= 0 ? "up" : "down"}`}>{signed(it.gain)} ({pct(it.gainPct)})</span>
                  </Row>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="home-section">
        <div className="home-head"><h2>Most valuable</h2><Link href="/app/collection">View all</Link></div>
        <div className="panel home-list">
          {top.map((it) => (
            <Row key={it.id} it={it}>
              <b className="small sensitive">{money(held(it))}</b>
              {it.change7 !== null && <span className={`small ${it.change7 >= 0 ? "up" : "down"}`}>{pct(it.change7)} this week</span>}
            </Row>
          ))}
        </div>
      </section>

      {kinds.length > 1 && (
        <section className="home-section">
          <div className="home-head"><h2>What it&apos;s made of</h2></div>
          <div className="panel">
            <div className="home-split" aria-hidden="true">{kinds.map((x) => <span key={x.k} className={x.k} style={{ width: `${(x.value / total) * 100}%` }} />)}</div>
            <div className="home-split-key">
              {kinds.map((x) => (
                <span key={x.k} className="small"><i className={x.k} /> {x.label} <b className="sensitive">{money(x.value)}</b> <span className="muted">{Math.round((x.value / total) * 100)}%</span></span>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

// The Premium tab: what changes with Premium, from the plans as Admin → Features left them (lib/plan-copy.js). Not on
// Premium: their own numbers where we have them and a button to the Premium page to join. On Premium: what they have,
// and a link to billing.
function PremiumTab({ plans, onPremium, onUltra, trial, missed, watches }) {
  const price = PLANS.premium.price;
  const rows = planGroups(plans).flatMap((g) => g.rows.filter(([, free, prem]) => free !== prem).map((r) => [g.group, ...r]));
  const join = (
    <Link href="/app/premium?from=home#enroll" className="btn primary home-join">
      {trial > 0 ? `Start your ${trial}-day free trial` : `Join Premium · $${price}/month`}
    </Link>
  );
  if (onPremium) {
    return (
      <>
        <div className="panel home-premium-hero">
          <div className="eyebrow-sm">TCG BOOGIE PREMIUM</div>
          <h2>{onUltra ? "Ultra includes all of Premium" : <>You&apos;re on Premium 🎉</>}</h2>
          <p className="muted">Every deal reaches you live, while you can still bid. Here&apos;s everything {onUltra ? "Premium" : "your plan"} adds over Free.</p>
          <Link href="/app/account#billing" className="btn">Billing</Link>
        </div>
        <PlanRows rows={rows} />
      </>
    );
  }
  const yours = [
    missed > 0 && `Your deal filters caught ${missed} ${missed === 1 ? "deal" : "deals"} this week. You saw ${missed === 1 ? "it" : "them"} after the auction ended; on Premium they reach you live, while you can still bid.`,
    plans.free.maxPriceWatches !== null && watches >= plans.free.maxPriceWatches && `You're using ${watches} of ${plans.free.maxPriceWatches} price ${plans.free.maxPriceWatches === 1 ? "alert" : "alerts"}. Premium has room for ${plans.premium.maxPriceWatches === null ? "as many as you like" : plans.premium.maxPriceWatches}.`,
  ].filter(Boolean);

  return (
    <>
      <div className="panel home-premium-hero">
        <div className="eyebrow-sm">TCG BOOGIE PREMIUM</div>
        <h2>Get every deal while you can still bid</h2>
        <p className="muted">Live deal alerts the moment an underpriced auction is found, instant push alerts, your collection&apos;s full performance, and more of everything.</p>
        <div className="home-premium-price"><b>${price}</b><span className="muted">/month plus tax · cancel anytime</span></div>
        {join}
        {trial > 0 && <p className="hint" style={{ margin: "8px 0 0" }}>$0 today. We email you 3 days before your first charge.</p>}
      </div>

      {yours.length > 0 && (
        <section className="home-section">
          <div className="home-head"><h2>What you&apos;re missing</h2></div>
          <div className="panel home-list">
            {yours.map((t) => <p key={t} className="home-yours">{t}</p>)}
          </div>
        </section>
      )}

      <PlanRows rows={rows} />

      <div className="home-premium-foot">
        {join}
        <span className="small muted">Your collection and settings stay the same whichever plan you&apos;re on.</span>
      </div>
    </>
  );
}

// The Ultra tab: what Ultra adds over Premium. On Ultra: what they have. Otherwise a button to the Ultra page (which
// offers a subscriber the upgrade and everyone else checkout).
function UltraTab({ plans, onUltra, subscribed, trial }) {
  const price = plans.ultra.price;
  const rows = [
    ["Everything in Premium", "✓", "✓"],
    ["Grade & Flip: cards worth buying raw to grade, scored 1 to 10 on profit, risk and demand", "—", "✓"],
    ["More tools for flipping cards", "—", "Coming soon"],
  ];
  const table = (
    <section className="home-section">
      <div className="home-head"><h2>What changes with Ultra</h2></div>
      <div className="panel home-compare">
        <div className="home-compare-row head"><span /><span className="small muted">Premium</span><span className="small home-ultra-word">Ultra</span></div>
        {rows.map(([what, prem, ultra]) => (
          <div key={what} className="home-compare-row">
            <span className="small">{what}</span>
            <span className="small muted">{prem}</span>
            <b className="small">{ultra}</b>
          </div>
        ))}
      </div>
    </section>
  );
  if (onUltra) {
    return (
      <>
        <div className="panel home-premium-hero home-ultra-hero">
          <div className="eyebrow-sm">TCG BOOGIE ULTRA</div>
          <h2>You&apos;re on Ultra 🎉</h2>
          <p className="muted">Everything in Premium, plus Grade &amp; Flip: raw cards selling far below their graded price, scored 1 to 10 on profit, risk and demand.</p>
          <div className="row" style={{ gap: 8, justifyContent: "center" }}>
            <Link href="/app/grade-and-flip" className="btn primary">Open Grade &amp; Flip</Link>
            <Link href="/app/account#billing" className="btn">Billing</Link>
          </div>
        </div>
        {table}
      </>
    );
  }
  const offer = trial > 0 && !subscribed;
  return (
    <>
      <div className="panel home-premium-hero home-ultra-hero">
        <div className="eyebrow-sm">TCG BOOGIE ULTRA</div>
        <h2>Find cards worth flipping</h2>
        <p className="muted">Grade &amp; Flip ranks raw cards selling far below their graded price, after grading fees and shipping. Everything in Premium is included, and more flipping tools are on the way.</p>
        <div className="home-premium-price"><b>${price}</b><span className="muted">/month plus tax · cancel anytime</span></div>
        <Link href="/app/ultra?from=grading-finder#enroll" className="btn primary home-join">
          {subscribed ? "Upgrade to Ultra" : offer ? `Start your ${trial}-day free trial` : `Join Ultra · $${price}/month`}
        </Link>
        {subscribed && <p className="hint" style={{ margin: "8px 0 0" }}>You pay just the difference for the rest of this billing month.</p>}
        {offer && <p className="hint" style={{ margin: "8px 0 0" }}>$0 today. We email you 3 days before your first charge.</p>}
      </div>
      {table}
    </>
  );
}

function PlanRows({ rows }) {
  return (
    <section className="home-section">
      <div className="home-head"><h2>What changes with Premium</h2></div>
      <div className="panel home-compare">
        <div className="home-compare-row head"><span /><span className="small muted">Free</span><span className="small home-premium-word">Premium</span></div>
        {rows.map(([group, what, free, prem]) => (
          <div key={`${group}-${what}`} className="home-compare-row">
            <span className="small">{what}</span>
            <span className="small muted">{free}</span>
            <b className="small">{prem}</b>
          </div>
        ))}
      </div>
    </section>
  );
}
