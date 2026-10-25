import "server-only";
import { refreshFeatures } from "@/lib/features";
import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { effectiveTier } from "@/lib/access";
import { db, schema } from "@/lib/db";
import { SAMPLE_DEALS } from "@/lib/demo-deals";
import { ALERT_CHANNELS, clampToPlan, matches, RAW_CONDITIONS } from "@/lib/filters";
import { log } from "@/lib/log";
import { channelsReady, sendDiscordDM, sendEmail, sendSms } from "@/lib/notify";
import { sendPush } from "@/lib/push";
import { planFor } from "@/lib/plans";

// Real deals from the deal bot (see the `deal` table). Until the bot has found any, pages show the sample deals,
// clearly labeled as examples.
const { deals, profiles, users, accounts, alertLog, collectionItems } = schema;
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
    // How it really ended, looked up by the bot after the auction (null until then, or if eBay no longer had it).
    sold: row.sold ?? null,
    soldFor: row.sold ? row.finalPrice ?? null : null, // final price with shipping
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
  return { deals: user.plan.liveFeed ? all : all.filter((d) => d.ended), sample: false };
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
  await refreshFeatures(); // Admin → Features choices
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

// Daily caps per member, so alerts stay useful (and inside the email/text budgets). Deals past a cap still show on
// the Deals page and by Discord, which is free.
const EMAIL_CAP = Number(process.env.EMAIL_DEALS_PER_DAY || 25);
const SMS_CAP = Number(process.env.SMS_DEALS_PER_DAY || 10);
const PUSH_CAP = Number(process.env.PUSH_DEALS_PER_DAY || 60); // free, but a phone buzzing all day gets switched off
const PARALLEL = 5; // members alerted at the same time

/**
 * Send live alerts for new deals. Each deal is claimed once (so two calls at the same time can't double-send).
 * Every Premium member whose running filters match gets ONE message per channel for the whole batch (several deals
 * found in the same check arrive bundled), and members are alerted in parallel so nobody waits on anyone else.
 */
export async function dispatchDeals() {
  await refreshFeatures(); // Admin → Features choices
  const out = { deals: 0, members: 0, sent: 0, failed: 0, capped: 0 };
  if (!db) return out;
  const claimed = await db.update(deals).set({ dispatchedAt: new Date() })
    .where(and(isNull(deals.dispatchedAt), gt(deals.endsAt, new Date()))).returning();
  // Anything that ended before we got to it is simply never alerted.
  await db.update(deals).set({ dispatchedAt: new Date() }).where(and(isNull(deals.dispatchedAt), lt(deals.endsAt, new Date())));
  if (!claimed.length) return out;
  out.deals = claimed.length;

  const rows = await db.select({ profile: profiles, user: users }).from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId)).where(eq(profiles.active, true));
  const live = rows.filter((r) => planFor(effectiveTier(r.user)).liveFeed); // others see deals after they end (Admin → Features)
  const collectors = await setCollectors();
  if (!live.length && !collectors.length) return out;
  const userIds = [...new Set([...live.map((r) => r.user.id), ...collectors.map((c) => c.user.id)])];
  const discordIds = Object.fromEntries((await db.select({ userId: accounts.userId, id: accounts.providerAccountId }).from(accounts)
    .where(and(inArray(accounts.userId, userIds), eq(accounts.provider, "discord")))).map((a) => [a.userId, a.id]));
  const ready = channelsReady();

  // member -> the deals for them, each with the channels its matching filters chose
  const byMember = new Map();
  for (const row of claimed) {
    const d = toDeal(row);
    const seen = new Map();
    for (const r of live) {
      const f = clampToPlan(r.profile.filters, planFor("premium"));
      if (!matches(f, d)) continue;
      const e = seen.get(r.user.id) || { deal: d, why: `Matched your filter “${r.profile.name}”.`, user: r.user, channels: new Set() };
      for (const c of f.channels || ALERT_CHANNELS) e.channels.add(c);
      seen.set(r.user.id, e);
    }
    // Collection alerts: a card missing from a set you've started, or on your wishlist (every channel you have on).
    for (const c of collectors) {
      const why = c.wants(d);
      if (!why) continue;
      const e = seen.get(c.user.id) || { deal: d, user: c.user, channels: new Set() };
      e.why = e.why ? `${e.why} ${why}` : why;
      for (const ch of ALERT_CHANNELS) e.channels.add(ch);
      seen.set(c.user.id, e);
    }
    for (const [uid, e] of seen) {
      const m = byMember.get(uid) || { user: e.user, items: [] };
      m.items.push(e);
      byMember.set(uid, m);
    }
  }
  out.members = byMember.size;

  // Today's deal alerts per member and channel, for the caps.
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const counts = {};
  for (const r of await db.select({ userId: alertLog.userId, channel: alertLog.channel, n: sql`count(*)::int` }).from(alertLog)
    .where(and(inArray(alertLog.userId, [...byMember.keys()]), eq(alertLog.kind, "deal"), eq(alertLog.ok, true), gt(alertLog.sentAt, since)))
    .groupBy(alertLog.userId, alertLog.channel)) counts[`${r.userId}:${r.channel}`] = r.n;

  const queue = [...byMember.values()];
  await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
    for (let m = queue.shift(); m; m = queue.shift()) {
      const r = await alertMember(m.user, discordIds[m.user.id], m.items, ready, counts);
      out.sent += r.sent; out.failed += r.failed; out.capped += r.capped;
    }
  }));
  await log("alerts", out.failed ? "warn" : "info",
    `Deal alerts: ${out.deals} new deal${out.deals === 1 ? "" : "s"}, ${out.members} member${out.members === 1 ? "" : "s"}, ${out.sent} sent`
    + `${out.capped ? `, ${out.capped} over a daily cap` : ""}${out.failed ? `, ${out.failed} failed` : ""}`, out);
  return out;
}

/**
 * Premium members with "Deals on cards missing from my sets" on, each with wants(deal): why this deal is for them
 * (a card they don't own from a set they've started, or one on their wishlist), else null.
 */
async function setCollectors() {
  const people = (await db.select().from(users).where(sql`(${users.collectionPrefs}->>'setDeals')::boolean is true`))
    .filter((u) => planFor(effectiveTier(u)).collectionAlerts);
  if (!people.length) return [];
  const items = await db.select({ userId: collectionItems.userId, list: collectionItems.list, productId: collectionItems.productId,
    productType: collectionItems.productType, setName: collectionItems.setName })
    .from(collectionItems).where(inArray(collectionItems.userId, people.map((u) => u.id)));
  return people.map((user) => {
    const mine = items.filter((it) => it.userId === user.id && it.productType === "card");
    const owned = new Set(mine.filter((it) => it.list === "owned").map((it) => it.productId));
    const wished = new Set(mine.filter((it) => it.list === "wishlist").map((it) => it.productId));
    const started = new Set(mine.filter((it) => it.list === "owned" && it.setName).map((it) => it.setName));
    return {
      user,
      wants: (d) => {
        const pid = d.productId ? String(d.productId) : null;
        if (!pid || owned.has(pid)) return null;
        if (wished.has(pid)) return "It's on your wishlist.";
        return d.setName && started.has(d.setName) ? `You're missing it from your ${d.setName} set.` : null;
      },
    };
  });
}

const gradeOf = (d) => (d.kind === "sealed" ? "Sealed" : d.kind === "raw" ? `Raw ${d.condition}` : `${d.grader} ${d.grade}`);
const dealUrlOf = (d) => (d.productId
  ? `${SITE}/app/cards/${encodeURIComponent(d.productId)}?deal=${encodeURIComponent(d.id)}${d.language === "japanese" ? "&lang=japanese" : ""}&from=alert`
  : `${SITE}/app/deals`);
const titleOf = (d) => `⚡ ${d.name} ${gradeOf(d)}: ${money(d.total)} (${Math.round(d.discountPct)}% below)`;
function linesOf(d, why) {
  return [
    `${d.name}${d.setName ? ` · ${d.setName}` : ""}${d.number ? ` · ${d.number}` : ""} · ${gradeOf(d)}`,
    `${money(d.total)} with shipping. Sells for about ${money(d.marketValue)} (${d.comps || "recent"} sales).`,
    `About ${d.minutesLeft} min left. ${why}`,
    ...(d.photoCheck === "match" ? ["✓ Photo checked: the listing photos match this card."] : []),
    ...(d.flags?.length ? [`Check first: ${d.flags.join(" · ")}`] : []),
  ];
}

/** One member, one batch of deals: one email, one text, and a Discord message and a push per deal (both free). */
async function alertMember(user, discordId, items, ready, counts) {
  const plan = planFor("premium").watchAlertChannels;
  const res = { sent: 0, failed: 0, capped: 0 };
  const logRows = async (channel, list, ok, error) => {
    for (const { deal: d } of list) {
      await db.insert(alertLog).values({ userId: user.id, dealId: d.id, kind: "deal", channel, title: titleOf(d), price: d.total, target: d.marketValue, ok, error: error ? String(error).slice(0, 300) : null });
    }
  };
  const send = async (channel, list, fn) => {
    try {
      await fn();
      res.sent++;
      await logRows(channel, list, true);
    } catch (e) {
      res.failed++;
      await logRows(channel, list, false, e.message);
      await log("alerts", "error", `Deal alert by ${channel} failed: ${e.message}`, { deals: list.map((x) => x.deal.id) }, user.id);
    }
  };
  // Deals for one channel: chosen by the filter, in the plan, switched on in Settings, and within today's cap.
  const pick = (channel, on, cap) => {
    if (!on || !plan.includes(channel)) return [];
    const wanted = items.filter((x) => x.channels.has(channel));
    if (cap === undefined) return wanted;
    const left = Math.max(0, cap - (counts[`${user.id}:${channel}`] || 0));
    res.capped += Math.max(0, wanted.length - left);
    return wanted.slice(0, left);
  };

  const email = pick("email", ready.email && user.email && user.alertEmail !== false, EMAIL_CAP);
  if (email.length === 1) {
    const { deal: d, why } = email[0];
    await send("email", email, () => sendEmail(user.email, {
      subject: titleOf(d), heading: titleOf(d), lines: [...linesOf(d, why), "See recent eBay sales and open the listing from the deal page."],
      button: { label: "See the deal", url: dealUrlOf(d) }, footer: `Manage your filters: ${SITE}/app/deals`,
    }, { userId: user.id, kind: "alerts" }));
  } else if (email.length > 1) {
    const subject = `⚡ ${email.length} new deals for you, up to ${Math.max(...email.map((x) => Math.round(x.deal.discountPct)))}% below`;
    await send("email", email, () => sendEmail(user.email, {
      subject, heading: subject,
      items: email.map(({ deal: d }) => ({ text: `${d.name} ${gradeOf(d)}: ${money(d.total)}, ${Math.round(d.discountPct)}% below ${money(d.marketValue)}, ~${d.minutesLeft} min left${d.photoCheck === "match" ? " · ✓ photo checked" : ""}`, url: dealUrlOf(d) })),
      button: { label: "See all on your Deals page", url: `${SITE}/app/deals` }, footer: `Manage your filters: ${SITE}/app/deals`,
    }, { userId: user.id, kind: "alerts" }));
  }

  // Push: one notification per deal (each replaces an older one about the same deal), or one summary for a big batch.
  const push = pick("push", ready.push && user.alertWebPush, PUSH_CAP);
  if (push.length > 3) {
    const best = Math.max(...push.map((x) => Math.round(x.deal.discountPct)));
    await send("push", push, () => sendPush(user.id, { title: `⚡ ${push.length} new deals for you`, body: `Up to ${best}% below market. Tap to see them.`, url: "/app/deals", tag: "deals" }));
  } else {
    for (const x of push) {
      const d = x.deal;
      await send("push", [x], () => sendPush(user.id, {
        title: titleOf(d), url: dealUrlOf(d), tag: `deal-${d.id}`,
        body: `${money(d.total)} with shipping, ${Math.round(d.discountPct)}% below ${money(d.marketValue)}. ~${d.minutesLeft} min left.${d.photoCheck === "match" ? " ✓ Photo checked." : ""}`,
      }));
    }
  }

  for (const x of pick("discord", ready.discord && discordId && user.alertDiscord)) {
    const d = x.deal;
    await send("discord", [x], () => sendDiscordDM(discordId, {
      title: titleOf(d), url: dealUrlOf(d), description: `${linesOf(d, x.why).join("\n")}\n[See the deal, recent sales and the listing](${dealUrlOf(d)})`,
    }));
  }

  const sms = pick("sms", ready.sms && user.phone && user.phoneVerifiedAt && user.alertSms, SMS_CAP);
  if (sms.length) {
    const first = sms[0].deal;
    const body = sms.length === 1
      ? `TCG Boogie deal: ${first.name} ${gradeOf(first)} ${money(first.total)}, ${Math.round(first.discountPct)}% below, ~${first.minutesLeft} min left. ${dealUrlOf(first)}  Reply STOP to opt out.`
      : `TCG Boogie: ${sms.length} new deals, e.g. ${first.name} ${money(first.total)} (${Math.round(first.discountPct)}% below). ${SITE}/app/deals  Reply STOP to opt out.`;
    await send("sms", sms, () => sendSms(user.phone, body));
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

/**
 * Homepage showcase: deals from the last 30 days that really SOLD below market, by their final price (with shipping),
 * which the bot looks up after each auction ends. Only ones we can stand behind: the listing photos matched the card,
 * the title doesn't say reprint, and the real discount is 15-70%. `realOff` is that discount. Cached 15 minutes.
 * Returns null until at least three such sales are known (the homepage then shows clearly labeled examples).
 */
const REPRINT_TITLE = /celebrations|classic collection|30th (anniversary|celebration)|25th anniversary|reprint/i;
export const realOff = (d) => (d.soldFor > 0 && d.marketValue > 0 ? Math.round((1 - d.soldFor / d.marketValue) * 100) : null);
export const credible = (d) => d.sold === true && d.photoCheck === "match" && !REPRINT_TITLE.test(d.title || "")
  && realOff(d) >= 15 && realOff(d) <= 70;
let showcase = globalThis.__tcgShowcase ?? (globalThis.__tcgShowcase = { at: 0, data: null });
export async function homeShowcase() {
  if (Date.now() - showcase.at < 15 * 60000) return showcase.data;
  let data = null;
  try {
    const all = await recentDeals({ days: 30, limit: 2000 });
    const good = all.filter((d) => d.ended && credible(d)).map((d) => ({ ...d, realOff: realOff(d) }));
    if (good.length >= 3) {
      const seen = new Set();
      const best = good.filter((d) => d.image && d.marketValue >= 50).sort((a, b) => b.realOff - a.realOff)
        .filter((d) => (seen.has(d.name) ? false : seen.add(d.name))).slice(0, 15); // the homepage carousel shows up to 15
      data = {
        soldBelow: good.length,
        avgOff: Math.round(good.reduce((s, d) => s + d.realOff, 0) / good.length),
        bestOff: Math.max(...good.map((d) => d.realOff)),
        deals: best.length >= 3 ? best : null,
      };
      if (!data.deals) data = null;
    }
  } catch { data = null; }
  showcase = globalThis.__tcgShowcase = { at: Date.now(), data };
  return data;
}
