import { NextResponse } from "next/server";
import { createAppSession, redeemAppCode } from "@/lib/app-login";
import { log } from "@/lib/log";
import { safeNext } from "@/lib/session";

// Step 3 of signing in to the Android app (lib/app-login.js): the app's WebView swaps the code and its secret for a session.
export const dynamic = "force-dynamic";
const SITE = process.env.AUTH_URL || "https://tcgboogie.com";

export async function POST(request) {
  const form = await request.formData().catch(() => null);
  const userId = await redeemAppCode(form?.get("code"), form?.get("verifier"));
  if (!userId) {
    await log("signin", "warn", "App sign-in refused: the code was unknown, used, expired or had the wrong secret");
    return NextResponse.redirect(new URL("/login?error=Verification", SITE), 303);
  }
  const cookie = await createAppSession(userId);
  await log("signin", "info", "Signed in to the Android app", null, userId);
  const res = NextResponse.redirect(new URL(safeNext(form.get("next")), SITE), 303);
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
