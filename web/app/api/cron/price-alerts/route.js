import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { runPriceAlerts } from "@/lib/price-alerts";

// Called on a schedule (Hostinger cron job) to check every price alert and send the ones that hit.
// Safe to call from anywhere: it runs at most once every 20 minutes, so nobody can burn price-service credits by
// calling it repeatedly. With CRON_SECRET set, a request carrying "Authorization: Bearer <secret>" skips that wait.
const MIN_GAP_MS = 20 * 60 * 1000;
const KEY = "price_alerts_last_run";

export const dynamic = "force-dynamic";

async function handle(req) {
  if (!db) return NextResponse.json({ ok: false, error: "No database configured." }, { status: 503 });
  const secret = process.env.CRON_SECRET;
  const forced = Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;

  const [row] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, KEY)).limit(1);
  const last = row?.value?.at ? new Date(row.value.at).getTime() : 0;
  if (!forced && Date.now() - last < MIN_GAP_MS) {
    return NextResponse.json({ ok: true, skipped: "ran recently", lastRun: row.value.at });
  }
  const started = new Date();
  await db.insert(schema.appSettings).values({ key: KEY, value: { at: started.toISOString(), running: true } })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: { at: started.toISOString(), running: true }, updatedAt: started } });

  try {
    const summary = await runPriceAlerts();
    const value = { at: started.toISOString(), ms: Date.now() - started.getTime(), ...summary };
    await db.update(schema.appSettings).set({ value, updatedAt: new Date() }).where(eq(schema.appSettings.key, KEY));
    return NextResponse.json({ ok: true, ...value });
  } catch (e) {
    console.error("[price-alerts]", e);
    await db.update(schema.appSettings).set({ value: { at: started.toISOString(), error: String(e.message).slice(0, 300) }, updatedAt: new Date() })
      .where(eq(schema.appSettings.key, KEY));
    return NextResponse.json({ ok: false, error: "The price-alert check failed. See the server log." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
