import "server-only";
import crypto from "node:crypto";
import { gte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// Our own visit counts (Admin → Traffic), without cookies or outside trackers: daily totals in site_traffic.
//   view     page views by page          visitor  people per day (a salted code of IP + browser that changes daily,
//   ref      sites that sent visitors                never stored with anything that identifies them)
//   source   ?utm_source / campaign links            signup   new members by what first brought them here
const { siteTraffic, rateLimits } = schema;
export const today = () => new Date().toISOString().slice(0, 10);

/** Add n to one counter for today. */
export async function bump(kind, key, n = 1) {
  if (!db || !key) return;
  const k = String(key).slice(0, 120);
  await db.insert(siteTraffic).values({ day: today(), kind, key: k, count: n })
    .onConflictDoUpdate({ target: [siteTraffic.day, siteTraffic.kind, siteTraffic.key], set: { count: sql`${siteTraffic.count} + ${n}` } });
}

/** True the first time this (anonymous, daily-changing) visitor is seen today. */
export async function firstVisitToday(ip, userAgent) {
  if (!db) return false;
  const day = today();
  const code = crypto.createHmac("sha256", process.env.AUTH_SECRET || "tcgb").update(`${day}|${ip}|${userAgent}`).digest("base64url").slice(0, 22);
  const tomorrow = new Date(`${day}T00:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 2);
  const rows = await db.insert(rateLimits).values({ id: `visit:${day}:${code}`, count: 1, expiresAt: tomorrow }).onConflictDoNothing().returning({ id: rateLimits.id });
  return rows.length > 0;
}

/** Credit a new member's sign-up to what first brought them, once per member. */
export async function creditSignup(userId, source) {
  if (!db || !userId) return false;
  const rows = await db.insert(rateLimits).values({ id: `signup-src:${userId}`, count: 1, expiresAt: new Date(Date.now() + 3 * 86400000) })
    .onConflictDoNothing().returning({ id: rateLimits.id });
  if (!rows.length) return false;
  await bump("signup", source || "direct");
  return true;
}

/** Admin → Traffic: the last `days` days. */
export async function trafficReport(days = 30) {
  if (!db) return null;
  const from = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  const rows = await db.select().from(siteTraffic).where(gte(siteTraffic.day, from));
  const signups = await db.select({ day: sql`to_char(${schema.users.createdAt}, 'YYYY-MM-DD')`, n: sql`count(*)::int` }).from(schema.users)
    .where(gte(schema.users.createdAt, new Date(`${from}T00:00:00Z`))).groupBy(sql`1`);
  const byDay = new Map();
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    byDay.set(d, { day: d, views: 0, visitors: 0, signups: 0 });
  }
  const top = { view: new Map(), ref: new Map(), source: new Map(), signup: new Map() };
  for (const r of rows) {
    const d = byDay.get(r.day);
    if (d && r.kind === "view") d.views += r.count;
    if (d && r.kind === "visitor") d.visitors += r.count;
    if (top[r.kind]) top[r.kind].set(r.key, (top[r.kind].get(r.key) || 0) + r.count);
  }
  for (const s of signups) if (byDay.has(s.day)) byDay.get(s.day).signups = s.n;
  const list = (m, n = 12) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  const daysList = [...byDay.values()];
  return {
    days: daysList,
    totals: daysList.reduce((t, d) => ({ views: t.views + d.views, visitors: t.visitors + d.visitors, signups: t.signups + d.signups }), { views: 0, visitors: 0, signups: 0 }),
    pages: list(top.view), refs: list(top.ref), sources: list(top.source), signupSources: list(top.signup),
  };
}

