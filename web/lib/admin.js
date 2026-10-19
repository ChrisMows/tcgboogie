import "server-only";
import os from "node:os";
import { count, desc, eq, gte, ilike, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import nodemailer from "nodemailer";
import { compActive, effectiveTier, signupOpen } from "@/lib/access";
import { catalogLive, pingPriceService, priceServiceStatus } from "@/lib/catalog";
import { db, schema } from "@/lib/db";
import { epnLive } from "@/lib/ebay-link";
import { channelsReady } from "@/lib/notify";
import { getCurrentUser } from "@/lib/session";

const { users, accounts, collectionItems, priceWatches, profiles, alertLog, adminLog, appSettings } = schema;

/** Admin pages and actions: the signed-in member must be an admin (ADMIN_EMAILS), else the page doesn't exist. */
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) notFound();
  return user;
}

// ---------- demo (local preview only): a few fake members so the panel can be tried without a database ----------
const g = globalThis;
function demoUsers() {
  if (!g.__tcgDemoUsers) {
    const day = 86400000;
    g.__tcgDemoUsers = [
      { id: "demo", name: "Demo Collector", email: "demo@tcgboogie.com", tier: "premium", createdAt: new Date(Date.now() - 40 * day) },
      { id: "u-ash", name: "Ash Ketchum", email: "ash@example.com", tier: "free", createdAt: new Date(Date.now() - 12 * day), compUntil: new Date(Date.now() + 20 * day), compNote: "Beta tester" },
      { id: "u-misty", name: "Misty Waters", email: "misty@example.com", tier: "premium", subscriptionStatus: "active", createdAt: new Date(Date.now() - 30 * day) },
      { id: "u-brock", name: "Brock Harrison", email: "brock@example.com", tier: "free", createdAt: new Date(Date.now() - 3 * day) },
    ].map((u) => ({ compUnlimited: false, compUntil: null, compNote: null, phone: null, phoneVerifiedAt: null, ...u }));
    g.__tcgDemoLog = [];
  }
  return g.__tcgDemoUsers;
}

// ---------- status ----------
const timed = async (fn) => {
  const t = Date.now();
  try { const r = await fn(); return { ...r, ms: r?.ms ?? Date.now() - t }; } catch (e) { return { ok: false, detail: String(e.message).slice(0, 160), ms: Date.now() - t }; }
};

/** Health of every service the site depends on. Nothing here sends a message or costs money (the price ping is 1 credit, on request). */
export async function systemStatus({ pingPrices = false } = {}) {
  const ready = channelsReady();
  const checks = [];
  const add = (group, name, state, detail) => checks.push({ group, name, state, detail }); // state: ok | warn | down | off

  add("Website", "Web server", "ok", `Up ${Math.round(process.uptime() / 3600 * 10) / 10} h · Node ${process.version} · ${Math.round(process.memoryUsage().rss / 1048576)} MB in use · ${os.platform()}`);

  if (!db) add("Website", "Database (Neon)", "down", "DATABASE_URL isn't set");
  else {
    const r = await timed(async () => { const [{ n }] = await db.select({ n: count() }).from(users); return { ok: true, detail: `${n} members` }; });
    add("Website", "Database (Neon)", r.ok ? (r.ms > 1500 ? "warn" : "ok") : "down", r.ok ? `${r.detail} · answered in ${r.ms} ms` : r.detail);
  }

  if (!catalogLive()) add("Data", "Price service (PokemonPriceTracker)", "off", "No PPT_API_KEY: using the sample catalog");
  else {
    const r = pingPrices ? await timed(pingPriceService) : null;
    const s = priceServiceStatus();
    const ok = r ? r.ok : s.ok;
    const credits = (r?.creditsLeft ?? s.creditsLeft);
    add("Data", "Price service (PokemonPriceTracker)", ok === false ? "down" : credits !== null && credits < 200 ? "warn" : "ok",
      [r ? `Test: ${r.ok ? "OK" : `failed (${r.code ?? r.detail})`} in ${r.ms} ms` : s.at ? `Last call ${ago(s.at)} (${s.code})` : "Key set · no calls since the last restart (use Test to check)",
        credits !== null ? `${credits.toLocaleString()} credits left today` : null].filter(Boolean).join(" · "));
  }

  if (db) {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "price_alerts_last_run")).limit(1);
    const v = row?.value;
    const age = v?.at ? Date.now() - new Date(v.at).getTime() : null;
    add("Alerts", "Price-alert job", !v ? "warn" : v.error ? "down" : age > 6 * 3600 * 1000 ? "warn" : "ok",
      !v ? "Hasn't run yet: add the Hostinger cron job" : v.error ? `Last run failed ${ago(v.at)}: ${v.error}`
        : `Last run ${ago(v.at)} · ${v.checked ?? 0} alerts checked · ${v.fired ?? 0} fired${age > 6 * 3600 * 1000 ? " · overdue: is the cron job set up?" : ""}`);
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const sent = await db.select({ channel: alertLog.channel, ok: alertLog.ok, n: count() }).from(alertLog).where(gte(alertLog.sentAt, since)).groupBy(alertLog.channel, alertLog.ok);
    const failed = sent.filter((x) => !x.ok).reduce((s, x) => s + Number(x.n), 0);
    add("Alerts", "Alerts sent (24 h)", failed ? "warn" : "ok",
      sent.length ? sent.map((x) => `${x.channel}${x.ok ? "" : " failed"}: ${x.n}`).join(" · ") : "None in the last 24 hours");
  }

  if (!ready.email) add("Alerts", "Email (SMTP)", "off", "SMTP settings not added yet");
  else {
    const r = await timed(async () => {
      const t = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 465), secure: Number(process.env.SMTP_PORT || 465) === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
      await t.verify(); // logs in, sends nothing
      return { ok: true, detail: `Signed in as ${process.env.SMTP_USER}` };
    });
    add("Alerts", "Email (SMTP)", r.ok ? "ok" : "down", r.ok ? `${r.detail} · ${r.ms} ms` : `Couldn't sign in: ${r.detail}`);
  }

  if (!ready.discord) add("Alerts", "Discord bot (BoogieBot)", "off", "DISCORD_BOT_TOKEN not added yet");
  else {
    const r = await timed(async () => {
      const res = await fetch("https://discord.com/api/v10/users/@me", { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` }, cache: "no-store" });
      if (!res.ok) return { ok: false, detail: `Discord said ${res.status}` };
      const b = await res.json();
      return { ok: true, detail: `Token works for ${b.username}` };
    });
    add("Alerts", "Discord bot (BoogieBot)", r.ok ? "ok" : "down", r.detail);
  }

  if (!ready.sms) add("Alerts", "Text messages (Twilio)", "off", "Twilio settings not added yet");
  else {
    const r = await timed(async () => {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
        headers: { Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}` }, cache: "no-store",
      });
      if (!res.ok) return { ok: false, detail: `Twilio said ${res.status}` };
      const b = await res.json();
      return { ok: b.status === "active", detail: `Account ${b.status} · sending from ${process.env.TWILIO_FROM}` };
    });
    add("Alerts", "Text messages (Twilio)", r.ok ? "ok" : "down", r.detail);
  }

  add("Sign-in", "Google sign-in", process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET ? "ok" : "off", process.env.AUTH_GOOGLE_ID ? "Configured" : "Not configured");
  add("Sign-in", "Discord sign-in", process.env.AUTH_DISCORD_ID && process.env.AUTH_DISCORD_SECRET ? "ok" : "off", process.env.AUTH_DISCORD_ID ? "Configured" : "Not configured");
  add("Sign-in", "Sign-ups", "ok", signupOpen() ? "Open to everyone" : `Invite-only (${String(process.env.ALLOWED_EMAILS || "").split(",").filter(Boolean).length} invited)`);
  add("Sign-in", "Payments (Stripe)", process.env.STRIPE_SECRET_KEY ? "ok" : "off", process.env.STRIPE_SECRET_KEY ? "Configured" : "Not built yet");
  add("Money", "eBay affiliate (EPN)", epnLive() ? "ok" : "off", epnLive() ? "Campaign ID set: eBay links are tracked" : "No EBAY_CAMPAIGN_ID yet");
  add("Bot", "Deal bot", "off", "Runs on your PC; not connected to the website yet");
  return checks;
}

const ago = (iso) => {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 172800) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
};
export { ago };

// ---------- members ----------
const pub = (u) => ({
  id: u.id, name: u.name, email: u.email, image: u.image, tier: u.tier, effective: effectiveTier(u), comp: compActive(u),
  compUntil: u.compUntil, compUnlimited: Boolean(u.compUnlimited), compNote: u.compNote, subscriptionStatus: u.subscriptionStatus || null,
  createdAt: u.createdAt, phone: u.phone, phoneVerifiedAt: u.phoneVerifiedAt,
});

/** Members matching a name or email (newest first). Empty query lists the newest members. */
export async function searchMembers(q) {
  const term = String(q || "").trim().slice(0, 80);
  if (!db) {
    const w = term.toLowerCase();
    return demoUsers().filter((u) => !w || `${u.name} ${u.email}`.toLowerCase().includes(w)).map(pub);
  }
  const where = term ? or(ilike(users.email, `%${term}%`), ilike(users.name, `%${term}%`)) : undefined;
  const rows = await db.select().from(users).where(where).orderBy(desc(users.createdAt)).limit(50);
  return rows.map(pub);
}

export async function memberCounts() {
  if (!db) { const u = demoUsers(); return { total: u.length, premium: u.filter((x) => effectiveTier(x) === "premium").length, comp: u.filter(compActive).length, week: 2 }; }
  const all = await db.select().from(users);
  const weekAgo = Date.now() - 7 * 86400000;
  return {
    total: all.length,
    premium: all.filter((u) => effectiveTier(u) === "premium").length,
    comp: all.filter(compActive).length,
    week: all.filter((u) => new Date(u.createdAt).getTime() > weekAgo).length,
  };
}

/** Everything the admin panel shows about one member. */
export async function memberDetail(id) {
  if (!db) {
    const u = demoUsers().find((x) => x.id === id);
    if (!u) return null;
    return { ...pub(u), providers: ["google"], stats: { cards: 22, wishlist: 2, alerts: 1, filters: 2 }, recentAlerts: [], log: (g.__tcgDemoLog || []).filter((l) => l.targetUserId === id) };
  }
  const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!u) return null;
  const [providers, items, watches, filters, recentAlerts, log] = await Promise.all([
    db.select({ provider: accounts.provider }).from(accounts).where(eq(accounts.userId, id)),
    db.select({ list: collectionItems.list, quantity: collectionItems.quantity }).from(collectionItems).where(eq(collectionItems.userId, id)),
    db.select({ n: count() }).from(priceWatches).where(eq(priceWatches.userId, id)),
    db.select({ n: count() }).from(profiles).where(eq(profiles.userId, id)),
    db.select().from(alertLog).where(eq(alertLog.userId, id)).orderBy(desc(alertLog.sentAt)).limit(10),
    db.select().from(adminLog).where(eq(adminLog.targetUserId, id)).orderBy(desc(adminLog.at)).limit(15),
  ]);
  return {
    ...pub(u),
    providers: providers.map((p) => p.provider),
    stats: {
      cards: items.filter((i) => i.list === "owned").reduce((s, i) => s + i.quantity, 0),
      wishlist: items.filter((i) => i.list === "wishlist").length,
      alerts: Number(watches[0]?.n || 0),
      filters: Number(filters[0]?.n || 0),
    },
    recentAlerts,
    log,
  };
}

export async function recentAdminLog(limit = 20) {
  if (!db) return (g.__tcgDemoLog || []).slice(0, limit);
  return db.select().from(adminLog).orderBy(desc(adminLog.at)).limit(limit);
}

/** Change a member and record it in the admin log. */
export async function updateMember(admin, id, fields, action, details) {
  if (!db) {
    const u = demoUsers().find((x) => x.id === id);
    if (!u) return null;
    Object.assign(u, fields);
    g.__tcgDemoLog.unshift({ id: Date.now(), adminEmail: admin.email, targetUserId: id, targetEmail: u.email, action, details, at: new Date() });
    return u;
  }
  const [u] = await db.update(users).set(fields).where(eq(users.id, id)).returning();
  if (!u) return null;
  await db.insert(adminLog).values({ adminEmail: admin.email, targetUserId: id, targetEmail: u.email, action, details });
  return u;
}

