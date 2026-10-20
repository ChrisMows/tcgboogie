import { NextResponse } from "next/server";
import { dispatchDeals } from "@/lib/deals";
import { log } from "@/lib/log";

// The deal bot calls this right after saving new deals. It only sends alerts for deals already in the database
// (which only the bot can write), each one once, so it's safe for anyone to call.
export const dynamic = "force-dynamic";

async function handle() {
  try {
    return NextResponse.json({ ok: true, ...(await dispatchDeals()) });
  } catch (e) {
    await log("alerts", "error", `Deal alert dispatch crashed: ${e.message}`, { stack: String(e.stack || "").slice(0, 1500) });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
export const GET = handle;
export const POST = handle;
