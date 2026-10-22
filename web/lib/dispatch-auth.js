import "server-only";
import crypto from "node:crypto";

// Who may run the alert dispatch endpoints (/api/deals/dispatch, /api/watches/dispatch). The deal bot calls them
// after each check. With DISPATCH_SECRET set (on the website AND in the bot's .env), only calls carrying
// "Authorization: Bearer <secret>" run. Until it's set, calls without it still work (so alerts never stop) but at
// most once every 30 seconds per endpoint, so nobody can hammer them.
const last = globalThis.__tcgDispatchAt ?? (globalThis.__tcgDispatchAt = {});
const OPEN_GAP_MS = 30 * 1000;

const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** null when the call may run, otherwise the HTTP status to answer with (401 or 429). */
export function dispatchRefusal(req, name) {
  const secret = process.env.DISPATCH_SECRET;
  if (secret) return same(req.headers.get("authorization") || "", `Bearer ${secret}`) ? null : 401;
  if (Date.now() - (last[name] || 0) < OPEN_GAP_MS) return 429;
  last[name] = Date.now();
  return null;
}
