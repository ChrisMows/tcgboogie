import "server-only";
import crypto from "node:crypto";

// Push alerts to the Android app (android-webview/) through Firebase Cloud Messaging: a WebView can't use web push, so
// the app registers with Firebase and saves its token as a push subscription with an "fcm:" endpoint (lib/push.js).
// FCM_SERVICE_ACCOUNT holds the Firebase service account's JSON key, plain or base64. Free, with no daily limit to manage.

const g = globalThis;
export const FCM_PREFIX = "fcm:";

function serviceAccount() {
  const raw = String(process.env.FCM_SERVICE_ACCOUNT || "").trim();
  if (!raw) return null;
  try { return JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8")); } catch { return null; }
}

export const fcmReady = () => Boolean(serviceAccount()?.private_key);

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

/** The signed request Google swaps for an access token. */
export function serviceJwt(account, nowSeconds = Math.floor(Date.now() / 1000)) {
  const body = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  })}`;
  return `${body}.${crypto.createSign("RSA-SHA256").update(body).sign(account.private_key, "base64url")}`;
}

async function accessToken(account) {
  if (g.__tcgFcmToken?.until > Date.now()) return g.__tcgFcmToken.value;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: serviceJwt(account) }),
    cache: "no-store",
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`Firebase sign-in failed (${res.status})`);
  g.__tcgFcmToken = { value: j.access_token, until: Date.now() + 50 * 60000 };
  return j.access_token;
}

/**
 * One notification to one app install. The app draws it (FcmService), so it looks the same whether the app is open or
 * closed. Throws an error with statusCode 404 when Firebase says the install is gone.
 */
export async function sendFcm(endpoint, { title, body, url, tag }) {
  const account = serviceAccount();
  if (!account?.private_key) throw new Error("App push isn't set up (FCM_SERVICE_ACCOUNT)");
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken(account)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: {
      token: endpoint.slice(FCM_PREFIX.length),
      data: { title: String(title || ""), body: String(body || ""), url: String(url || ""), tag: String(tag || "") },
      android: { priority: "HIGH", ttl: "3600s" },
    } }),
    cache: "no-store",
  });
  if (res.ok) return;
  const text = await res.text().catch(() => "");
  const err = new Error(`Firebase said ${res.status}: ${text.slice(0, 120)}`);
  err.statusCode = res.status === 404 || /UNREGISTERED/.test(text) ? 404 : res.status;
  throw err;
}
