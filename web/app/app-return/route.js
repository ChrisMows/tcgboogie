import { openAppPage } from "@/lib/app-login";
import { safeAppPath } from "@/lib/app-shell";

// Stripe's checkout and billing pages open in a browser tab from the Android app. This is where they come back to:
// a small page that reopens the app on the right member page (only /app pages: lib/app-shell.js safeAppPath).
export const dynamic = "force-dynamic";

export async function GET(request) {
  const to = safeAppPath(request.nextUrl.searchParams.get("to"));
  return openAppPage(`tcgboogie://open?to=${encodeURIComponent(to)}`);
}
