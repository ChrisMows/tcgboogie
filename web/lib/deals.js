import "server-only";
import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { effectiveTier } from "@/lib/access";
import { db, schema } from "@/lib/db";
import { SAMPLE_DEALS } from "@/lib/demo-deals";
import { ALERT_CHANNELS, clampToPlan, matches, RAW_CONDITIONS } from "@/lib/filters";
import { log } from "@/lib/log";
import { channelsReady, sendDiscordDM, sendEmail, sendSms } from "@/lib/notify";
import { planFor } from "@/lib/plans";

// Real deals from the deal bot (see the `deal` table). Until the bot has found any, pages show the sample deals,
// clearly labeled as examples.
const { deals, profiles, users, accounts, alertLog } = schema;
const SITE = process.env.AUTH_URL || "https://tcgboogie.com";
const DAY = 86400000;
const money = (v) => `$${Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

function toDeal(row, now = Date.now()) {
  const left = (row.endsAt.getTime() - now) / 60000;
  return {
    ...row.data,
    id: row.id,
    endsAt: row.endsAt.toISOString(),
    foundAt: row.foundAt.toISOString(),
    minutesLeft: left > 0 ? Math.max(1, Math.round(left)) : null,
    ended: left <= 0,
    lastBid: row.lastPrice ?? row.data.total,
    soldFor: null, // eBay doesn't share final prices; tiles show the last bid we saw
  };
}

/** One deal by its eBay item id (for the card page's deal box), or null. */
export async function getDeal(id) {
  if (!db || !id) return null;
  const [row] = await db.select().from(deals).where(eq(deals.id, String(id).slice(0, 80))).limit(1);
  return row ? toDeal(row) : null;
}

/** Deals found in the last `days` (live and ended), newest first. */
export async function recentDeals({ days = 7, limit = 300 } = {}) {
  if (!db) return [];
  // Deals the photo check found to be a different card are never shown.
  const rows = await db.select().from(deals).where(and(gt(deals.endsAt, new Date(Date.now() - days * DAY)),
    sql`coalesce(${deals.data}->>'photoCheck', '') <> 'different_card'`))
    .orderBy(desc(deals.endsAt)).limit(limit);
  return rows.map((r) => toDeal(r));
}

/**
 * The deals a member's pages work with: Premium gets live and ended deals, Free only ended ones ("the deals you
 * missed"). `sample` is true when the bot hasn't found anything recently and the examples are shown instead.
 */
export async function dealsFor(user) {
  const all = user?.demo ? [] : await recentDeals();
  if (!all.length) return { deals: SAMPLE_DEALS, sample: true };
  const premium = user.tier === "premium";
  return { deals: premium ? all : all.filter((d) => d.ended), sample: false };
}

/** The deals we alerted this member about, newest first (Premium "History"). */
export async function sentDeals(userId, limit = 60) {
  if (!db) return [];
  const rows = await db.selectDistinctOn([deals.id], { deal: deals, sentAt: alertLog.sentAt }).from(alertLog)
    .innerJoin(deals, eq(deals.id, alertLog.dealId))
    .where(and(eq(alertLog.userId, userId), isNotNull(alertLog.dealId), eq(alertLog.ok, true)))
    .orderBy(deals.id, desc(alertLog.sentAt)).limit(limit * 3);
  return rows.sort((a, b) => b.sentAt - a.sentAt).slice(0, limit).map((r) => toDeal(r.deal));
}

/**
 * What the bot should scan for: as wide as the loosest running filter (each clamped to its owner's plan).
 * The bot asks for this before its checks, so it never spends eBay calls or price credits on deals nobody gets.
 */
export async function scanSettings() {
  if (!db) return { profiles: 0 };
  const rows = await db.select({ filters: profiles.filters, user: users }).from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId)).where(eq(profiles.active, true));
  const fs = rows.map((r) => clampToPlan(r.filters, planFor(effectiveTier(r.user))));
  if (!fs.length) return { profiles: 0 };
  const rawFs = fs.filter((f) => f.cardTypes.includes("raw"));
  return {
    profiles: fs.length,
    minDiscountPct: Math.min(...fs.map((f) => f.minDiscountPct)),
    maxMinutesLeft: Math.max(...fs.map((f) => f.maxMinutesLeft)),
    minMarketValue: Math.min(...fs.map((f) => f.minMarketValue)),
    minGrade: Math.min(...fs.map((f) => f.minGrade)),
    graders: [...new Set(fs.flatMap((f) => f.graders))].sort(),
    languages: [...new Set(fs.flatMap((f) => f.languages))].sort(),
    cardTypes: [...new Set(fs.flatMap((f) => f.cardTypes))].sort(),
    // Loosest raw condition anyone accepts (LP or better < MP or better ...).
    minRawCondition: rawFs.length ? rawFs.map((f) => f.minRawCondition).sort((a, b) => RAW_CONDITIONS.indexOf(b) - RAW_CONDITIONS.indexOf(a))[0] : "NM",
  };
}

/**
 * Send live alerts for new deals. Each deal is claimed once (so two calls at the same time can't double-send), then
 * every Premium member whose running filter matches gets it on their channels. Safe to call often.
 */
export async function dispatchDeals() {
  const out = { deals: 0, members: 0, sent: 0, failed: 0 };
  if (!db) return out;
  const claimed = await db.update(deals).set({ dispatchedAt: new Date() })
    .where(and(isNull(deals.dispatchedAt), gt(deals.endsAt, new Date()))).returning();
  // Anything that ended before we got to it is simply never alerted.
  await db.update(deals).set({ dispatchedAt: new Date() }).where(and(isNull(deals.dispatchedAt), lt(deals.endsAt, new Date())));
  if (!claimed.length) return out;
  out.deals = claimed.length;

  const rows = await db.select({ profile: profiles, user: users }).from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId)).where(eq(profiles.active, true));
  const live = rows.filter((r) => effectiveTier(r.user) === "premium"); // Free members see deals after they end
  if (!live.length) return out;
  const userIds = [...new Set(live.map((r) => r.user.id))];
  const discordIds = Object.fromEntries((await db.select({ userId: accounts.userId, id: accounts.providerAccountId }).from(accounts)
    .where(and(inArray(accounts.userId, userIds), eq(accounts.provider, "discord")))).map((a) => [a.userId, a.id]));
  const ready = channelsReady();

  for (const row of claimed) {
    const d = toDeal(row);
    // One alert per member per deal, even if several of their filters match.
    // If several of a member's filters match, they get one alert, on every channel those filters chose.
    const who = new Map();
    for (const r of live) {
      const f = clampToPlan(r.profile.filters, planFor("premium"));
      if (!matches(f, d)) continue;
      const w = who.get(r.user.id) || { user: r.user, filter: r.profile.name, channels: new Set() };
      for (const c of f.channels || ALERT_CHANNELS) w.channels.add(c);
      who.set(r.user.id, w);
    }
    for (const { user, filter, channels } of who.values()) {
      out.members++;
      const r = await alertMember(user, discordIds[user.id], d, filter, ready, channels);
      out.sent += r.sent; out.failed += r.failed;
    }
  }
  await log("alerts", out.failed ? "warn" : "info",
    `Deal alerts: ${out.deals} new deal${out.deals === 1 ? "" : "s"}, ${out.members} member match${out.members === 1 ? "" : "es"}, ${out.sent} sent${out.failed ? `, ${out.failed} failed` : ""}`, out);
  return out;
}

async function alertMember(user, discordId, d, filterName, ready, chosen = new Set(ALERT_CHANNELS)) {
  // A channel is used if the plan includes it, the filter chose it, and it's switched on in Settings.
  const allowed = planFor("premium").watchAlertChannels.filter((c) => chosen.has(c));
  const grade = d.kind === "raw" ? `Raw ${d.condition}` : `${d.grader} ${d.grade}`;
  const title = `⚡ ${d.name} ${grade}: ${money(d.total)} (${Math.round(d.discountPct)}% below)`;
  // Every alert opens the deal on TCG Boogie: price check, recent eBay sales, and the eBay button (affiliate-tracked).
  const dealUrl = d.productId
    ? `${SITE}/app/cards/${encodeURIComponent(d.productId)}?deal=${encodeURIComponent(d.id)}${d.language === "japanese" ? "&lang=japanese" : ""}&from=alert`
    : `${SITE}/app/deals`;
  const lines = [
    `${d.name}${d.setName ? ` · ${d.setName}` : ""}${d.number ? ` · ${d.number}` : ""} · ${grade}`,
    `${money(d.total)} with shipping. Sells for about ${money(d.marketValue)} (${d.comps || "recent"} sales).`,
    `About ${d.minutesLeft} min left. Matched your filter “${filterName}”.`,
    ...(d.photoCheck === "match" ? ["✓ Photo checked: the listing photos match this card."] : []),
    ...(d.flags?.length ? [`Check first: ${d.flags.join(" · ")}`] : []),
  ];
  const res = { sent: 0, failed: 0 };
  const attempt = async (channel, fn) => {
    try {
      await fn();
      res.sent++;
      await db.insert(alertLog).values({ userId: user.id, dealId: d.id, kind: "deal", channel, title, price: d.total, target: d.marketValue, ok: true });
    } catch (e) {
      res.failed++;
      await db.insert(alertLog).values({ userId: user.id, dealId: d.id, kind: "deal", channel, title, price: d.total, target: d.marketValue, ok: false, error: String(e.message).slice(0, 300) });
      await log("alerts", "error", `Deal alert by ${channel} failed: ${e.message}`, { deal: d.id }, user.id);
    }
  };
  if (ready.email && user.email && user.alertEmail !== false && allowed.includes("email")) {
    await attempt("email", () => sendEmail(user.email, {
      subject: title, heading: title, lines: [...lines, "See recent eBay sales and open the listing from the deal page."],
      button: { label: "See the deal", url: dealUrl },
      footer: `Manage your filters: ${SITE}/app/deals`,
    }));
  }
  if (ready.discord && discordId && user.alertDiscord && allowed.includes("discord")) {
    await attempt("discord", () => sendDiscordDM(discordId, {
      title, url: dealUrl, description: `${lines.join("\n")}\n[See the deal, recent sales and the listing](${dealUrl})`,
    }));
  }
  if (ready.sms && user.phone && user.phoneVerifiedAt && user.alertSms && allowed.includes("sms")) {
    await attempt("sms", () => sendSms(user.phone, `TCG Boogie deal: ${d.name} ${grade} ${money(d.total)}, ${Math.round(d.discountPct)}% below, ~${d.minutesLeft} min left. ${dealUrl}  Reply STOP to opt out.`));
  }
  return res;
}

/** For the admin status page: is the bot sending deals? */
export async function botStatus() {
  if (!db) return null;
  const [last] = await db.select({ at: deals.foundAt }).from(deals).orderBy(desc(deals.foundAt)).limit(1);
  const [day] = await db.select({ n: sql`count(*)::int` }).from(deals).where(gt(deals.foundAt, new Date(Date.now() - DAY)));
  const [hb] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, "bot_heartbeat")).limit(1);
  return { lastDeal: last?.at || null, today: day?.n || 0, heartbeat: hb?.value || null };
}
