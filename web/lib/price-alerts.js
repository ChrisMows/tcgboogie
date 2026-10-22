import "server-only";
import { refreshFeatures } from "@/lib/features";
import { and, eq, inArray } from "drizzle-orm";
import { effectiveTier } from "@/lib/access";
import { getProduct } from "@/lib/catalog";
import { db, schema } from "@/lib/db";
import { channelsReady, sendDiscordDM, sendEmail, sendSms } from "@/lib/notify";
import { log } from "@/lib/log";
import { planFor } from "@/lib/plans";
import { currentPrice, isRising, isTriggered, targetPrice } from "@/lib/watches";

const { priceWatches, users, accounts, alertLog } = schema;
const SITE = process.env.AUTH_URL || "https://tcgboogie.com";
const money = (v) => `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const short = (n) => String(n || "").replace(/\s*\(.*\)$/, "");

/**
 * Check every price alert once. An alert fires when the price reaches the member's target (drops to it for buying,
 * climbs to it for selling), then stays quiet until the price moves back past the target, when it re-arms.
 * Returns a summary of what happened.
 */
export async function runPriceAlerts() {
  await refreshFeatures(); // Admin → Features choices
  const out = { checked: 0, products: 0, fired: 0, rearmed: 0, sent: 0, failed: 0, skippedProducts: 0 };
  const watches = await db.select().from(priceWatches);
  if (!watches.length) return out;

  // One price lookup per product, however many people watch it (cached and shared, see lib/catalog.js).
  const products = {};
  for (const id of [...new Set(watches.map((w) => w.productId))]) {
    try { products[id] = await getProduct(id); } catch (e) {
      products[id] = null;
      await log("alerts", "warn", `Couldn't look up product ${id}: ${e.message}`, { productId: id });
    }
    if (!products[id]) out.skippedProducts++;
  }
  out.products = Object.keys(products).length;

  const userIds = [...new Set(watches.map((w) => w.userId))];
  const people = Object.fromEntries((await db.select().from(users).where(inArray(users.id, userIds))).map((u) => [u.id, u]));
  const discordIds = Object.fromEntries((await db.select({ userId: accounts.userId, id: accounts.providerAccountId }).from(accounts)
    .where(and(inArray(accounts.userId, userIds), eq(accounts.provider, "discord")))).map((a) => [a.userId, a.id]));
  const ready = channelsReady();

  for (const w of watches) {
    const p = products[w.productId];
    if (!p) continue;
    out.checked++;
    const price = currentPrice(p, w);
    const now = new Date();
    if (price === null || price === undefined) {
      await db.update(priceWatches).set({ lastCheckedAt: now }).where(eq(priceWatches.id, w.id));
      continue;
    }
    const hit = isTriggered(w, price);
    if (hit && w.status !== "triggered") {
      await db.update(priceWatches).set({ lastPrice: price, lastCheckedAt: now, status: "triggered", triggeredAt: now }).where(eq(priceWatches.id, w.id));
      out.fired++;
      const user = people[w.userId];
      if (user) {
        const r = await notify(user, discordIds[w.userId], w, price, ready);
        out.sent += r.sent; out.failed += r.failed;
      }
    } else if (!hit && w.status === "triggered") {
      // Moved back past the target: ready to alert again next time.
      await db.update(priceWatches).set({ lastPrice: price, lastCheckedAt: now, status: "watching", triggeredAt: null }).where(eq(priceWatches.id, w.id));
      out.rearmed++;
    } else {
      await db.update(priceWatches).set({ lastPrice: price, lastCheckedAt: now }).where(eq(priceWatches.id, w.id));
    }
  }
  return out;
}

/** Send one alert on every channel this member has (and their plan allows). */
async function notify(user, discordId, w, price, ready) {
  const tier = effectiveTier(user);
  const allowed = planFor(tier).watchAlertChannels;
  const selling = isRising(w);
  const target = targetPrice(w);
  const name = short(w.name);
  const what = w.productType === "card" ? `${w.condition || "Near Mint"}${w.printing ? `, ${w.printing}` : ""}` : "Sealed";
  const title = selling ? `📈 ${name} climbed to ${money(price)}` : `🔔 ${name} dropped to ${money(price)}`;
  const line = selling ? `Your sell price was ${money(target)}. It's at ${money(price)} now.` : `Your buy price was ${money(target)}. It's at ${money(price)} now.`;
  const cardUrl = `${SITE}/app/cards/${w.productId}`;
  const quiet = "You'll hear about this card again only after its price moves back past your target.";
  const results = { sent: 0, failed: 0 };

  const attempt = async (channel, fn) => {
    try {
      await fn();
      results.sent++;
      await db.insert(alertLog).values({ userId: user.id, watchId: w.id, kind: selling ? "price_sell" : "price_buy", channel, title, price, target, ok: true });
      await log("alerts", "info", `Sent by ${channel}: ${title}`, { watch: w.id, price, target }, user.id);
    } catch (e) {
      results.failed++;
      await db.insert(alertLog).values({ userId: user.id, watchId: w.id, kind: selling ? "price_sell" : "price_buy", channel, title, price, target, ok: false, error: String(e.message).slice(0, 300) });
      await log("alerts", "error", `Couldn't send by ${channel}: ${e.message}`, { watch: w.id, title }, user.id);
    }
  };

  if (ready.email && user.email && user.alertEmail !== false && allowed.includes("email")) {
    await attempt("email", () => sendEmail(user.email, {
      subject: title,
      heading: title,
      lines: [`${w.name}${w.setName ? ` · ${w.setName}` : ""}${w.number ? ` · ${w.number}` : ""}`, `${what} · TCGplayer ${w.priceType === "low" ? "lowest listing" : "market price"}`, line],
      button: { label: "Open the card", url: cardUrl },
      footer: `${quiet} Manage alerts: ${SITE}/app/watches`,
    }, { userId: user.id, kind: "alerts" }));
  }
  if (ready.discord && discordId && user.alertDiscord && allowed.includes("discord")) {
    await attempt("discord", () => sendDiscordDM(discordId, {
      title, url: cardUrl,
      description: `${w.name}${w.setName ? ` · ${w.setName}` : ""}\n${line}`,
      fields: [{ name: "Tracking", value: `${what} · ${w.priceType === "low" ? "lowest listing" : "market price"}`, inline: true }],
    }));
  }
  if (ready.sms && user.phone && user.phoneVerifiedAt && user.alertSms && allowed.includes("sms")) {
    await attempt("sms", () => sendSms(user.phone, `TCG Boogie: ${title.replace(/^\S+\s/, "")}. ${line} ${cardUrl}  Reply STOP to opt out.`));
  }
  return results;
}

/**
 * Admin test: send a sample price alert to this member on every channel that's set up for them.
 * Returns [{ channel, ok, detail }] so the admin page can show what worked.
 */
export async function sendTestAlert(user) {
  const ready = channelsReady();
  const [discord] = db ? await db.select({ id: accounts.providerAccountId }).from(accounts)
    .where(and(eq(accounts.userId, user.id), eq(accounts.provider, "discord"))).limit(1) : [];
  const title = "🔔 Test alert: Charizard ex dropped to $259.00";
  const line = "This is a test from the TCG Boogie admin panel. Real alerts look just like this.";
  const url = `${SITE}/app/watches`;
  const results = [];
  const run = async (channel, available, why, fn) => {
    if (!available) return results.push({ channel, ok: null, detail: why });
    try {
      await fn();
      results.push({ channel, ok: true, detail: "Sent" });
      await log("alerts", "info", `Test alert sent by ${channel}`, null, user.id);
      if (db) await db.insert(alertLog).values({ userId: user.id, kind: "test", channel, title, ok: true });
    } catch (e) {
      results.push({ channel, ok: false, detail: String(e.message).slice(0, 200) });
      await log("alerts", "error", `Test alert by ${channel} failed: ${e.message}`, null, user.id);
      if (db) await db.insert(alertLog).values({ userId: user.id, kind: "test", channel, title, ok: false, error: String(e.message).slice(0, 300) });
    }
  };
  await run("email", ready.email && user.email, !ready.email ? "Email isn't set up" : "No email on this account", () => sendEmail(user.email, {
    subject: title, heading: title, lines: ["Charizard ex · Scarlet & Violet 151 · 199/165", line], button: { label: "Open price alerts", url },
    footer: "You're getting this because you pressed “Send me a test alert”.",
  }));
  await run("discord", ready.discord && discord?.id, !ready.discord ? "Discord bot isn't set up" : "Your Discord isn't connected (Settings → Connect Discord)",
    () => sendDiscordDM(discord.id, { title, url, description: `Charizard ex · Scarlet & Violet 151\n${line}` }));
  await run("sms", ready.sms && user.phone && user.phoneVerifiedAt, !ready.sms ? "Texts aren't set up (Twilio)" : "No confirmed phone number on your account",
    () => sendSms(user.phone, `TCG Boogie: test alert. Real price alerts will look like this. ${url}`));
  return results;
}
