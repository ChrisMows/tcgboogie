import { NextResponse } from "next/server";
import { log } from "@/lib/log";
import { getCurrentUser } from "@/lib/session";
import { settingsEnvFile } from "@/lib/settings-backup";

// Admin → Status → "Download settings backup". Admins only, POST from our own page only, never cached, logged.
export const dynamic = "force-dynamic";

export async function POST(req) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return new NextResponse("Not found", { status: 404 });
  const origin = req.headers.get("origin");
  const site = new URL(process.env.AUTH_URL || req.url).origin;
  if (origin && origin !== site) return new NextResponse("Forbidden", { status: 403 });
  const form = await req.formData();
  if (form.get("confirm") !== "yes") return NextResponse.redirect(new URL("/app/admin?backup=confirm", site), 303);

  await log("admin", "warn", "Downloaded the settings backup (all website keys and passwords)", null, user.id);
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(settingsEnvFile(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="tcgboogie-settings-${day}.env"`,
      "Cache-Control": "no-store, max-age=0",
      "X-Robots-Tag": "noindex",
    },
  });
}
