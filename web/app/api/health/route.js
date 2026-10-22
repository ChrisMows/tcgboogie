import { NextResponse } from "next/server";
import { authEnabled } from "@/auth";
import { db, schema } from "@/lib/db";
import { billingLive } from "@/lib/billing";
import { settingsSummary } from "@/lib/settings-backup";
import { getCurrentUser } from "@/lib/session";
import crypto from "node:crypto";

// Is the site really working? The deal bot checks this every few minutes and messages the admin if not (e.g. the
// host wiping the website's settings). Everyone gets ok / not ok. The details (which part failed, which settings are
// missing: names only, never values) go to the bot (Authorization: Bearer DISPATCH_SECRET) and signed-in admins, and
// to anyone when the site has no DISPATCH_SECRET at all (its settings are gone, so the bot couldn't prove itself).
export const dynamic = "force-dynamic";

const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

async function maySeeDetails(req) {
  const secret = process.env.DISPATCH_SECRET;
  if (!secret) return true;
  if (same(req.headers.get("authorization") || "", `Bearer ${secret}`)) return true;
  try { return Boolean((await getCurrentUser())?.isAdmin); } catch { return false; }
}

export async function GET(req) {
  let database = false;
  if (db) {
    try { await db.select({ key: schema.appSettings.key }).from(schema.appSettings).limit(1); database = true; } catch { database = false; }
  }
  const { set, missingEssential } = settingsSummary();
  const body = {
    ok: database && authEnabled && missingEssential.length === 0,
    database, signIn: authEnabled, payments: billingLive(), settings: set.length, missingEssential,
  };
  const out = (await maySeeDetails(req)) ? body : { ok: body.ok };
  return NextResponse.json(out, { status: body.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
