import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { log } from "@/lib/log";
import { runPriceAlerts } from "@/lib/price-alerts";
import { recordSealedPrices } from "@/lib/catalog";
import { runRecaps } from "@/lib/recap";
import { runSellHigh } from "@/lib/sell-high";
import { sendAdminAlerts } from "@/lib/admin-alerts";
import { continueReleaseEmails } from "@/lib/release-email";
import { recordDailySnapshots } from "@/lib/snapshots";
import { refreshGradingGaps } from "@/lib/grading-gap";
import { linkPricedMemberCards } from "@/lib/member-links";
import { checkStuckValues } from "@/lib/stuck-values";
import { refreshSwu } from "@/lib/swu";
import { lorcana } from "@/lib/lorcana";

// Called on a schedule (Hostinger cron job) to check every price alert and send the ones that hit.
// Safe to call from anywhere: it runs at most once every 20 minutes, so nobody can burn price-service credits by
// calling it repeatedly. With CRON_SECRET set, a request carrying "Authorization: Bearer <secret>" skips that wait.
const MIN_GAP_MS = 20 * 60 * 1000;
const KEY = "price_alerts_last_run";

export const dynamic = "force-dynamic";

async function handle(req) {
  if (!db) return NextResponse.json({ ok: false, error: "No database configured." }, { status: 503 });
  const secret = process.env.CRON_SECRET;
  const forced = Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;

  const [row] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, KEY)).limit(1);
  const last = row?.value?.at ? new Date(row.value.at).getTime() : 0;
  if (!forced && Date.now() - last < MIN_GAP_MS) {
    return NextResponse.json({ ok: true, skipped: "ran recently", lastRun: row.value.at });
  }
  const started = new Date();
  await db.insert(schema.appSettings).values({ key: KEY, value: { at: started.toISOString(), running: true } })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: { at: started.toISOString(), running: true }, updatedAt: started } });

  try {
    // Star Wars: Unlimited prices (free, from TCGCSV): once a day after TCGCSV updates, before alerts check them.
    let swu;
    try { swu = await refreshSwu(); } catch (e) {
      swu = { error: e.message };
      await log("prices", "warn", `Star Wars: Unlimited price import failed: ${e.message}`);
    }
    const summary = await runPriceAlerts();
    // Disney Lorcana prices, the same way (lib/lorcana.js): on a run where Star Wars didn't just import, so one run
    // never does both (each is ~15-25 s of TCGCSV requests); runs are 20+ minutes apart, so it's a run later at most.
    let lcr = { skipped: "after Star Wars" };
    if (!swu?.products) try { lcr = await lorcana.refresh(); } catch (e) {
      lcr = { error: e.message };
      await log("prices", "warn", `Disney Lorcana price import failed: ${e.message}`);
    }
    summary.swu = swu;
    summary.lorcana = lcr;
    // Sealed price history (ours), before sell-high so today's moves count.
    try { summary.sealed = await recordSealedPrices(); } catch (e) {
      await log("prices", "warn", `Sealed price recording failed: ${e.message}`);
    }
    // Premium sell-high alerts ride along with the daily check (their failure mustn't fail price alerts).
    try { summary.sellHigh = await runSellHigh(); } catch (e) {
      await log("alerts", "error", `Sell-high check crashed: ${e.message}`, { stack: String(e.stack || "").slice(0, 1500) });
    }
    try { summary.recaps = await runRecaps(); } catch (e) {
      await log("alerts", "error", `Email recaps crashed: ${e.message}`, { stack: String(e.stack || "").slice(0, 1500) });
    }
    // Every member's collection value for today (once a day, late UTC), so the value chart has every day.
    try { summary.snapshots = await recordDailySnapshots(); } catch (e) {
      await log("website", "warn", `Daily collection values crashed: ${e.message}`);
    }
    // Grade & Flip: copy the card prices the bot refreshed since the last run (no lookups, lib/grading-gap.js).
    // Member-added cards the price service now has: copies move to the priced card (lib/member-links.js).
    let severalMatches = [];
    try {
      const { severalMatches: several, ...links } = await linkPricedMemberCards();
      summary.memberLinks = links;
      severalMatches = several || [];
    } catch (e) {
      await log("prices", "warn", `Member card check failed: ${e.message}`);
    }
    // Safety net: copies still on a member's own value while their card has a market price (lib/stuck-values.js).
    try { summary.stuckValues = await checkStuckValues({ severalMatches }); } catch (e) {
      await log("prices", "warn", `Stuck collection value check failed: ${e.message}`);
    }
    try { summary.gradingGaps = await refreshGradingGaps(); } catch (e) {
      await log("prices", "warn", `Grade & Flip refresh failed: ${e.message}`);
    }
    // Release emails that stopped part-way (the day's email limit, a restart) carry on.
    try { summary.releaseEmails = await continueReleaseEmails(); } catch (e) {
      await log("admin", "warn", `Release emails crashed: ${e.message}`);
    }
    // Email the admins about new errors or a quiet deal bot (at most hourly, only when there's something new).
    try { summary.adminAlerts = await sendAdminAlerts(); } catch (e) {
      await log("admin", "warn", `Admin error email crashed: ${e.message}`);
    }
    const value = { at: started.toISOString(), ms: Date.now() - started.getTime(), ...summary };
    await db.update(schema.appSettings).set({ value, updatedAt: new Date() }).where(eq(schema.appSettings.key, KEY));
    await log("alerts", summary.failed ? "warn" : "info",
      `Price-alert check: ${summary.checked} alerts checked, ${summary.fired} hit, ${summary.sent} sent${summary.failed ? `, ${summary.failed} failed` : ""}`, value);
    return NextResponse.json({ ok: true, ...value });
  } catch (e) {
    await log("alerts", "error", `Price-alert check crashed: ${e.message}`, { stack: String(e.stack || "").slice(0, 1500) });
    await db.update(schema.appSettings).set({ value: { at: started.toISOString(), error: String(e.message).slice(0, 300) }, updatedAt: new Date() })
      .where(eq(schema.appSettings.key, KEY));
    return NextResponse.json({ ok: false, error: "The price-alert check failed. See the server log." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
