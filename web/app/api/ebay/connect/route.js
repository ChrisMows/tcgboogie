import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authorizeUrl, ebaySellReady } from "@/lib/ebay-sell";
import { getCurrentUser } from "@/lib/session";

// "Connect eBay": send the member to eBay's own sign-in and consent page. We never see their eBay password.
export const dynamic = "force-dynamic";
const SITE = process.env.AUTH_URL || "https://tcgboogie.com";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.demo) return NextResponse.redirect(new URL("/login?next=%2Fapp%2Faccount", SITE));
  if (!ebaySellReady()) return NextResponse.redirect(new URL("/app/account?ebay=unavailable#ebay", SITE));
  const { url, state } = authorizeUrl(user.id);
  (await cookies()).set("ebay_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  return NextResponse.redirect(url);
}
