import "server-only";
import { lt } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// One place for everything that runs on the site to write down what happened (Admin → Logs).
// Never throws: logging must not break the thing being logged.
export const LOG_SOURCES = {
  payments: "Payments",
  alerts: "Price alerts",
  prices: "Price data",
  signin: "Sign-ins",
  admin: "Admin",
  website: "Website",
};
const KEEP_DAYS = 60;
const g = globalThis;
g.__tcgLogCount ??= 0;

const SECRET = /(sk|rk|pk)_(test|live)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+|Bearer\s+\S+/g;
const scrub = (v) => (typeof v === "string" ? v.replace(SECRET, "[hidden]") : v);

/** log("payments", "error", "Checkout failed", { reason }, userId) */
export async function log(source, level, message, details = null, userId = null) {
  const msg = scrub(String(message)).slice(0, 500);
  const line = `[${source}] ${msg}`;
  if (level === "error") console.error(line, details ?? "");
  else if (level === "warn") console.warn(line, details ?? "");
  if (!db) return;
  try {
    let clean = null;
    if (details) {
      const text = scrub(JSON.stringify(details));
      clean = text.length > 4000 ? { text: text.slice(0, 4000) + "…" } : JSON.parse(text);
    }
    await db.insert(schema.systemLog).values({ source, level, message: msg, details: clean, userId });
  } catch {
    try { await db.insert(schema.systemLog).values({ source, level, message: msg, userId }); } catch { /* database down: console only */ }
  }
  // Tidy up now and then.
  if (++g.__tcgLogCount % 200 === 1) {
    db.delete(schema.systemLog).where(lt(schema.systemLog.at, new Date(Date.now() - KEEP_DAYS * 86400000))).catch(() => {});
  }
}

export const logError = (source, message, e, details, userId) =>
  log(source, "error", `${message}: ${e?.message || e}`, { ...details, ...(e?.status ? { status: e.status } : {}) }, userId);
