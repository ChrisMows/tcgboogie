import "server-only";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// Admin -> Usage: everything we use that has a limit or a bill, day by day (UTC), for the last 60 days.
//   - counters the website adds to as things happen: emails sent, Claude requests and tokens (bumpUsage);
//   - gauges the deal bot sets every few minutes: eBay calls, price credits used, the server's disk and memory, the
//     database's size (pokemon-deal-finder/dealfinder/shared.py usage_set);
//   - counts read straight from our own logs: alerts by channel, posts to X.
// Each metric has its daily limit (cap) where there is one, so the page can show how close each day came.
const { usageDaily } = schema;
const DAY = 86400000;
export const USAGE_DAYS = 60;
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Add n to today's count of a metric, with its daily limit when it has one (the bot's usage warnings read it).
 * Never throws: counting must not break what's being counted.
 */
export function bumpUsage(metric, n = 1, cap = null) {
  if (!db || !Number.isFinite(n) || n <= 0) return;
  db.insert(usageDaily).values({ day: today(), metric, value: n, cap })
    .onConflictDoUpdate({ target: [usageDaily.day, usageDaily.metric],
      set: { value: sql`${usageDaily.value} + ${n}`, cap: sql`coalesce(${cap}::double precision, ${usageDaily.cap})`, updatedAt: new Date() } })
    .catch(() => {});
}

/** A Claude response's request and tokens (input, cached input and output) for today's totals. */
export function noteClaude(response) {
  const u = response?.usage || {};
  bumpUsage("claude_requests", 1);
  bumpUsage("claude_tokens", (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.output_tokens || 0));
}

export const emailCap = () => (process.env.ALERT_SMTP_HOST ? null : Number(process.env.EMAIL_DAILY_LIMIT || 1000));

// What the page shows, in order. cap: a fixed daily limit; "row": the limit the bot recorded with the value.
export const METRICS = [
  { key: "ppt_credits", group: "Daily limits", label: "Price service credits", unit: "credits", cap: 20000,
    note: "PokemonPriceTracker, $9.99 plan: 20,000 a day for the bot and the website together, reset at midnight UTC. The bot keeps a reserve for the website." },
  { key: "ebay_calls", group: "Daily limits", label: "eBay API calls", unit: "calls", cap: 5000,
    note: "eBay's Browse API allows 5,000 a day (reset at midnight UTC). The bot slows itself down near 4,800." },
  { key: "emails", group: "Daily limits", label: "Emails sent", unit: "emails", cap: emailCap,
    note: "Alerts, recaps and sign-in links. The Hostinger mailbox allows about 1,000 a day (EMAIL_DAILY_LIMIT); Amazon SES lifts that once it's switched on." },
  { key: "vps_disk_gb", group: "Server", label: "Server disk", unit: "GB", cap: "row", decimals: 1,
    note: "The VPS (bot, database, backups, staging). The day's highest reading." },
  { key: "vps_memory_gb", group: "Server", label: "Server memory", unit: "GB", cap: "row", decimals: 2,
    note: "Memory in use on the VPS at its busiest moment of the day." },
  { key: "db_size_mb", group: "Server", label: "Database size", unit: "MB", decimals: 0,
    note: "The website's database. Most of it is the saved price cache; members' data is a few MB." },
  { key: "claude_requests", group: "Pay as you go", label: "Claude AI requests", unit: "requests",
    note: "Photo checks on deals (the bot), the appraiser, Boogie Bot, card requests, import columns and idea sorting. No daily limit; billed per use." },
  { key: "claude_tokens", group: "Pay as you go", label: "Claude AI tokens", unit: "tokens",
    note: "Text and images sent to Claude plus its answers: what the bill is based on." },
  { key: "alerts_email", group: "Pay as you go", label: "Price alerts by email", unit: "alerts", source: "alerts", channel: "email",
    note: "Member price alerts sent by email (from the alert log)." },
  { key: "alerts_discord", group: "Pay as you go", label: "Price alerts on Discord", unit: "alerts", source: "alerts", channel: "discord",
    note: "Member price alerts sent as Discord DMs. Free, but Discord limits how fast a bot can send." },
  { key: "alerts_sms", group: "Pay as you go", label: "Text message alerts", unit: "texts", source: "alerts", channel: "sms",
    note: "Twilio bills each text. Members are capped per day (SMS_DEALS_PER_DAY)." },
  { key: "x_posts", group: "Pay as you go", label: "Posts to X", unit: "posts", source: "x",
    note: "Posts sent from Admin -> Social media. X bills API posts per use." },
];

/** Every metric with its last 60 days ({ day, value, cap } per day, oldest first, days with nothing = 0). */
export async function usageReport() {
  const days = Array.from({ length: USAGE_DAYS }, (_, i) => new Date(Date.now() - (USAGE_DAYS - 1 - i) * DAY).toISOString().slice(0, 10));
  const since = days[0];
  const byKey = new Map();
  const put = (key, day, value, cap = null) => {
    if (!byKey.has(key)) byKey.set(key, new Map());
    const m = byKey.get(key), prev = m.get(day);
    m.set(day, { value: (prev?.value || 0) + Number(value || 0), cap: cap ?? prev?.cap ?? null });
  };
  if (db) {
    const dayOf = (col) => sql`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD')`;
    const [rows, alerts, posts] = await Promise.all([
      db.select().from(usageDaily).where(gte(usageDaily.day, since)),
      db.select({ day: dayOf(schema.alertLog.sentAt), channel: schema.alertLog.channel, n: count() }).from(schema.alertLog)
        .where(and(gte(schema.alertLog.sentAt, new Date(since)), eq(schema.alertLog.ok, true))).groupBy(sql`1`, schema.alertLog.channel),
      db.select({ day: dayOf(schema.socialPosts.at), n: count() }).from(schema.socialPosts)
        .where(and(gte(schema.socialPosts.at, new Date(since)), eq(schema.socialPosts.status, "posted"))).groupBy(sql`1`),
    ]).catch(() => [[], [], []]);
    for (const r of rows) put(r.metric, r.day, r.value, r.cap);
    for (const a of alerts) put(`alerts_${a.channel}`, a.day, a.n);
    for (const p of posts) put("x_posts", p.day, p.n);
  } else {
    // The local preview has no database: made-up numbers (a slow climb, a few busy days) so the charts can be checked.
    const wave = (i, k) => 0.55 + 0.3 * Math.sin(i / 5 + k) + (i % 11 === 3 ? 0.3 : 0);
    days.forEach((day, i) => {
      put("ppt_credits", day, Math.round(20000 * Math.min(0.97, wave(i, 0) * (0.6 + i / 120))), 20000);
      put("ebay_calls", day, Math.round(4700 * Math.min(1, wave(i, 1))), 5000);
      put("emails", day, Math.round(40 + i * 2.5 * wave(i, 2)));
      put("vps_disk_gb", day, 2.4 + i * 0.04, 48);
      put("vps_memory_gb", day, 0.8 + 0.6 * wave(i, 3), 3.8);
      put("db_size_mb", day, 95 + i * 0.6);
      put("claude_requests", day, Math.round(30 * wave(i, 4)));
      put("claude_tokens", day, Math.round(90000 * wave(i, 4)));
      if (i % 3) put("alerts_email", day, Math.round(6 * wave(i, 5)));
    });
  }
  return METRICS.map((m) => {
    const fixed = typeof m.cap === "function" ? m.cap() : typeof m.cap === "number" ? m.cap : null;
    const series = days.map((day) => {
      const v = byKey.get(m.key)?.get(day);
      return { day, value: v?.value || 0, cap: m.cap === "row" ? v?.cap ?? null : fixed };
    });
    const { cap: _c, ...rest } = m;
    return { ...rest, cap: m.cap === "row" ? [...series].reverse().find((s) => s.cap)?.cap ?? null : fixed, series, recorded: byKey.has(m.key) };
  });
}
