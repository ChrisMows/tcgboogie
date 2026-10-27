import "server-only";
import { lt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// Per-member limits. They stop one account from burning price-service and AI credits or texting strangers; normal
// use never gets near them. Every limit is counted in memory (fast). The daily ones that cost money (`persist`) are
// also counted in the database, so a deploy or restart doesn't hand out a fresh allowance.
const hits = globalThis.__tcgRateLimit ?? (globalThis.__tcgRateLimit = new Map());
const { rateLimits } = schema;

export const LIMITS = {
  pageView: { max: 300, windowMs: 10 * 60 * 1000 }, // visit counting beacons (Admin → Traffic)
  search: { max: 120, windowMs: 10 * 60 * 1000 }, // card/product searches and link lookups
  cardPage: { max: 300, windowMs: 60 * 60 * 1000 }, // card pages opened
  pushTest: { max: 10, windowMs: 60 * 60 * 1000 }, // "Send a test" push alerts
  setLoad: { max: 40, windowMs: 60 * 60 * 1000 }, // whole-set card lists (the expensive one)
  smsCode: { max: 5, windowMs: 24 * 60 * 60 * 1000, persist: true }, // "text me a code" requests
  ebayList: { max: 30, windowMs: 60 * 60 * 1000 }, // eBay listings created
  billing: { max: 20, windowMs: 60 * 60 * 1000 }, // opening Stripe checkout / billing pages
  cardRequest: { max: 20, windowMs: 24 * 60 * 60 * 1000, persist: true }, // "Request a card" (one price lookup each)
  reportSale: { max: 15, windowMs: 24 * 60 * 60 * 1000, persist: true }, // "Report a sale" lookups (one eBay call each)
  importMatch: { max: 400, windowMs: 24 * 60 * 60 * 1000, persist: true }, // collection import: rows looked up (3 credits each, unless cached)
  importAdd: { max: 100, windowMs: 60 * 60 * 1000 }, // collection import: batches added
  importColumns: { max: 20, windowMs: 24 * 60 * 60 * 1000, persist: true }, // collection import: unfamiliar files read by Claude
  photoSearch: { max: 60, windowMs: 24 * 60 * 60 * 1000, persist: true }, // Add cards: search by picture (one photo read each)
  missingPicture: { max: 30, windowMs: 24 * 60 * 60 * 1000, persist: true }, // "Missing picture?" reports (a few image lookups each)
  idea: { max: 10, windowMs: 24 * 60 * 60 * 1000, persist: true }, // "Suggest an idea" from a member
  ideaVisitor: { max: 3, windowMs: 24 * 60 * 60 * 1000, persist: true }, // "Suggest an idea" from a visitor (per IP)
  helperVisitor: { max: 8, windowMs: 24 * 60 * 60 * 1000, persist: true }, // site helper questions from visitors (per IP)
  helperFree: { max: 25, windowMs: 24 * 60 * 60 * 1000, persist: true }, // site helper questions, Free members
  helperPremium: { max: 80, windowMs: 24 * 60 * 60 * 1000, persist: true }, // site helper questions, Premium members
  appraise: { max: 40, windowMs: 24 * 60 * 60 * 1000, persist: true }, // photo appraiser photos (about a cent each, plus price lookups)
  // Abuse limits: sign-in emails (each one spends email quota and sending reputation), card pages that buy a price
  // lookup, and site-wide caps so many accounts or IP addresses together can't run up the bill (key "site").
  signinEmail: { max: 4, windowMs: 60 * 60 * 1000, persist: true }, // sign-in links per email address
  signinIp: { max: 20, windowMs: 24 * 60 * 60 * 1000, persist: true }, // sign-in links per IP address
  cardPageDay: { max: 400, windowMs: 24 * 60 * 60 * 1000, persist: true }, // card pages that need a price lookup, per member
  siteLookups: { max: 2000, windowMs: 24 * 60 * 60 * 1000, persist: true }, // the website's own new card lookups (~3 credits each)
  helperSite: { max: 2000, windowMs: 24 * 60 * 60 * 1000, persist: true }, // Boogie Bot questions, everyone together (~$0.002 each)
};

/** In memory: a sliding window per bucket and member. */
function allowInMemory(bucket, key) {
  const { max, windowMs } = LIMITS[bucket];
  const id = `${bucket}:${key}`;
  const now = Date.now();
  const recent = (hits.get(id) || []).filter((t) => now - t < windowMs);
  if (recent.length >= max) { hits.set(id, recent); return false; }
  recent.push(now);
  hits.set(id, recent);
  if (hits.size > 20000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > 24 * 3600 * 1000) hits.delete(k);
  return true;
}

export const SLOW_DOWN = "You're going a little fast. Give it a minute and try again.";

/**
 * Count one use of `bucket` by `key`. Resolves true if allowed, false if over the limit. Always `await` it.
 * Daily limits marked `persist` are also counted per day in the database (if it's down, the memory limit still holds).
 */
export async function allow(bucket, key) {
  if (!allowInMemory(bucket, key)) return false;
  const { max, windowMs, persist } = LIMITS[bucket];
  if (!persist || !db) return true;
  const start = Math.floor(Date.now() / windowMs) * windowMs;
  try {
    const [row] = await db.insert(rateLimits).values({ id: `${bucket}:${key}:${start}`, count: 1, expiresAt: new Date(start + windowMs) })
      .onConflictDoUpdate({ target: rateLimits.id, set: { count: sql`${rateLimits.count} + 1` } })
      .returning({ count: rateLimits.count });
    if (Math.random() < 0.01) db.delete(rateLimits).where(lt(rateLimits.expiresAt, new Date())).catch(() => {}); // tidy old windows
    return (row?.count ?? 1) <= max;
  } catch {
    return true;
  }
}
