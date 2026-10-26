import "server-only";
import { refreshFeatures } from "@/lib/features";
import { and, desc, eq, gt, inArray, lte } from "drizzle-orm";
import { effectiveTier } from "@/lib/access";
import { change, unitValue } from "@/lib/collection";
import { db, schema } from "@/lib/db";
import { recentDeals } from "@/lib/deals";
import { clampToPlan, matches } from "@/lib/filters";
import { log } from "@/lib/log";
import { channelsReady, sendEmail } from "@/lib/notify";
import { planFor } from "@/lib/plans";
import { loadProducts } from "@/lib/portfolio";

// The email recap (Settings -> Email recap): weekly for everyone who leaves it on, daily on Premium. Runs with the
// daily price-alert check. Uses saved values and cached prices only, so it costs no price-service credits.
const { users, collectionItems, portfolioSnapshots, profiles, alertLog } = schema;
const SITE = process.env.AUTH_URL || "https://tcgboogie.com";
const PER_RUN = Number(process.env.RECAPS_PER_RUN || 400); // keeps a big Monday inside the mailbox's daily limit; the rest go tomorrow
const DAY = 86400000;
const money = (v) => `$${Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const pct = (v) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
const short = (n) => String(n || "").replace(/\s*\(.*\)$/, "");

export async function runRecaps(now = new Date()) {
  await refreshFeatures(); // Admin → Features choices
  const out = { due: 0, sent: 0, skipped: 0, failed: 0 };
  if (!db || !channelsReady().email) return out;
  const people = (await db.select().from(users).where(inArray(users.emailRecap, ["weekly", "daily"]))).filter((u) => u.email);
  if (!people.length) return out;

  // Last recap per member, to space them out.
  const last = {};
  for (const r of await db.select({ userId: alertLog.userId, at: alertLog.sentAt }).from(alertLog)
    .where(and(eq(alertLog.kind, "recap"), eq(alertLog.ok, true), gt(alertLog.sentAt, new Date(now - 8 * DAY)))).orderBy(desc(alertLog.sentAt))) {
    last[r.userId] ||= r.at.getTime();
  }
  const monday = now.getUTCDay() === 1;
  const due = people.filter((u) => {
    const daily = u.emailRecap === "daily" && planFor(effectiveTier(u)).emailRecap === "daily";
    const prev = last[u.id];
    if (daily) return !prev || now - prev > 20 * 3600000;
    return prev ? now - prev > 6.5 * DAY : monday; // weekly recaps start on a Monday
  }).slice(0, PER_RUN);
  out.due = due.length;
  if (!due.length) return out;

  const deals = await recentDeals({ days: 7, limit: 1000 });
  for (const user of due) {
    try {
      const daily = user.emailRecap === "daily" && planFor(effectiveTier(user)).emailRecap === "daily";
      const email = await buildRecap(user, daily ? 1 : 7, deals, now);
      if (!email) { out.skipped++; continue; }
      await sendEmail(user.email, email, { userId: user.id, kind: "recap" });
      await db.insert(alertLog).values({ userId: user.id, kind: "recap", channel: "email", title: email.subject, ok: true });
      out.sent++;
    } catch (e) {
      out.failed++;
      await db.insert(alertLog).values({ userId: user.id, kind: "recap", channel: "email", title: "Recap", ok: false, error: String(e.message).slice(0, 300) });
      await log("alerts", "error", `Recap email failed: ${e.message}`, null, user.id);
    }
  }
  await log("alerts", out.failed ? "warn" : "info", `Email recaps: ${out.sent} sent${out.skipped ? `, ${out.skipped} with nothing to report` : ""}${out.failed ? `, ${out.failed} failed` : ""}`, out);
  return out;
}

/** Admin preview: send this member their recap now (weekly unless they're on daily). Returns "sent" or "empty". */
export async function sendRecapPreview(user) {
  const daily = user.emailRecap === "daily" && planFor(effectiveTier(user)).emailRecap === "daily";
  const email = await buildRecap(user, daily ? 1 : 7, await recentDeals({ days: 7, limit: 1000 }), new Date());
  if (!email) return "empty";
  await sendEmail(user.email, { ...email, subject: `[Preview] ${email.subject}` }, { userId: user.id, kind: "recap" });
  return "sent";
}

/** One member's recap email, or null when there's nothing worth sending. */
async function buildRecap(user, days, allDeals, now) {
  const since = new Date(now - days * DAY);
  const tier = effectiveTier(user);
  const plan = planFor(tier);
  const period = days === 1 ? "today" : "this week";
  const lines = [], items = [];
  let stat = null;

  // Collection value: today's saved values vs the last snapshot from before the period.
  const owned = await db.select().from(collectionItems).where(and(eq(collectionItems.userId, user.id), eq(collectionItems.list, "owned")));
  if (owned.length) {
    const value = owned.reduce((s, it) => s + (unitValue(it) || 0) * it.quantity, 0);
    const [then] = await db.select().from(portfolioSnapshots)
      .where(and(eq(portfolioSnapshots.userId, user.id), lte(portfolioSnapshots.day, since.toISOString().slice(0, 10))))
      .orderBy(desc(portfolioSnapshots.day)).limit(1);
    const delta = then?.value ? (value - then.value) / then.value : null;
    const cards = owned.reduce((n, it) => n + it.quantity, 0);
    stat = { label: `Your collection · ${cards.toLocaleString("en-US")} ${cards === 1 ? "card" : "cards"}`, value: money(value),
      change: delta !== null ? `${pct(delta)} ${period === "today" ? "since yesterday" : "this week"}` : "", tone: delta > 0 ? "up" : delta < 0 ? "down" : "" };

    // Biggest movers among raw cards, from cached prices only (no credits).
    const products = await loadProducts([...new Set(owned.filter((it) => it.kind === "raw" || it.kind === "sealed").map((it) => it.productId))], 0);
    const movers = Object.values(products).map((p) => ({ p, c: change(p, days) })).filter((x) => x.c !== null && Math.abs(x.c) >= 0.05)
      .sort((a, b) => Math.abs(b.c) - Math.abs(a.c)).slice(0, 3);
    for (const { p, c } of movers) {
      const now = p.history?.length ? p.history[p.history.length - 1].price : null; // the series change() reads
      items.push({ title: short(p.name), sub: [p.setName, p.number ? `#${p.number}` : ""].filter(Boolean).join(" · "), image: p.image || undefined,
        value: pct(c), tone: c > 0 ? "up" : "down", note: now ? `now ${money(now)}` : "", url: `${SITE}/app/cards/${encodeURIComponent(p.id)}` });
    }
  }

  // Deals that matched this member's filters in the period (Premium got them live; Free sees what they missed).
  const fs = (await db.select().from(profiles).where(and(eq(profiles.userId, user.id), eq(profiles.active, true))))
    .map((r) => clampToPlan(r.filters, planFor("premium")));
  const found = new Date(since);
  const matched = fs.length ? allDeals.filter((d) => new Date(d.foundAt) > found && fs.some((f) => matches(f, d))) : [];
  if (matched.length) {
    const best = [...matched].sort((a, b) => b.discountPct - a.discountPct)[0];
    lines.push(tier === "premium"
      ? `${matched.length} deal${matched.length === 1 ? "" : "s"} matched your filters ${period}. The best: ${best.name} at ${Math.round(best.discountPct)}% below market.`
      : `You missed ${matched.length} deal${matched.length === 1 ? "" : "s"} that matched your filter ${period}, up to ${Math.round(best.discountPct)}% below market. Premium alerts you while you can still bid.`);
  }

  // Price alerts that hit.
  const hits = await db.select({ title: alertLog.title }).from(alertLog).where(and(eq(alertLog.userId, user.id), gt(alertLog.sentAt, since),
    eq(alertLog.ok, true), inArray(alertLog.kind, ["price_buy", "price_sell", "ebay_listing", "sell_high"])));
  const titles = [...new Set(hits.map((h) => h.title.replace(/^\S+\s/, "")))];
  if (titles.length) lines.push(`Alerts ${period}: ${titles.slice(0, 3).join("; ")}${titles.length > 3 ? `, and ${titles.length - 3} more` : ""}.`);

  if (!owned.length && !matched.length && !titles.length) return null;
  const subject = `Your TCG Boogie ${days === 1 ? "daily" : "weekly"} recap`;
  return {
    subject, heading: subject, stat, ...(stat ? { more: lines } : { lines }), items, itemsTitle: items.length ? `Biggest movers ${period}` : undefined,
    button: { label: owned.length ? "Open your collection" : "See deals", url: `${SITE}/app/${owned.length ? "collection" : "deals"}` },
    footer: `You get this ${days === 1 ? "daily" : "weekly"}. Change or turn it off in Settings → Email recap.${tier !== "premium" && matched.length ? ` Premium: ${SITE}/app/premium` : ""}`,
  };
}
