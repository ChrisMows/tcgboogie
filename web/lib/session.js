import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth, authEnabled } from "@/auth";
import { effectiveTier, isAdminEmail } from "@/lib/access";
import { planFor } from "@/lib/plans";
import * as store from "@/lib/store";

// Demo mode (local preview only): a fake signed-in member and sample data, used until the database exists.
export const demoMode = process.env.DEMO_MODE === "1" && !authEnabled;

/** The signed-in member, or null. Includes their plan and alert preferences. */
export async function getCurrentUser() {
  await connection(); // who's signed in differs per request: never bake this into a static page
  if (demoMode) {
    const jar = await cookies();
    const tier = jar.get("demo_tier")?.value === "free" ? "free" : "premium";
    const prefs = store.demoPrefs();
    return {
      id: "demo",
      name: "Demo Collector",
      email: "demo@tcgboogie.com",
      image: null,
      tier,
      plan: planFor(tier),
      ...prefs,
      providers: prefs.discordConnected ? ["email", "discord"] : ["email"],
      isAdmin: true, // demo only, so the admin panel can be previewed locally
      demo: true,
    };
  }
  if (!authEnabled) return null;
  const session = await auth();
  if (!session?.user?.id) return null;
  const row = await store.getUser(session.user.id);
  if (!row) return null;
  const providers = await store.linkedProviders(row.id);
  // Discord pictures: fetch now if we've never had one, otherwise re-check in the background at most once a day.
  if (providers.includes("discord")) {
    if (!row.discordImage) row.discordImage = (await store.refreshDiscordImage(row.id)) || null;
    else if (!row.avatarCheckedAt || Date.now() - new Date(row.avatarCheckedAt).getTime() > 24 * 3600 * 1000) {
      void store.refreshDiscordImage(row.id);
    }
  }
  // Admins get Premium, and can preview the site as a Free member (admin bar at the top).
  const isAdmin = isAdminEmail(row.email);
  const tier = isAdmin ? ((await cookies()).get("admin_view")?.value === "free" ? "free" : "premium") : effectiveTier(row);
  return { ...row, tier, plan: planFor(tier), isAdmin, providers, discordConnected: providers.includes("discord"), demo: false };
}

/**
 * Where to go after signing in: only pages inside the member area (no other sites, no "//evil.com" tricks).
 * Anything else falls back to the member area (which opens on Collection).
 */
export function safeNext(path) {
  const p = String(path || "");
  return /^\/app(\/[\w\-/%.]*)?(\?[\w\-=&%.]*)?$/.test(p) && !p.startsWith("//") && !p.includes("..") ? p : "/app";
}

/** Use in member pages: returns the user or sends them to the login page (and back to `next` afterwards). */
export async function requireUser(next) {
  const user = await getCurrentUser();
  if (!user) redirect(next && safeNext(next) !== "/app" ? `/login?next=${encodeURIComponent(safeNext(next))}` : "/login");
  return user;
}
