import "server-only";
import crypto from "node:crypto";

// Encrypts secrets we must store (e.g. a member's eBay tokens) with AES-256-GCM, keyed from AUTH_SECRET.
// A stolen database copy alone can't be used to act on anyone's eBay account.
const key = () => crypto.createHash("sha256").update(`tcgboogie-secret-box:${process.env.AUTH_SECRET || ""}`).digest();

export function seal(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(String(text), "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${body.toString("base64url")}`;
}

export function open(sealed) {
  const [v, iv, tag, body] = String(sealed || "").split(".");
  if (v !== "v1") throw new Error("Unknown secret format");
  const d = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8");
}
