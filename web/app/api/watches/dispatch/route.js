import { NextResponse } from "next/server";
import { dispatchRefusal } from "@/lib/dispatch-auth";
import { log } from "@/lib/log";
import { dispatchWatchListings } from "@/lib/watch-listings";

// The deal bot calls this after saving eBay listings that meet members' price alerts. It only alerts listings already
// in the database (which only the bot can write), each once. POST only, and locked by DISPATCH_SECRET (see lib/dispatch-auth.js).
export const dynamic = "force-dynamic";

export async function POST(req) {
  const refused = dispatchRefusal(req, "watches");
  if (refused) return NextResponse.json({ ok: false }, { status: refused });
  try {
    return NextResponse.json({ ok: true, ...(await dispatchWatchListings()) });
  } catch (e) {
    await log("alerts", "error", `eBay listing alert dispatch crashed: ${e.message}`, { stack: String(e.stack || "").slice(0, 1500) });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
