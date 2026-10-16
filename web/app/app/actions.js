"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { signOut } from "@/auth";
import { validateFilters } from "@/lib/filters";
import { demoMode, requireUser } from "@/lib/session";
import * as store from "@/lib/store";

// Every action re-checks the signed-in member and their plan on the server; the browser is never trusted.

export async function saveProfile(id, input) {
  const user = await requireUser();
  const profile = await store.getProfile(user.id, id);
  if (!profile) return { ok: false, errors: { _: "That profile no longer exists." } };
  const { filters, errors } = validateFilters(input || {}, user.plan);
  const name = String(input?.name || "").trim().slice(0, 40);
  if (!name) errors.name = "Give the profile a name.";
  if (Object.keys(errors).length) return { ok: false, errors };
  await store.updateProfile(user.id, id, { name, filters });
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function createProfile() {
  const user = await requireUser();
  const existing = await store.listProfiles(user.id);
  if (existing.length >= user.plan.maxProfiles) {
    return { ok: false, error: `Your ${user.plan.label} plan includes ${user.plan.maxProfiles} profile${user.plan.maxProfiles > 1 ? "s" : ""}. Upgrade for more.` };
  }
  const { filters } = validateFilters({}, user.plan);
  const row = await store.createProfile(user.id, `Profile ${existing.length + 1}`, filters);
  revalidatePath("/app", "layout");
  return { ok: true, id: row.id };
}

export async function setProfileActive(id, active) {
  const user = await requireUser();
  await store.updateProfile(user.id, id, { active: Boolean(active) });
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function deleteProfile(id) {
  const user = await requireUser();
  const existing = await store.listProfiles(user.id);
  if (existing.length <= 1) return { ok: false, error: "You need at least one profile. Edit or pause it instead." };
  await store.deleteProfile(user.id, id);
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function savePreferences(formData) {
  const user = await requireUser();
  let emailRecap = formData.get("emailRecap");
  if (emailRecap === "daily" && user.plan.emailRecap !== "daily") emailRecap = "weekly"; // daily recap is Premium
  await store.updatePrefs(user.id, {
    alertDiscord: formData.get("alertDiscord") === "on",
    alertWebPush: formData.get("alertWebPush") === "on",
    emailRecap,
  });
  await store.updateName(user.id, formData.get("name"));
  revalidatePath("/app", "layout");
  redirect("/app/account?saved=1");
}

export async function deleteAccount(formData) {
  const user = await requireUser();
  if (String(formData.get("confirm") || "").trim().toUpperCase() !== "DELETE") {
    redirect("/app/account?delete=confirm");
  }
  await store.deleteUser(user.id);
  if (!user.demo) await signOut({ redirectTo: "/?deleted=1" });
  redirect("/?deleted=1");
}

export async function logOut() {
  if (demoMode) redirect("/");
  await signOut({ redirectTo: "/" });
}

/** Admins: preview the site as a Free or Premium member. */
export async function setAdminView(tier) {
  const user = await requireUser();
  if (!user.isAdmin) return;
  (await cookies()).set("admin_view", tier === "free" ? "free" : "premium", { path: "/", sameSite: "lax", httpOnly: true, secure: true });
  revalidatePath("/", "layout");
}

/** Demo only: switch the preview between Free and Premium to see how each plan looks. */
export async function setDemoTier(tier) {
  if (!demoMode) return;
  (await cookies()).set("demo_tier", tier === "free" ? "free" : "premium", { path: "/", sameSite: "lax" });
  revalidatePath("/", "layout");
}
