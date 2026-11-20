import "server-only";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { getProduct, prefetchProducts } from "@/lib/catalog";
import { marketValue, printingFor } from "@/lib/collection";
import { db, schema } from "@/lib/db";
import { log } from "@/lib/log";

/*
 * A safety net for copies stuck on a member's own value while their card has a market price (seen Nov 2026: a copy
 * saved with no printing, and a member-added card the price service later carried). Runs with the price-alert cron and
 * reads only prices we've already saved: no price lookups.
 *   - A copy whose card now prices it gets that value saved right away (it would otherwise wait for the member to open
 *     their collection).
 *   - A raw copy whose card has prices but not for its printing, where we can't tell which printing it is, and
 *     member-added cards that match several priced cards (lib/member-links.js), are listed on Admin -> Status in amber.
 */
const { collectionItems } = schema;
export const STUCK_KEY = "stuck_values";

export async function checkStuckValues({ severalMatches = [] } = {}) {
  if (!db) return { checked: 0, fixed: 0, stuck: 0 };
  const items = await db.select().from(collectionItems).where(and(eq(collectionItems.list, "owned"), isNotNull(collectionItems.customValue),
    sql`${collectionItems.unitValue} is null`, sql`${collectionItems.productId} ~ '^[0-9]+$'`));
  const ids = [...new Set(items.map((it) => it.productId))];
  const sales = ids.length ? await prefetchProducts(ids, { light: true }).catch(() => null) : null;
  let fixed = 0;
  const stuck = [];
  for (const it of items) {
    let p;
    try { p = await getProduct(it.productId, { cachedOnly: true, anyAge: true, sales }); } catch { continue; }
    if (!p) continue; // not looked up yet: the member's own value is all there is
    const mv = marketValue(p, it);
    if (mv !== null && mv !== undefined) {
      await db.update(collectionItems).set({ unitValue: mv, valueUpdatedAt: new Date() }).where(and(eq(collectionItems.id, it.id), eq(collectionItems.userId, it.userId)));
      fixed++;
      continue;
    }
    // Raw: the card has prices in this condition, just not for the copy's printing, and it comes in several.
    if (it.kind === "raw") {
      const priced = Object.entries(p.prices || {}).filter(([, byCond]) => byCond?.[it.condition]?.market != null).map(([k]) => k);
      if (priced.length && !priced.includes(printingFor(p, it.printing))) {
        stuck.push({ item: it.id, user: it.userId, card: `${it.name}${it.setName ? ` (${it.setName})` : ""}`, product: it.productId,
          why: `saved as ${it.printing || "no printing"}; priced as ${priced.join(", ")}` });
      }
    }
  }
  for (const m of severalMatches) stuck.push({ card: `${m.name} #${m.number}`, product: m.productId, why: `member-added card matching ${m.matches.length} priced cards: ${m.matches.join("; ")}` });
  const value = { at: new Date().toISOString(), checked: items.length, fixed, stuck: stuck.slice(0, 50), stuckCount: stuck.length };
  await db.insert(schema.appSettings).values({ key: STUCK_KEY, value })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value, updatedAt: new Date() } });
  if (fixed) await log("prices", "info", `Collection values: ${fixed} copies on members' own values now have a market price, saved`);
  return { checked: items.length, fixed, stuck: stuck.length };
}
