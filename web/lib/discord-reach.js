import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { log } from "@/lib/log";
import { DISCORD_GUILD_ID, DISCORD_INVITE } from "@/lib/social";

// Can BoogieBot reach a member on Discord? Discord only lets a bot DM people who share a server with it, and lets each
// person turn off DMs from a server's members. Members who connect Discord but never join the TCG Boogie server get no
// Discord alerts, so:
//   - discordReach(user): what's wrong, for the warning shown on every member page (components/DiscordReachNotice.js)
//   - noteDmFailure(id): called when a DM bounces: works out why, emails the member once a week at most, and says it
//     in the log as a member's setting (not a site error, so the admin's error email leaves it out)
const { accounts, users, appSettings } = schema;
const API = "https://discord.com/api/v10";
const g = globalThis;
g.__tcgDiscordMember ??= new Map(); // discord id -> { at, in }
const OFF_KEY = (userId) => `discord_dm_off:${userId}`;
const WEEK = 7 * 86400000;

/** The member's Discord user ID, if they connected Discord. */
export async function discordIdFor(userId) {
  if (!db) return null;
  const [a] = await db.select({ id: accounts.providerAccountId }).from(accounts)
    .where(and(eq(accounts.userId, String(userId)), eq(accounts.provider, "discord"))).limit(1);
  return a?.id || null;
}

/** true / false: is this Discord user in our server? null when we can't tell (no bot token, Discord down). */
export async function inServer(discordId, { fresh = false } = {}) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || !discordId) return null;
  const hit = g.__tcgDiscordMember.get(String(discordId));
  // Members are remembered 30 minutes; "not in it" only 2, so joining shows up almost at once.
  if (!fresh && hit && Date.now() - hit.at < (hit.in ? 30 : 2) * 60000) return hit.in;
  try {
    const r = await fetch(`${API}/guilds/${DISCORD_GUILD_ID}/members/${encodeURIComponent(discordId)}`,
      { headers: { Authorization: `Bot ${token}` }, cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (r.status !== 200 && r.status !== 404) return null;
    const yes = r.status === 200;
    g.__tcgDiscordMember.set(String(discordId), { at: Date.now(), in: yes });
    return yes;
  } catch { return null; }
}

/**
 * Why Discord alerts can't reach this member, or null when they can (or don't use them):
 * { kind: "not-member" } or { kind: "dms-off" } (in the server, but a DM bounced this week).
 */
export async function discordReach(user) {
  if (!db || user.demo || !user.discordConnected || !user.alertDiscord || !user.plan?.watchAlertChannels?.includes("discord")) return null;
  const id = await discordIdFor(user.id);
  const member = await inServer(id);
  if (member === false) return { kind: "not-member" };
  if (member === true) {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, OFF_KEY(user.id))).limit(1);
    if (row && Date.now() - new Date(row.value?.at || 0).getTime() < WEEK) return { kind: "dms-off" };
  }
  return null;
}

/** A DM went through: forget any "DMs off" note for that member. */
export async function noteDmSuccess(discordId) {
  if (!db) return;
  try {
    const [a] = await db.select({ userId: accounts.userId }).from(accounts)
      .where(and(eq(accounts.provider, "discord"), eq(accounts.providerAccountId, String(discordId)))).limit(1);
    if (a) await db.delete(appSettings).where(eq(appSettings.key, OFF_KEY(a.userId)));
  } catch { /* best effort */ }
}

/**
 * A DM bounced. Returns why, in words for the log: "isn't in the TCG Boogie Discord server" / "has Discord DMs turned
 * off" / "couldn't be reached". The member gets one email about it (at most once a week, if email alerts are on).
 */
export async function noteDmFailure(discordId) {
  const member = await inServer(discordId, { fresh: true });
  const kind = member === false ? "not-member" : member === true ? "dms-off" : null;
  if (!db || !kind) return "couldn't be reached on Discord";
  try {
    const [row] = await db.select({ user: users }).from(accounts).innerJoin(users, eq(users.id, accounts.userId))
      .where(and(eq(accounts.provider, "discord"), eq(accounts.providerAccountId, String(discordId)))).limit(1);
    const user = row?.user;
    if (user) {
      const [prev] = await db.select().from(appSettings).where(eq(appSettings.key, OFF_KEY(user.id))).limit(1);
      const emailedAt = prev?.value?.emailedAt ? new Date(prev.value.emailedAt).getTime() : 0;
      const email = user.email && user.alertEmail !== false && Date.now() - emailedAt > WEEK;
      const value = { at: new Date().toISOString(), kind, emailedAt: email ? new Date().toISOString() : prev?.value?.emailedAt || null };
      await db.insert(appSettings).values({ key: OFF_KEY(user.id), value })
        .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
      if (email) {
        const { sendEmail } = await import("@/lib/notify");
        const site = (process.env.AUTH_URL || "https://tcgboogie.com").replace(/\/$/, "");
        await sendEmail(user.email, kind === "not-member" ? {
          subject: "Your Discord alerts can't reach you yet",
          heading: "Join our Discord to get alerts there",
          lines: ["You turned on Discord alerts, but BoogieBot can't message you: Discord only lets a bot message people who are in its server.",
            "Join the TCG Boogie server (it's free) and your next alert will arrive in your Discord DMs. Your other alerts keep working meanwhile."],
          button: { label: "Join the TCG Boogie Discord", url: DISCORD_INVITE },
          footer: `Prefer not to use Discord? Turn Discord alerts off in Settings: ${site}/app/account#alerts`,
        } : {
          subject: "Your Discord alerts can't reach you",
          heading: "Turn on DMs from the TCG Boogie server",
          lines: ["You're in our Discord server, but your Discord settings block messages from its members, so BoogieBot's alerts bounce.",
            "In Discord, open the TCG Boogie server, tap its name, then Privacy Settings, and turn on Direct Messages. Your other alerts keep working meanwhile."],
          button: { label: "Open the TCG Boogie Discord", url: DISCORD_INVITE },
          footer: `Prefer not to use Discord? Turn Discord alerts off in Settings: ${site}/app/account#alerts`,
        }).catch((e) => log("alerts", "warn", `Couldn't email a member about Discord: ${e.message}`, null, user.id));
      }
    }
  } catch (e) { await log("alerts", "warn", `Couldn't record a Discord DM failure: ${e.message}`); }
  return kind === "not-member" ? "isn't in the TCG Boogie Discord server" : "has Discord DMs turned off for the server";
}
