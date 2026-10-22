import "server-only";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { effectiveTier } from "@/lib/access";
import { change } from "@/lib/collection";
import { db, schema } from "@/lib/db";
import { log } from "@/lib/log";
import { channelsReady, sendDiscordDM, sendEmail, sendSms } from "@/lib/notify";
import { planFor } from "@/lib/plans";
import { loadProducts } from "@/lib/portfolio";

// Premium "Tell me when to sell high": once a day (with the price-alert check), find raw cards a member owns whose
// Near Mint price climbed by their chosen % or more over the last 7 days, and send one bundled alert per member.
const { users, accounts, alertLog, collectionItems } = schema;
const SITE = process.env.AUTH_URL || "https://tcgboogie.com";
const MIN_PRICE = 5; // below this, a few cents of movement looks like a huge jump
const QUIET_DAYS = 7; // the same card isn't alerted again for a week
const MAX_LIVE = 300; // price lookups per run beyond what's already cached (3 credits each)
const money = (v) => `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const short = (n) => String(n || "").replace(/\s*\(.*\)$/, "");

export async function runSellHigh() {
  const out = { members: 0, cards: 0, risers: 0, sent: 0, failed: 0 };
  if (!db) return out;
  const people = (await db.select().from(users).where(sql`(${users.collectionPrefs}->>'sellHigh')::boolean is true`))
    .filter((u) => effectiveTier(u) === "premium");
  if (!people.length) return out;
  out.members = people.length;

  const items = await db.select().from(collectionItems).where(and(inArray(collectionItems.userId, people.map((u) => u.id)),
    eq(collectionItems.list, "owned"), inArray(collectionItems.kind, ["raw", "sealed"])));
  const products = await loadProducts(items.map((it) => it.productId), MAX_LIVE);
  out.cards = Object.keys(products).length;

  // Cards already alerted in the last week, per member.
  const since = new Date(Date.now() - QUIET_DAYS * 86400000);
  const recent = new Set((await db.select({ userId: alertLog.userId, id: alertLog.dealId }).from(alertLog)
    .where(and(inArray(alertLog.userId, people.map((u) => u.id)), eq(alertLog.kind, "sell_high"), eq(alertLog.ok, true), gt(alertLog.sentAt, since))))
    .map((r) => `${r.userId}:${r.id}`));

  const discordIds = Object.fromEntries((await db.select({ userId: accounts.userId, id: accounts.providerAccountId }).from(accounts)
    .where(and(inArray(accounts.userId, people.map((u) => u.id)), eq(accounts.provider, "discord")))).map((a) => [a.userId, a.id]));
  const ready = channelsReady();

  for (const user of people) {
    const pct = Number(user.collectionPrefs?.sellHighPct) || 25;
    const risers = [];
    for (const id of new Set(items.filter((it) => it.userId === user.id).map((it) => it.productId))) {
      const p = products[id];
      const now = p?.history?.length ? p.history[p.history.length - 1].price : null; // same series as change()
      const up = p ? change(p, 7) : null;
      if (!now || now < MIN_PRICE || up === null || up * 100 < pct || recent.has(`${user.id}:${id}`)) continue;
      const copies = items.filter((it) => it.userId === user.id && it.productId === id).reduce((n, it) => n + it.quantity, 0);
      risers.push({ p, now, up, copies });
    }
    if (!risers.length) continue;
    risers.sort((a, b) => b.up - a.up);
    out.risers += risers.length;
    const r = await alertMember(user, discordIds[user.id], risers, pct, ready);
    out.sent += r.sent; out.failed += r.failed;
  }
  await log("alerts", out.failed ? "warn" : "info", `Sell-high check: ${out.members} member${out.members === 1 ? "" : "s"}, ${out.risers} card${out.risers === 1 ? "" : "s"} up, ${out.sent} sent${out.failed ? `, ${out.failed} failed` : ""}`, out);
  return out;
}

const lineOf = ({ p, now, up, copies }) => `${short(p.name)} (${p.setName}${p.number ? ` #${p.number}` : ""}): up ${Math.round(up * 100)}% this week to ${money(now)}${copies > 1 ? `, you own ${copies}` : ""}`;
const cardUrl = (p) => `${SITE}/app/cards/${encodeURIComponent(p.id)}`;

async function alertMember(user, discordId, risers, pct, ready) {
  const allowed = planFor("premium").watchAlertChannels;
  const res = { sent: 0, failed: 0 };
  const top = risers[0];
  const title = risers.length === 1
    ? `📈 ${short(top.p.name)} is up ${Math.round(top.up * 100)}% this week`
    : `📈 ${risers.length} of your cards are up ${pct}%+ this week`;
  const attempt = async (channel, fn) => {
    try {
      await fn();
      res.sent++;
      for (const x of risers) await db.insert(alertLog).values({ userId: user.id, dealId: x.p.id, kind: "sell_high", channel, title, price: x.now, ok: true });
    } catch (e) {
      res.failed++;
      await db.insert(alertLog).values({ userId: user.id, kind: "sell_high", channel, title, ok: false, error: String(e.message).slice(0, 300) });
      await log("alerts", "error", `Sell-high alert by ${channel} failed: ${e.message}`, null, user.id);
    }
  };
  const footer = `TCGplayer market prices (raw Near Mint for cards). You picked ${pct}% in Collection alerts; each card is alerted at most once a week. ${SITE}/app/collection`;

  if (ready.email && user.email && user.alertEmail !== false && allowed.includes("email")) {
    await attempt("email", () => sendEmail(user.email, risers.length === 1
      ? { subject: title, heading: title, lines: [lineOf(top), "It could be a good time to sell."], button: { label: "Open the card", url: cardUrl(top.p) }, footer }
      : { subject: title, heading: title, items: risers.map((x) => ({ text: lineOf(x), url: cardUrl(x.p) })), button: { label: "Open your collection", url: `${SITE}/app/collection` }, footer }, { userId: user.id, kind: "alerts" }));
  }
  if (ready.discord && discordId && user.alertDiscord && allowed.includes("discord")) {
    await attempt("discord", () => sendDiscordDM(discordId, {
      title, url: risers.length === 1 ? cardUrl(top.p) : `${SITE}/app/collection`,
      description: risers.slice(0, 10).map((x) => `• [${lineOf(x)}](${cardUrl(x.p)})`).join("\n"),
    }));
  }
  if (ready.sms && user.phone && user.phoneVerifiedAt && user.alertSms && allowed.includes("sms")) {
    await attempt("sms", () => sendSms(user.phone, `TCG Boogie: ${title.replace(/^\S+\s/, "")}. ${risers.length === 1 ? cardUrl(top.p) : `${SITE}/app/collection`}  Reply STOP to opt out.`));
  }
  return res;
}
