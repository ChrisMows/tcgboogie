import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// Allowances from the member's plan (Admin → Plans → Limits): search-by-picture photos, photo appraiser photos, Sell
// on eBay listings. Counted per calendar month (UTC) in the database, so deploys don't reset them, or, where the plan
// sets a lifetime total instead (Free's search-by-picture: N photos, then it's Premium), counted once for good.
// A plan limit of null is unlimited (nothing is counted); 0 means the feature isn't included.
export const QUOTAS = {
  photoSearch: { limit: "photoSearchPerMonth", total: "photoSearchTotal", noun: "search-by-picture photos", photos: true },
  appraise: { limit: "appraisePerMonth", noun: "photo appraiser photos", photos: true },
  ebayListing: { limit: "sellPerMonth", noun: "eBay listings" },
};

const canUpgrade = (user) => user.plan?.key !== "premium";

const { rateLimits } = schema;
const month = (d = new Date()) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
// A lifetime total is one row that never expires (year 2100); a monthly one expires when the month ends.
const totalOf = (name, user) => (QUOTAS[name].total ? user.plan?.[QUOTAS[name].total] ?? null : null);
const idFor = (name, userId, lifetime = false) => `quota:${name}:${userId}:${lifetime ? "total" : month()}`;
const monthEnd = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)); };
const NEVER = new Date(Date.UTC(2100, 0, 1));
const demo = globalThis.__tcgQuotaDemo ?? (globalThis.__tcgQuotaDemo = new Map());

/** { limit, used, left, lifetime } this month, or in total when the plan sets a lifetime total (null = unlimited). */
export async function quotaStatus(name, user) {
  const total = totalOf(name, user);
  const lifetime = total !== null;
  const limit = lifetime ? total : user.plan?.[QUOTAS[name].limit] ?? null;
  if (limit === null) return { limit: null, used: 0, left: null, canUpgrade: false, lifetime: false };
  const id = idFor(name, user.id, lifetime);
  let used = 0;
  if (!db) used = demo.get(id) || 0;
  else {
    try {
      const [row] = await db.select({ count: rateLimits.count }).from(rateLimits).where(eq(rateLimits.id, id)).limit(1);
      used = row?.count || 0;
    } catch { used = 0; }
  }
  return { limit, used, left: Math.max(0, limit - used), canUpgrade: canUpgrade(user), lifetime };
}

/** Whether there's any of this month's allowance left, without using it: { ok, left } or { ok: false, message }. */
export async function checkQuota(name, user) {
  const s = await quotaStatus(name, user);
  if (s.limit === null) return { ok: true, left: null };
  if (s.left > 0) return { ok: true, left: s.left };
  return { ok: false, message: s.limit === 0
    ? `${QUOTAS[name].noun[0].toUpperCase()}${QUOTAS[name].noun.slice(1)} aren't part of your plan.`
    : s.lifetime ? `You've used all ${s.limit} free ${QUOTAS[name].noun}. To keep using it, upgrade to Premium.`
      : `You've used all ${s.limit} ${QUOTAS[name].noun} for this month. They reset on the 1st${s.canUpgrade ? ", or get more with Premium" : ""}.` };
}

/**
 * Use one of this month's allowance. Returns { ok: true, left } or { ok: false, message } when it's used up.
 * Unlimited plans always pass.
 */
export async function useQuota(name, user) {
  const s = await quotaStatus(name, user);
  if (s.limit === null) return { ok: true, left: null };
  if (s.left <= 0) return checkQuota(name, user);
  const id = idFor(name, user.id, s.lifetime);
  if (!db) demo.set(id, s.used + 1);
  else {
    await db.insert(rateLimits).values({ id, count: 1, expiresAt: s.lifetime ? NEVER : monthEnd() })
      .onConflictDoUpdate({ target: rateLimits.id, set: { count: sql`${rateLimits.count} + 1` } });
  }
  return { ok: true, left: s.left - 1 };
}
