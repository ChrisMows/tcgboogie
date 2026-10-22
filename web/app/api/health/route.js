import { NextResponse } from "next/server";
import { authEnabled } from "@/auth";
import { db, schema } from "@/lib/db";
import { billingLive } from "@/lib/billing";
import { settingsSummary } from "@/lib/settings-backup";

// Is the site really working? The deal bot checks this every few minutes and messages the admin if not (e.g. the
// host wiping the website's settings). Yes/no answers and setting names only, never values.
export const dynamic = "force-dynamic";

export async function GET() {
  let database = false;
  if (db) {
    try { await db.select({ key: schema.appSettings.key }).from(schema.appSettings).limit(1); database = true; } catch { database = false; }
  }
  const { set, missingEssential } = settingsSummary();
  const body = {
    ok: database && authEnabled && missingEssential.length === 0,
    database, signIn: authEnabled, payments: billingLive(), settings: set.length, missingEssential,
  };
  return NextResponse.json(body, { status: body.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
