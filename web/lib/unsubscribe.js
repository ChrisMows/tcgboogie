import "server-only";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { log } from "@/lib/log";

// One-click unsubscribe links in every email. A link names the member and what to stop ("recap" or "alerts") and is
// signed, so it works without signing in but can't be forged for someone else. Mail apps that support one-click
// unsubscribe (RFC 8058) POST to the same address.
export const KINDS = { recap: "the email recap", alerts: "email alerts", updates: "product update emails" };
const SITE = process.env.AUTH_URL || "https://tcgboogie.com";

const sign = (userId, kind) => crypto.createHmac("sha256", process.env.AUTH_SECRET || "").update(`unsub:${kind}:${userId}`).digest("base64url");

export function unsubscribeUrl(userId, kind) {
  return `${SITE}/api/unsubscribe?u=${encodeURIComponent(userId)}&k=${kind}&t=${sign(userId, kind)}`;
}

/** True when the link's signature matches. */
export function validUnsubscribe(userId, kind, token) {
  if (!process.env.AUTH_SECRET || !userId || !KINDS[kind] || typeof token !== "string") return false;
  const good = sign(String(userId), kind);
  return token.length === good.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(good));
}

/** Turn the emails off for this member: the recap setting to "off", product updates off, or email alerts off. */
export async function applyUnsubscribe(userId, kind) {
  if (!db) return;
  const { users } = schema;
  await db.update(users).set(kind === "recap" ? { emailRecap: "off" } : kind === "updates" ? { emailUpdates: false } : { alertEmail: false }).where(eq(users.id, String(userId)));
  await log("alerts", "info", `Unsubscribed from ${KINDS[kind]} by email link`, null, String(userId));
}
