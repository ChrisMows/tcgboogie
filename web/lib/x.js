import "server-only";
import crypto from "node:crypto";

// Posting to X (Twitter) as the TCG Boogie account: Admin -> Sales posts a sale's share image with its caption once
// an admin approves it. Needs the account's own developer keys (developer.x.com -> the app -> Keys and tokens), with
// the app's permissions set to "Read and write", in the host's environment variables:
//   X_API_KEY, X_API_SECRET            (the app's "API Key and Secret", a.k.a. consumer keys)
//   X_ACCESS_TOKEN, X_ACCESS_SECRET    (the account's "Access Token and Secret", made after setting Read and write)
// Requests are signed with OAuth 1.0a (user context), so posts come from that account.

export const xReady = () => Boolean(process.env.X_API_KEY && process.env.X_API_SECRET && process.env.X_ACCESS_TOKEN && process.env.X_ACCESS_SECRET);

const enc = (s) => encodeURIComponent(String(s)).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** The OAuth 1.0a Authorization header for one request (query/body form params go in `params`; JSON and multipart bodies don't). */
function authHeader(method, url, params = {}) {
  const oauth = {
    oauth_consumer_key: process.env.X_API_KEY, oauth_nonce: crypto.randomBytes(16).toString("hex"), oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)), oauth_token: process.env.X_ACCESS_TOKEN, oauth_version: "1.0",
  };
  const all = { ...params, ...oauth };
  const base = [method.toUpperCase(), enc(url), enc(Object.keys(all).sort().map((k) => `${enc(k)}=${enc(all[k])}`).join("&"))].join("&");
  const key = `${enc(process.env.X_API_SECRET)}&${enc(process.env.X_ACCESS_SECRET)}`;
  oauth.oauth_signature = crypto.createHmac("sha1", key).update(base).digest("base64");
  return `OAuth ${Object.keys(oauth).sort().map((k) => `${enc(k)}="${enc(oauth[k])}"`).join(", ")}`;
}

async function why(r) {
  const t = await r.text().catch(() => "");
  try {
    const j = JSON.parse(t);
    return j.detail || j.title || j.errors?.[0]?.message || j.errors?.[0]?.detail || t.slice(0, 200);
  } catch { return t.slice(0, 200); }
}

/** Upload a PNG and return its media id. */
async function uploadImage(png) {
  const url = "https://api.x.com/2/media/upload";
  const form = new FormData();
  form.append("media", new Blob([png], { type: "image/png" }), "sale.png");
  form.append("media_category", "tweet_image");
  const r = await fetch(url, { method: "POST", headers: { Authorization: authHeader("POST", url) }, body: form, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`X image upload failed (${r.status}): ${await why(r)}`);
  const j = await r.json();
  const id = j.data?.id || j.media_id_string || j.data?.media_id_string;
  if (!id) throw new Error("X didn't return an image id");
  return id;
}

/** Post text with one image. Returns { id, url } of the new post. */
export async function postToX(text, png) {
  if (!xReady()) throw new Error("X isn't connected: add the X_ keys in the host's environment variables");
  const mediaId = await uploadImage(png);
  const url = "https://api.x.com/2/tweets";
  const r = await fetch(url, {
    method: "POST", headers: { Authorization: authHeader("POST", url), "Content-Type": "application/json" },
    body: JSON.stringify({ text: String(text).slice(0, 280), media: { media_ids: [mediaId] } }), signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`X post failed (${r.status}): ${await why(r)}`);
  const id = (await r.json()).data?.id;
  return { id, url: id ? `https://x.com/i/web/status/${id}` : null };
}
