import { NextResponse } from "next/server";
import { dispatchRefusal } from "@/lib/dispatch-auth";
import { log } from "@/lib/log";
import { ebayWatchList } from "@/lib/watch-listings";

// The deal bot asks which price alerts to watch eBay for: only alerts whose member's plan includes it (so the bot
// spends no eBay calls on the rest). Card names, targets and market prices only, no member details. Locked by
// DISPATCH_SECRET like the dispatch endpoints (lib/dispatch-auth.js).
export const dynamic = "force-dynamic";

export async function GET(req) {
  const refused = dispatchRefusal(req, "watches-ebay");
  if (refused) return NextResponse.json({ ok: false }, { status: refused });
  try {
    return NextResponse.json({ ok: true, watches: await ebayWatchList() });
  } catch (e) {
    await log("alerts", "error", `eBay watch list failed: ${e.message}`);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
