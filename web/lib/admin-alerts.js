import "server-only";
import { and, desc, eq, gt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { log } from "@/lib/log";
import { sendEmail } from "@/lib/notify";

// Tells the admins (ADMIN_EMAILS) when something breaks, so problems don't sit unseen in Admin → Logs:
//   - every error logged since the last email (website, payments, alerts, prices and the deal bot), grouped and counted
//   - the deal bot going quiet (no check-in and no new deal for 90 minutes)
// Runs with the scheduled price-alert check. Sends at most one email an hour, and only when there's something new;
// a quiet bot is mentioned once until it's back.
const KEY = "admin_alert_state";
const MIN_GAP_MS = 60 * 60 * 1000;
const BOT_QUIET_MS = 90 * 60 * 1000;
const SITE = (process.env.AUTH_URL || "https://tcgboogie.com").replace(/\/$/, "");

const admins = () => String(process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);

export async function sendAdminAlerts() {
  if (!db || !admins().length) return { sent: false, reason: "no admins or database" };
  const { appSettings, systemLog, deals } = schema;
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, KEY)).limit(1);
  const state = row?.value || {};
  const now = Date.now();
  if (state.sentAt && now - new Date(state.sentAt).getTime() < MIN_GAP_MS) return { sent: false, reason: "sent recently" };
  // First run: start from now rather than mailing the whole history.
  const since = state.checkedAt ? new Date(state.checkedAt) : new Date(now - MIN_GAP_MS);

  const errors = await db.select({ source: systemLog.source, message: systemLog.message, at: systemLog.at }).from(systemLog)
    .where(and(eq(systemLog.level, "error"), gt(systemLog.at, since))).orderBy(desc(systemLog.at)).limit(300);
  const groups = new Map();
  for (const e of errors) {
    const k = `${e.source}|${e.message}`;
    const g = groups.get(k) || { source: e.source, message: e.message, count: 0, last: e.at };
    g.count++;
    groups.set(k, g);
  }

  const [hb] = await db.select().from(appSettings).where(eq(appSettings.key, "bot_heartbeat")).limit(1);
  const [lastDeal] = await db.select({ at: deals.foundAt }).from(deals).orderBy(desc(deals.foundAt)).limit(1);
  const botAt = Math.max(hb?.updatedAt ? new Date(hb.updatedAt).getTime() : 0, lastDeal?.at ? new Date(lastDeal.at).getTime() : 0);
  const botQuiet = botAt > 0 && now - botAt > BOT_QUIET_MS;
  const newlyQuiet = botQuiet && !state.botQuiet;

  const next = { ...state, checkedAt: new Date(now).toISOString(), botQuiet };
  if (!groups.size && !newlyQuiet) {
    await saveState(next);
    return { sent: false, reason: "nothing new" };
  }

  const fmt = (d) => new Date(d).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const lines = [];
  if (newlyQuiet) lines.push(`⚠ The deal bot has been quiet since ${fmt(botAt)} ET: no check-in and no new deals. Check the dealbot service on the server.`);
  const list = [...groups.values()].sort((a, b) => b.count - a.count);
  if (list.length) lines.push(`${errors.length} error${errors.length === 1 ? "" : "s"} since ${fmt(since)} ET:`);
  for (const g of list.slice(0, 12)) lines.push(`• [${g.source}] ${g.message.slice(0, 160)}${g.count > 1 ? ` (×${g.count})` : ""}`);
  if (list.length > 12) lines.push(`…and ${list.length - 12} more kinds.`);

  const subject = newlyQuiet ? "TCG Boogie: the deal bot is quiet" : `TCG Boogie: ${errors.length} new error${errors.length === 1 ? "" : "s"}`;
  try {
    for (const to of admins()) {
      await sendEmail(to, { subject, heading: newlyQuiet ? "The deal bot needs a look" : "Something went wrong on the site", lines,
        button: { label: "Open the logs", url: `${SITE}/app/logs?tab=problems` },
        footer: "Sent to the site's admins at most once an hour, only when there's something new." });
    }
    next.sentAt = new Date(now).toISOString();
  } catch (e) {
    await log("admin", "warn", `Couldn't email the admins about errors: ${e.message}`);
    return { sent: false, reason: "email failed" };
  }
  await saveState(next);
  return { sent: true, errors: errors.length, botQuiet };
}

async function saveState(value) {
  await db.insert(schema.appSettings).values({ key: KEY, value })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value, updatedAt: new Date() } });
}
