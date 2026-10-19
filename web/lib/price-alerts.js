import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { effectiveTier } from "@/lib/access";
import { getProduct } from "@/lib/catalog";
import { db, schema } from "@/lib/db";
import { channelsReady, sendDiscordDM, sendEmail, sendSms } from "@/lib/notify";
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
  const out = { checked: 0, products: 0, fired: 0, rearmed: 0, sent: 0, failed: 0, skippedProducts: 0 };
  const watches = await db.select().from(priceWatches);
  if (!watches.length) return out;

  // One price lookup per product, however many people watch it (cached and shared, see lib/catalog.js).
  const products = {};
  for (const id of [...new Set(watches.map((w) => w.productId))]) {
    try { products[id] = await getProduct(id); } catch { products[id] = null; }
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
    } catch (e) {
      results.failed++;
      await db.insert(alertLog).values({ userId: user.id, watchId: w.id, kind: selling ? "price_sell" : "price_buy", channel, title, price, target, ok: false, error: String(e.message).slice(0, 300) });
    }
  };

  if (ready.email && user.email && user.alertEmail !== false && allowed.includes("email")) {
    await attempt("email", () => sendEmail(user.email, {
      subject: title,
      heading: title,
      lines: [`${w.name}${w.setName ? ` · ${w.setName}` : ""}${w.number ? ` · ${w.number}` : ""}`, `${what} · TCGplayer ${w.priceType === "low" ? "lowest listing" : "market price"}`, line],
      button: { label: "Open the card", url: cardUrl },
      footer: `${quiet} Manage alerts: ${SITE}/app/watches`,
    }));
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
