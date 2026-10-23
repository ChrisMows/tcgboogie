import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// Monthly allowances from the member's plan (Admin → Plans → Limits): search-by-picture photos, photo appraiser
// photos, Sell on eBay listings. Counted per calendar month (UTC) in the database, so deploys don't reset them.
// A plan limit of null is unlimited (nothing is counted); 0 means the feature isn't included.
export const QUOTAS = {
  photoSearch: { limit: "photoSearchPerMonth", noun: "search-by-picture photos" },
  appraise: { limit: "appraisePerMonth", noun: "photo appraiser photos" },
  ebayListing: { limit: "sellPerMonth", noun: "eBay listings" },
};

const { rateLimits } = schema;
const month = (d = new Date()) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const idFor = (name, userId) => `quota:${name}:${userId}:${month()}`;
const monthEnd = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)); };
const demo = globalThis.__tcgQuotaDemo ?? (globalThis.__tcgQuotaDemo = new Map());

/** { limit, used, left } this month (limit/left null = unlimited). */
export async function quotaStatus(name, user) {
  const limit = user.plan?.[QUOTAS[name].limit] ?? null;
  if (limit === null) return { limit: null, used: 0, left: null };
  let used = 0;
  if (!db) used = demo.get(idFor(name, user.id)) || 0;
  else {
    try {
      const [row] = await db.select({ count: rateLimits.count }).from(rateLimits).where(eq(rateLimits.id, idFor(name, user.id))).limit(1);
      used = row?.count || 0;
    } catch { used = 0; }
  }
  return { limit, used, left: Math.max(0, limit - used) };
}

/** Whether there's any of this month's allowance left, without using it: { ok, left } or { ok: false, message }. */
export async function checkQuota(name, user) {
  const s = await quotaStatus(name, user);
  if (s.limit === null) return { ok: true, left: null };
  if (s.left > 0) return { ok: true, left: s.left };
  return { ok: false, message: s.limit === 0
    ? `${QUOTAS[name].noun[0].toUpperCase()}${QUOTAS[name].noun.slice(1)} aren't part of your plan.`
    : `You've used all ${s.limit} ${QUOTAS[name].noun} for this month. They reset on the 1st, or get unlimited with Premium.` };
}

/**
 * Use one of this month's allowance. Returns { ok: true, left } or { ok: false, message } when it's used up.
 * Unlimited plans always pass.
 */
export async function useQuota(name, user) {
  const s = await quotaStatus(name, user);
  if (s.limit === null) return { ok: true, left: null };
  if (s.left <= 0) return checkQuota(name, user);
  if (!db) demo.set(idFor(name, user.id), s.used + 1);
  else {
    await db.insert(rateLimits).values({ id: idFor(name, user.id), count: 1, expiresAt: monthEnd() })
      .onConflictDoUpdate({ target: rateLimits.id, set: { count: sql`${rateLimits.count} + 1` } });
  }
  return { ok: true, left: s.left - 1 };
}
