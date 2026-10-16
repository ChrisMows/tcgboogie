import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth, authEnabled } from "@/auth";
import { isAdminEmail } from "@/lib/access";
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
      demo: true,
    };
  }
  if (!authEnabled) return null;
  const session = await auth();
  if (!session?.user?.id) return null;
  const row = await store.getUser(session.user.id);
  if (!row) return null;
  const providers = await store.linkedProviders(row.id);
  // Admins get Premium, and can preview the site as a Free member (admin bar at the top).
  const isAdmin = isAdminEmail(row.email);
  const tier = isAdmin ? ((await cookies()).get("admin_view")?.value === "free" ? "free" : "premium") : row.tier;
  return { ...row, tier, plan: planFor(tier), isAdmin, providers, discordConnected: providers.includes("discord"), demo: false };
}

/** Use in member pages: returns the user or sends them to the login page. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
