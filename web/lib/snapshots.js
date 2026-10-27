import "server-only";
import { eq } from "drizzle-orm";
import { marketValue, summarize } from "@/lib/collection";
import { db, schema } from "@/lib/db";
import { log } from "@/lib/log";
import { loadProducts } from "@/lib/portfolio";
import * as store from "@/lib/store";

// Every member's collection value, saved once a day (the hourly price-alert run, from 10 PM UTC), so the value chart
// and "today" / "this week" have a point for every day, not just the days a member opened their collection. Prices
// come from what's already saved (cached prices, or each card's last value): no price-service credits. A visit later
// that day refreshes the same day's point with live prices.
const KEY = "daily_snapshots";
const FROM_HOUR_UTC = 22;

export async function recordDailySnapshots(now = new Date()) {
  if (!db) return { skipped: "no database" };
  const day = now.toISOString().slice(0, 10);
  if (now.getUTCHours() < FROM_HOUR_UTC) return { waiting: `from ${FROM_HOUR_UTC}:00 UTC` };
  const [state] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, KEY)).limit(1);
  if (state?.value?.day === day) return { done: day };
  const owners = await db.selectDistinct({ userId: schema.collectionItems.userId }).from(schema.collectionItems)
    .where(eq(schema.collectionItems.list, "owned"));
  let saved = 0, failed = 0;
  for (const { userId } of owners) {
    try {
      const items = (await store.listItems(userId)).filter((it) => it.list === "owned");
      const products = await loadProducts(items.map((it) => it.productId), 0); // cached prices only
      const valued = items.map((it) => ({ ...it, unitValue: marketValue(products[it.productId], it) ?? it.unitValue }));
      const s = summarize(valued);
      await store.recordSnapshot(userId, Math.round(s.value * 100) / 100, Math.round(s.cost * 100) / 100);
      await store.recordItemValues(userId, valued); // graded copies, for their own % changes
      saved++;
    } catch (e) {
      failed++;
      await log("website", "warn", `Daily collection value couldn't be saved: ${e.message}`, null, userId);
    }
  }
  const value = { day, members: saved, failed, at: now.toISOString() };
  await db.insert(schema.appSettings).values({ key: KEY, value })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value, updatedAt: new Date() } });
  return value;
}
