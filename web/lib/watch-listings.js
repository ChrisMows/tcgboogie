import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { effectiveTier } from "@/lib/access";
import { db, schema } from "@/lib/db";
import { ebayLink } from "@/lib/ebay-link";
import { log } from "@/lib/log";
import { channelsReady, sendDiscordDM, sendEmail, sendSms } from "@/lib/notify";
import { planFor } from "@/lib/plans";
import { targetPrice } from "@/lib/watches";

// eBay listings at or under a member's price alert (found by the deal bot, see pokemon-deal-finder/dealfinder/watch_ebay.py).
const { watchListings, priceWatches, users, accounts, alertLog } = schema;
const SITE = process.env.AUTH_URL || "https://tcgboogie.com";
const money = (v) => `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const short = (n) => String(n || "").replace(/\s*-\s*[\w/]+$/, "").replace(/\s*\(.*\)$/, "");

/** Alert members about new listings, each once, on the channels their plan includes and they switched on. */
export async function dispatchWatchListings() {
  const out = { listings: 0, sent: 0, failed: 0 };
  if (!db) return out;
  const claimed = await db.update(watchListings).set({ notifiedAt: new Date() }).where(isNull(watchListings.notifiedAt)).returning();
  if (!claimed.length) return out;
  out.listings = claimed.length;
  const watches = await db.select({ watch: priceWatches, user: users }).from(priceWatches)
    .innerJoin(users, eq(users.id, priceWatches.userId)).where(inArray(priceWatches.id, [...new Set(claimed.map((c) => c.watchId))]));
  const byWatch = Object.fromEntries(watches.map((r) => [r.watch.id, r]));
  const userIds = [...new Set(watches.map((r) => r.user.id))];
  const discordIds = userIds.length ? Object.fromEntries((await db.select({ userId: accounts.userId, id: accounts.providerAccountId }).from(accounts)
    .where(and(inArray(accounts.userId, userIds), eq(accounts.provider, "discord")))).map((a) => [a.userId, a.id])) : {};
  const ready = channelsReady();

  for (const l of claimed) {
    const r = byWatch[l.watchId];
    if (!r) continue;
    const { watch: w, user } = r;
    const allowed = planFor(effectiveTier(user)).watchAlertChannels;
    const target = targetPrice(w);
    const name = short(w.name);
    const link = ebayLink(l.url, "price-alert-listing");
    const cardUrl = `${SITE}/app/cards/${encodeURIComponent(w.productId)}`;
    const title = `🔔 ${name} listed on eBay for ${money(l.price)}`;
    const lines = [
      `${w.name}${w.setName ? ` · ${w.setName}` : ""}${w.number ? ` · ${w.number}` : ""}`,
      `Buy It Now ${money(l.price)} with shipping. Your price alert is ${money(target)}.`,
      `Listing: “${l.title}”`,
      ...(l.photoCheck === "match" ? ["✓ Photo checked: the listing photos match this card."] : []),
      ...((l.flags || []).length ? [`Check first: ${l.flags.join(" · ")}`] : []),
      `Prices by condition and recent sales: ${cardUrl}`,
    ];
    const attempt = async (channel, fn) => {
      try {
        await fn();
        out.sent++;
        await db.insert(alertLog).values({ userId: user.id, watchId: w.id, dealId: l.itemId, kind: "ebay_listing", channel, title, price: l.price, target, ok: true });
      } catch (e) {
        out.failed++;
        await db.insert(alertLog).values({ userId: user.id, watchId: w.id, dealId: l.itemId, kind: "ebay_listing", channel, title, price: l.price, target, ok: false, error: String(e.message).slice(0, 300) });
        await log("alerts", "error", `eBay listing alert by ${channel} failed: ${e.message}`, { watch: w.id, item: l.itemId }, user.id);
      }
    };
    if (ready.email && user.email && user.alertEmail !== false && allowed.includes("email")) {
      await attempt("email", () => sendEmail(user.email, {
        subject: title, heading: title, lines, button: { label: "Open the listing on eBay", url: link.href },
        footer: `${link.affiliate ? "eBay links may earn us a commission. " : ""}Manage price alerts: ${SITE}/app/watches`,
      }));
    }
    if (ready.discord && discordIds[user.id] && user.alertDiscord && allowed.includes("discord")) {
      await attempt("discord", () => sendDiscordDM(discordIds[user.id], { title, url: link.href, description: lines.join("\n") }));
    }
    if (ready.sms && user.phone && user.phoneVerifiedAt && user.alertSms && allowed.includes("sms")) {
      await attempt("sms", () => sendSms(user.phone, `TCG Boogie: ${name} listed on eBay for ${money(l.price)} (your alert: ${money(target)}). ${link.href}  Reply STOP to opt out.`));
    }
  }
  await log("alerts", out.failed ? "warn" : "info", `eBay listing alerts: ${out.listings} listing${out.listings === 1 ? "" : "s"}, ${out.sent} sent${out.failed ? `, ${out.failed} failed` : ""}`, out);
  return out;
}

/** The latest listings found for a member's price alerts, by watch id (Price alerts page). */
export async function listingsByWatch(userId) {
  if (!db) return {};
  const rows = await db.select({ l: watchListings }).from(watchListings)
    .innerJoin(priceWatches, eq(priceWatches.id, watchListings.watchId))
    .where(eq(priceWatches.userId, userId)).orderBy(desc(watchListings.foundAt)).limit(100);
  const out = {};
  for (const { l } of rows) (out[l.watchId] ||= []).length < 3 && out[l.watchId].push({
    id: l.id, title: l.title, price: l.price, href: ebayLink(l.url, "price-alerts-page").href, photoCheck: l.photoCheck, foundAt: l.foundAt.toISOString(),
  });
  return out;
}
