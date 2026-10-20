import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { connect, readState } from "@/lib/ebay-sell";
import { logError } from "@/lib/log";
import { getCurrentUser } from "@/lib/session";

// eBay sends the member back here after they allow (or decline) access.
export const dynamic = "force-dynamic";
const SITE = process.env.AUTH_URL || "https://tcgboogie.com";
const back = (q) => NextResponse.redirect(new URL(`/app/account?${q}#ebay`, SITE));

export async function GET(req) {
  const p = new URL(req.url).searchParams;
  const jar = await cookies();
  const state = p.get("state");
  const saved = jar.get("ebay_state")?.value;
  jar.delete("ebay_state");
  const user = await getCurrentUser();
  // The state must be the one we just issued, for this same signed-in member (stops forged connections).
  if (!user || !state || state !== saved || readState(state) !== user.id) return back("ebay=failed");
  if (!p.get("code")) return back("ebay=declined");
  try {
    await connect(user.id, p.get("code"));
    return back("ebay=connected");
  } catch (e) {
    await logError("signin", "eBay connection failed", e, {}, user.id);
    return back("ebay=failed");
  }
}
