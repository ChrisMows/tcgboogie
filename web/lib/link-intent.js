import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";

// When a signed-in member clicks "Connect Discord", we set a short-lived signed cookie. The sign-in check reads it to
// know this is a connection to an existing account, not a new sign-up (so the invite-only rule doesn't apply).
const NAME = "link_intent";
const TTL = 10 * 60; // seconds

const sign = (v) => crypto.createHmac("sha256", process.env.AUTH_SECRET || "").update(v).digest("base64url");

export async function setLinkIntent(userId) {
  const value = `${userId}.${Math.floor(Date.now() / 1000) + TTL}`;
  (await cookies()).set(NAME, `${value}.${sign(value)}`, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: TTL });
}

/** The user ID from a valid, unexpired link cookie, or null. */
export async function readLinkIntent() {
  const raw = (await cookies()).get(NAME)?.value || "";
  const i = raw.lastIndexOf(".");
  if (i < 0) return null;
  const value = raw.slice(0, i), mac = raw.slice(i + 1);
  const good = sign(value);
  if (mac.length !== good.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(good))) return null;
  const [userId, exp] = value.split(".");
  return Number(exp) > Date.now() / 1000 ? userId : null;
}

export async function clearLinkIntent() {
  (await cookies()).delete(NAME);
}
