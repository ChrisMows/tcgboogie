import "server-only";

// Simple per-member limits, kept in memory (the site runs as one server process). They stop one account from
// burning price-service credits or texting strangers; normal use never gets near them.
const hits = globalThis.__tcgRateLimit ?? (globalThis.__tcgRateLimit = new Map());

export const LIMITS = {
  search: { max: 120, windowMs: 10 * 60 * 1000 }, // card/product searches and link lookups
  cardPage: { max: 300, windowMs: 60 * 60 * 1000 }, // card pages opened
  setLoad: { max: 40, windowMs: 60 * 60 * 1000 }, // whole-set card lists (the expensive one)
  smsCode: { max: 5, windowMs: 24 * 60 * 60 * 1000 }, // "text me a code" requests
  ebayList: { max: 30, windowMs: 60 * 60 * 1000 }, // eBay listings created
  billing: { max: 20, windowMs: 60 * 60 * 1000 }, // opening Stripe checkout / billing pages
  cardRequest: { max: 20, windowMs: 24 * 60 * 60 * 1000 }, // "Request a card" (one price lookup each)
  reportSale: { max: 15, windowMs: 24 * 60 * 60 * 1000 }, // "Report a sale" lookups (one eBay call each)
  importMatch: { max: 400, windowMs: 24 * 60 * 60 * 1000 }, // collection import: rows looked up (3 credits each, unless cached)
  importAdd: { max: 100, windowMs: 60 * 60 * 1000 }, // collection import: batches added
  appraise: { max: 40, windowMs: 24 * 60 * 60 * 1000 }, // photo appraiser photos (about a cent each, plus price lookups)
};

/** Count one use of `bucket` by `key`. Returns true if allowed, false if over the limit. */
export function allow(bucket, key) {
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
