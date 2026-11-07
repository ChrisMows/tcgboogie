import "server-only";
import crypto from "node:crypto";
import { and, eq, like, lt } from "drizzle-orm";
import { headers } from "next/headers";
import { db, schema } from "@/lib/db";
import { isAppUA } from "@/lib/app-shell";

// Signing in to the Android app. Google refuses sign-in inside a WebView, and a browser tab keeps its own cookies, so:
//   1. The app makes a secret (the verifier), and opens /app-login/start in a browser tab with its hash (the challenge).
//   2. The member signs in there as usual. /app-login/done makes a one-time code for them and sends it to the app.
//   3. The app posts the code and the secret to /app-login/redeem in its WebView, which starts its own session.
// A code only works once, for two minutes, and only with the secret that stayed inside the app.
// Codes live in the sign-in token table Auth.js already has, under their own "app-login:" prefix, stored hashed.

const { verificationTokens, sessions } = schema;
const PREFIX = "app-login:";
const CODE_MINUTES = 2;
const SESSION_DAYS = 30; // the same as auth.js

export const APP_LOGIN_PROVIDERS = ["google", "discord"];
export const FLOW_COOKIE = "app_login_flow"; // this browser tab agreed to send a sign-in to this challenge
export const validChallenge = (c) => /^[\w-]{43}$/.test(String(c || ""));

const sha256 = (s) => crypto.createHash("sha256").update(s);
export const challengeFor = (verifier) => sha256(String(verifier)).digest("base64url");

export async function fromApp() {
  return isAppUA((await headers()).get("user-agent"));
}

/** A new one-time code for this member, to hand to the app holding the challenge's secret. */
export async function createAppCode(userId, challenge) {
  const code = crypto.randomBytes(32).toString("base64url");
  await db.delete(verificationTokens).where(and(like(verificationTokens.identifier, `${PREFIX}%`), lt(verificationTokens.expires, new Date())));
  await db.insert(verificationTokens).values({
    identifier: `${PREFIX}${userId}:${challenge}`,
    token: sha256(code).digest("hex"),
    expires: new Date(Date.now() + CODE_MINUTES * 60000),
  });
  return code;
}

/** Uses up a code. Returns the member's id, or null when it's unknown, used, expired or the secret doesn't match. */
export async function redeemAppCode(code, verifier) {
  if (!db || !code || !verifier) return null;
  const [row] = await db.delete(verificationTokens)
    .where(and(eq(verificationTokens.token, sha256(String(code)).digest("hex")), like(verificationTokens.identifier, `${PREFIX}%`)))
    .returning();
  if (!row || row.expires.getTime() < Date.now()) return null;
  const rest = row.identifier.slice(PREFIX.length);
  const split = rest.lastIndexOf(":");
  const expected = Buffer.from(rest.slice(split + 1));
  const actual = Buffer.from(challengeFor(verifier));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual) ? rest.slice(0, split) : null;
}

/** A normal Auth.js database session for the WebView, with the cookie it should set. */
export async function createAppSession(userId) {
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  const sessionToken = crypto.randomUUID();
  await db.insert(sessions).values({ sessionToken, userId, expires });
  const secure = String(process.env.AUTH_URL || "https://").startsWith("https:");
  return {
    name: `${secure ? "__Secure-" : ""}authjs.session-token`,
    value: sessionToken,
    options: { httpOnly: true, sameSite: "lax", path: "/", secure, expires },
  };
}

/** A small page that opens the app at `url` (tcgboogie://...), with a button in case the browser wants a tap first. */
export function openAppPage(url, title = "Back to TCG Boogie") {
  const safe = String(url).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0;url=${safe}"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-content:center;gap:16px;text-align:center;background:#0b0e12;color:#f4f5ef;font:16px system-ui,sans-serif;padding:24px}a{display:inline-block;padding:12px 20px;border-radius:10px;background:#d3ff66;color:#15200c;font-weight:600;text-decoration:none}</style>
</head><body><p>Going back to the app.</p><p><a href="${safe}">Open TCG Boogie</a></p></body></html>`,
  { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
