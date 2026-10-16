"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { enabledProviders, signIn, signOut } from "@/auth";
import { validateFilters } from "@/lib/filters";
import { setLinkIntent } from "@/lib/link-intent";
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

/** Which profile picture to show: google, discord, or initials. */
export async function setAvatar(formData) {
  const user = await requireUser();
  await store.setAvatarSource(user.id, String(formData.get("avatar") || ""));
  revalidatePath("/", "layout");
  redirect("/app/account?saved=avatar");
}

/** "Refresh" next to a picture: Discord is fetched directly; Google needs a quick pass through Google's sign-in. */
export async function refreshPicture(provider) {
  const user = await requireUser();
  if (user.demo || !user.providers.includes(provider)) redirect("/app/account#picture");
  if (provider === "discord") {
    const url = await store.refreshDiscordImage(user.id, { force: true });
    revalidatePath("/", "layout");
    redirect(`/app/account?refreshed=${url ? "discord" : "failed"}#picture`);
  }
  if (provider === "google") {
    await setLinkIntent(user.id);
    await signIn("google", { redirectTo: "/app/account?refreshed=google#picture" });
  }
  redirect("/app/account#picture");
}

/** Called by the header when the saved picture fails to load: fetch a fresh one if we can. */
export async function repairPicture() {
  const user = await requireUser();
  if (user.demo || !user.providers.includes("discord")) return { url: null };
  const url = await store.refreshDiscordImage(user.id, { force: true });
  if (url) revalidatePath("/", "layout");
  return { url };
}

/** Connect another sign-in method (Google or Discord) to the signed-in account. */
export async function connectProvider(provider) {
  const user = await requireUser();
  if (user.demo) {
    store.demoPrefs().discordConnected = provider === "discord" ? true : store.demoPrefs().discordConnected;
    revalidatePath("/app", "layout");
    redirect(`/app/account?linked=${provider}`);
  }
  if (!enabledProviders.includes(provider) || provider === "email") redirect("/app/account?link=unavailable");
  await setLinkIntent(user.id);
  await signIn(provider, { redirectTo: `/app/account?linked=${provider}` });
}

/** Disconnect a sign-in method, as long as another one remains. */
export async function disconnectProvider(provider) {
  const user = await requireUser();
  if (user.demo) {
    if (provider === "discord") store.demoPrefs().discordConnected = false;
    revalidatePath("/app", "layout");
    redirect("/app/account?unlinked=discord");
  }
  const others = user.providers.filter((p) => p !== provider);
  if (!others.length) redirect("/app/account?link=last");
  await store.unlinkProvider(user.id, provider);
  revalidatePath("/app", "layout");
  redirect(`/app/account?unlinked=${provider}`);
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
