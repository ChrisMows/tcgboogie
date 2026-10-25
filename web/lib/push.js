import "server-only";
import { and, eq } from "drizzle-orm";
import webpush from "web-push";
import { db, schema } from "@/lib/db";
import { open, seal } from "@/lib/secret-box";

// Push alerts to phones and browsers (Web Push): free, instant, and they work on Android and on iPhone once TCG
// Boogie is on the home screen (iOS 16.4+). Each device a member switches on in Settings saves a subscription here;
// public/sw.js shows the notification and opens the deal or card when it's tapped.
// The site signs its pushes with its own key pair (VAPID), made the first time it's needed and kept in the database
// (app_setting "web_push_vapid", private key sealed with AUTH_SECRET), so there's nothing to set up on the host.
const { pushSubscriptions, appSettings } = schema;
const SITE = (process.env.AUTH_URL || "https://tcgboogie.com").replace(/\/$/, "");
const g = globalThis;

async function keys() {
  if (g.__tcgVapid) return g.__tcgVapid;
  if (!db) return null;
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "web_push_vapid")).limit(1);
  let v = row?.value;
  if (!v?.publicKey) {
    const made = webpush.generateVAPIDKeys();
    v = { publicKey: made.publicKey, privateKey: seal(made.privateKey) };
    // Two servers making keys at once: the first one saved wins, and both use it.
    await db.insert(appSettings).values({ key: "web_push_vapid", value: v }).onConflictDoNothing();
    const [again] = await db.select().from(appSettings).where(eq(appSettings.key, "web_push_vapid")).limit(1);
    v = again.value;
  }
  g.__tcgVapid = { publicKey: v.publicKey, privateKey: open(v.privateKey) };
  return g.__tcgVapid;
}

/** The public key browsers need to subscribe (null without a database). */
export async function pushPublicKey() {
  return (await keys())?.publicKey || null;
}

/** "iPhone", "Android", "Mac", "Windows"... from the browser's user agent, for the Settings list. */
export function deviceName(ua) {
  const s = String(ua || "");
  return /iPhone/.test(s) ? "iPhone" : /iPad/.test(s) ? "iPad" : /Android/.test(s) ? "Android" : /Macintosh/.test(s) ? "Mac"
    : /Windows/.test(s) ? "Windows" : /Linux/.test(s) ? "Linux" : "Browser";
}

export async function saveSubscription(userId, sub, device) {
  const endpoint = String(sub?.endpoint || "");
  const { p256dh, auth } = sub?.keys || {};
  if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) throw new Error("That isn't a push subscription");
  await db.insert(pushSubscriptions).values({ userId, endpoint, p256dh, auth, device })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, p256dh, auth, device } });
}

export async function removeSubscription(userId, endpoint) {
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, String(endpoint))));
}

export async function listSubscriptions(userId) {
  if (!db) return [];
  return db.select({ endpoint: pushSubscriptions.endpoint, device: pushSubscriptions.device, createdAt: pushSubscriptions.createdAt })
    .from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
}

/**
 * One notification to every device this member switched on: { title, body, url, tag }. Returns how many devices got
 * it; throws when none did (so the alert log shows a failure). Devices the push service says are gone are removed.
 */
export async function sendPush(userId, { title, body, url, tag }) {
  const k = await keys();
  if (!k) throw new Error("Push isn't available");
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  if (!subs.length) throw new Error("No devices switched on for push");
  const payload = JSON.stringify({ title, body, url: url?.startsWith("/") ? `${SITE}${url}` : url || `${SITE}/app/deals`, tag });
  const options = { vapidDetails: { subject: "mailto:support@tcgboogie.com", publicKey: k.publicKey, privateKey: k.privateKey }, TTL: 3600, urgency: "high" };
  let sent = 0;
  let lastError = null;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, options);
      sent++;
      await db.update(pushSubscriptions).set({ lastSentAt: new Date() }).where(eq(pushSubscriptions.id, s.id));
    } catch (e) {
      lastError = e;
      // 404/410: the member turned notifications off in the phone's settings or removed the app.
      if (e.statusCode === 404 || e.statusCode === 410) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
    }
  }
  if (!sent) throw new Error(`Push failed${lastError?.statusCode ? ` (${lastError.statusCode})` : ""}: ${String(lastError?.body || lastError?.message || "").slice(0, 120)}`);
  return sent;
}
