import { NextResponse } from "next/server";
import { log } from "@/lib/log";
import { dispatchWatchListings } from "@/lib/watch-listings";

// The deal bot calls this after saving eBay listings that meet members' price alerts. It only alerts listings already
// in the database (which only the bot can write), each once, so it's safe for anyone to call.
export const dynamic = "force-dynamic";

async function handle() {
  try {
    return NextResponse.json({ ok: true, ...(await dispatchWatchListings()) });
  } catch (e) {
    await log("alerts", "error", `eBay listing alert dispatch crashed: ${e.message}`, { stack: String(e.stack || "").slice(0, 1500) });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
export const GET = handle;
export const POST = handle;
