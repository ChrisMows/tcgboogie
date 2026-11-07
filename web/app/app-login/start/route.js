import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth, authEnabled, enabledProviders, signIn } from "@/auth";
import { APP_LOGIN_PROVIDERS, FLOW_COOKIE, validChallenge } from "@/lib/app-login";

// Step 1 of signing in to the Android app (lib/app-login.js), in a browser tab the app opened.
export const dynamic = "force-dynamic";
const SITE = process.env.AUTH_URL || "https://tcgboogie.com";

export async function GET(request) {
  const q = request.nextUrl.searchParams;
  const provider = q.get("provider");
  const challenge = q.get("challenge");
  if (!authEnabled || !APP_LOGIN_PROVIDERS.includes(provider) || !enabledProviders.includes(provider) || !validChallenge(challenge)) {
    return NextResponse.redirect(new URL("/login?error=unavailable", SITE));
  }
  const params = new URLSearchParams({ provider, challenge });
  // Signed in already in this browser: signing in again would connect the new account to this one, so ask first.
  if ((await auth())?.user?.id) return NextResponse.redirect(new URL(`/app-login/confirm?${params}`, SITE));
  (await cookies()).set(FLOW_COOKIE, challenge, { httpOnly: true, secure: SITE.startsWith("https:"), sameSite: "lax", path: "/app-login", maxAge: 900 });
  return signIn(provider, { redirectTo: `/app-login/done?challenge=${encodeURIComponent(challenge)}` });
}
