import { NextResponse } from "next/server";
import { dispatchDeals } from "@/lib/deals";
import { dispatchRefusal } from "@/lib/dispatch-auth";
import { log } from "@/lib/log";

// The deal bot calls this right after saving new deals. It only sends alerts for deals already in the database
// (which only the bot can write), each one once. POST only, and locked by DISPATCH_SECRET (see lib/dispatch-auth.js).
export const dynamic = "force-dynamic";

export async function POST(req) {
  const refused = dispatchRefusal(req, "deals");
  if (refused) return NextResponse.json({ ok: false }, { status: refused });
  try {
    return NextResponse.json({ ok: true, ...(await dispatchDeals()) });
  } catch (e) {
    await log("alerts", "error", `Deal alert dispatch crashed: ${e.message}`, { stack: String(e.stack || "").slice(0, 1500) });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
