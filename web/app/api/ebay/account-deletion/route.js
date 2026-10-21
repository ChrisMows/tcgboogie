import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { appToken, forgetEbayUser } from "@/lib/ebay-sell";
import { log, logError } from "@/lib/log";

// eBay Marketplace Account Deletion notifications (required for production API access).
//   GET  ?challenge_code=...  eBay checking the endpoint: answer sha256(code + verification token + this URL).
//   POST                      an eBay user closed their account: forget any connection we hold for them.
// Env: EBAY_DELETION_TOKEN, the verification token entered at developer.ebay.com -> Alerts & Notifications.
export const dynamic = "force-dynamic";
const ENDPOINT = `${(process.env.AUTH_URL || "https://tcgboogie.com").replace(/\/$/, "")}/api/ebay/account-deletion`;

export async function GET(req) {
  const code = new URL(req.url).searchParams.get("challenge_code");
  const token = process.env.EBAY_DELETION_TOKEN;
  if (!code || !token) return NextResponse.json({ error: "missing challenge_code or token" }, { status: 400 });
  const challengeResponse = crypto.createHash("sha256").update(code).update(token).update(ENDPOINT).digest("hex");
  return NextResponse.json({ challengeResponse });
}

// eBay's public keys by id (they rarely change).
const keys = new Map();
async function publicKey(kid) {
  if (keys.has(kid)) return keys.get(kid);
  const r = await fetch(`https://api.ebay.com/commerce/notification/v1/public_key/${encodeURIComponent(kid)}`, {
    headers: { Authorization: `Bearer ${await appToken()}` }, cache: "no-store",
  });
  if (!r.ok) throw new Error(`eBay public key lookup failed (${r.status})`);
  const j = await r.json();
  // eBay sends the PEM on one line: put the line breaks back.
  const b64 = String(j.key).replace(/-----(BEGIN|END) PUBLIC KEY-----/g, "").replace(/\s+/g, "");
  const pem = `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g).join("\n")}\n-----END PUBLIC KEY-----\n`;
  const key = { pem, digest: String(j.digest || "SHA1").toLowerCase() };
  keys.set(kid, key);
  return key;
}

async function verified(raw, header) {
  try {
    const sig = JSON.parse(Buffer.from(String(header || ""), "base64").toString("utf8"));
    const key = await publicKey(sig.kid);
    return crypto.verify(key.digest, Buffer.from(raw), { key: key.pem, dsaEncoding: "der" }, Buffer.from(sig.signature, "base64"));
  } catch {
    return false;
  }
}

export async function POST(req) {
  const raw = await req.text();
  if (!(await verified(raw, req.headers.get("x-ebay-signature")))) {
    await log("signin", "warn", "eBay account-deletion notice with a bad signature: ignored");
    return new NextResponse(null, { status: 412 });
  }
  try {
    const data = JSON.parse(raw)?.notification?.data || {};
    await forgetEbayUser(data.username);
  } catch (e) {
    await logError("signin", "eBay account-deletion notice failed", e);
  }
  return new NextResponse(null, { status: 204 });
}
