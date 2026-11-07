import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { FLOW_COOKIE, createAppCode, openAppPage, validChallenge } from "@/lib/app-login";
import { log } from "@/lib/log";

// Step 2 of signing in to the Android app (lib/app-login.js): signed in, so send a one-time code back to the app.
export const dynamic = "force-dynamic";
const SITE = process.env.AUTH_URL || "https://tcgboogie.com";

export async function GET(request) {
  const challenge = request.nextUrl.searchParams.get("challenge");
  const jar = await cookies();
  const session = await auth();
  // The cookie shows this tab's sign-in started here (or the member tapped Continue), not from a link someone sent them.
  if (!session?.user?.id || !validChallenge(challenge) || jar.get(FLOW_COOKIE)?.value !== challenge) {
    return NextResponse.redirect(new URL("/login?error=Verification", SITE));
  }
  jar.delete({ name: FLOW_COOKIE, path: "/app-login" });
  const code = await createAppCode(session.user.id, challenge);
  await log("signin", "info", "App sign-in: code sent to the app", null, session.user.id);
  return openAppPage(`tcgboogie://login?code=${encodeURIComponent(code)}`);
}
