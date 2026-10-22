"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { enabledProviders, signIn, signOut } from "@/auth";
import crypto from "node:crypto";
import { billingLive, checkoutUrl, endBillingForDeletion, hasLiveSubscription, portalUrl, setCancelAtPeriodEnd } from "@/lib/billing";
import { log, logError } from "@/lib/log";
import { TERMS_VERSION } from "@/lib/terms";
import { SLOW_DOWN, allow } from "@/lib/rate-limit";
import { channelsReady, normalizePhone, sendSms } from "@/lib/notify";
import { allSampleCards, catalogLive, getSetCards, listSets, searchProducts } from "@/lib/catalog";
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
    alertWebPush: false,
    alertEmail: formData.get("alertEmail") === "on",
    alertSms: formData.get("alertSms") === "on" && Boolean(user.phoneVerifiedAt) && user.plan.watchAlertChannels.includes("sms"),
    emailRecap,
  });
  revalidatePath("/app", "layout");
  redirect("/app/account?saved=alerts#alerts");
}

/** The Price alerts page's on/off switches for each alert channel. */
export async function toggleAlertChannel(channel, on) {
  const user = await requireUser();
  const premium = user.plan.watchAlertChannels.includes("sms");
  if (channel === "email") await store.setAlertChannel(user.id, "alertEmail", on);
  else if (channel === "discord" && premium && user.discordConnected) await store.setAlertChannel(user.id, "alertDiscord", on);
  else if (channel === "sms" && premium && user.phoneVerifiedAt) await store.setAlertChannel(user.id, "alertSms", on);
  else return { ok: false };
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function saveName(formData) {
  const user = await requireUser();
  await store.updateName(user.id, formData.get("name"));
  revalidatePath("/app", "layout");
  redirect("/app/account?saved=profile#profile");
}

export async function deleteAccount(formData) {
  const user = await requireUser();
  if (String(formData.get("confirm") || "").trim().toUpperCase() !== "DELETE") {
    redirect("/app/account?delete=confirm");
  }
  // Billing first: cancel any subscription. If that can't be confirmed, keep the account so nobody is charged
  // for an account that no longer exists.
  if (!user.demo) {
    try {
      await endBillingForDeletion(user);
    } catch (e) {
      await logError("payments", "Account NOT deleted: couldn't end billing", e, {}, user.id);
      redirect("/app/account?delete=billing");
    }
  }
  await store.deleteUser(user.id);
  if (!user.demo) await log("signin", "info", "Member deleted their account", { email: user.email }, user.id);
  if (!user.demo) await signOut({ redirectTo: "/?deleted=1" });
  redirect("/?deleted=1");
}

// ---------- Billing (Stripe) ----------

const billingError = (code) => redirect(`/app/account?billing=${code}#plan`);

/** Upgrade: send the member to Stripe's secure checkout page. */
export async function startCheckout(formData) {
  const user = await requireUser();
  if (user.demo || !billingLive()) billingError("off");
  // The Premium page asks members to agree to the terms before paying; keep a record of who agreed to which version.
  if (formData?.get("agree") !== "on") redirect("/app/premium?agree=missing#enroll");
  if (!allow("billing", user.id)) billingError("slow");
  if (hasLiveSubscription(user)) billingError("already"); // never sell a second subscription
  let url;
  await log("payments", "info", `Agreed to the Terms of Service (version ${TERMS_VERSION}) and started checkout`, { terms: TERMS_VERSION }, user.id);
  try { url = await checkoutUrl(user); } catch (e) { await logError("payments", "Checkout couldn't start", e, {}, user.id); billingError("error"); }
  redirect(url);
}

/** Manage subscription: Stripe's billing page (card, invoices, cancel). */
export async function openBillingPortal() {
  const user = await requireUser();
  if (user.demo || !billingLive() || !user.stripeCustomerId) billingError("off");
  if (!allow("billing", user.id)) billingError("slow");
  let url;
  try { url = await portalUrl(user); } catch (e) { await logError("payments", "Billing page couldn't open", e, {}, user.id); billingError("error"); }
  redirect(url);
}

/** Cancel at the end of the paid month (keeps Premium until then), or keep the subscription after all. */
export async function changeRenewal(formData) {
  const user = await requireUser();
  if (user.demo || !billingLive() || !user.stripeSubscriptionId) billingError("off");
  if (!allow("billing", user.id)) billingError("slow");
  const cancel = formData.get("renew") !== "on";
  try { await setCancelAtPeriodEnd(user, cancel); } catch (e) { await logError("payments", "Renewal change failed", e, { cancel }, user.id); billingError("error"); }
  revalidatePath("/app", "layout");
  billingError(cancel ? "cancelled-renewal" : "renewing");
}

export async function logOut() {
  if (demoMode) redirect("/");
  await signOut({ redirectTo: "/" });
}

/**
 * Card picker on the Deals page (filters): cards matching what's typed, limited to the chosen sets (if any), each marked
 * with how many the member owns. Without sets, a search needs 2+ letters (keeps price-service lookups cheap).
 */
export async function cardOptions(query, sets = []) {
  const user = await requireUser();
  if (!allow("search", user.id)) return { ok: false, error: SLOW_DOWN };
  const q = String(query || "").trim().toLowerCase().slice(0, 60);
  const known = new Set((await listSets().catch(() => [])).map((s) => s.name));
  const chosen = (Array.isArray(sets) ? sets : []).map(String).filter((s) => known.has(s)).slice(0, 5); // real sets only
  let cards = [];
  try {
    if (chosen.length) {
      if (!allow("setLoad", user.id)) return { ok: false, error: SLOW_DOWN };
      for (const s of chosen) cards.push(...(await getSetCards(s)));
    } else if (q.length >= 2) {
      cards = (await searchProducts(q)).filter((p) => p.type === "card");
    } else if (!catalogLive()) {
      cards = allSampleCards(); // preview catalog is small enough to list in full
    }
  } catch {
    return { ok: false, error: "Card list didn't load. Please try again in a minute." };
  }
  const words = q.split(/\s+/).filter(Boolean);
  const seen = new Set();
  const owned = {};
  for (const it of await store.listItems(user.id)) if (it.list === "owned") owned[it.productId] = (owned[it.productId] || 0) + it.quantity;
  const releases = Object.fromEntries((await listSets().catch(() => [])).map((s) => [s.name, s.releaseDate || ""]));
  const out = cards
    .filter((c) => !seen.has(c.id) && seen.add(c.id))
    .filter((c) => words.every((w) => `${c.name} ${c.number || ""} ${c.setName}`.toLowerCase().includes(w)))
    .slice(0, 200)
    .map((c) => ({ id: c.id, name: c.name, setName: c.setName, number: c.number, image: c.image, owned: owned[c.id] || 0, release: releases[c.setName] || "" }));
  return { ok: true, cards: out, needsQuery: !chosen.length && q.length < 2 && catalogLive() };
}

// ---------- text alerts ----------
const hashCode = (userId, code) => crypto.createHmac("sha256", process.env.AUTH_SECRET || "dev").update(`${userId}:${code}`).digest("hex");

/** Step 1: send a 6-digit code to the number the member typed. */
export async function sendPhoneCode(formData) {
  const user = await requireUser();
  if (!user.plan.watchAlertChannels.includes("sms")) redirect("/app/account?sms=premium#alerts");
  if (!user.demo && !channelsReady().sms) redirect("/app/account?sms=unavailable#alerts");
  if (formData.get("consent") !== "on") redirect("/app/account?sms=consent#alerts");
  const phone = normalizePhone(formData.get("phone"));
  if (!phone || !phone.startsWith("+1")) redirect("/app/account?sms=badnumber#alerts"); // US & Canada only
  if (!allow("smsCode", user.id)) redirect("/app/account?sms=toomany#alerts");
  const pending = await store.getPhoneCode(user.id);
  if (pending.smsCodeExpires && new Date(pending.smsCodeExpires).getTime() - 9 * 60 * 1000 > Date.now()) {
    redirect("/app/account?sms=wait#alerts"); // one code a minute
  }
  const code = String(crypto.randomInt(100000, 1000000));
  await store.setPhoneCode(user.id, phone, hashCode(user.id, code), new Date(Date.now() + 10 * 60 * 1000));
  if (user.demo) redirect(`/app/account?sms=sent&demo=${code}#alerts`);
  try {
    await sendSms(phone, `Your TCG Boogie code is ${code}. It expires in 10 minutes. Reply STOP to opt out.`);
  } catch (e) {
    await logError("alerts", "Text-message code not sent", e, {}, user.id);
    redirect("/app/account?sms=failed#alerts");
  }
  redirect("/app/account?sms=sent#alerts");
}

/** Step 2: check the code; on success, text alerts switch on. */
export async function verifyPhoneCode(formData) {
  const user = await requireUser();
  const code = String(formData.get("code") || "").replace(/\D/g, "");
  const pending = await store.getPhoneCode(user.id);
  const valid = pending.smsCodeHash && pending.smsCodeExpires && new Date(pending.smsCodeExpires).getTime() > Date.now()
    && code.length === 6 && crypto.timingSafeEqual(Buffer.from(hashCode(user.id, code)), Buffer.from(pending.smsCodeHash));
  if (!valid) redirect("/app/account?sms=badcode#alerts");
  await store.confirmPhone(user.id);
  revalidatePath("/app", "layout");
  redirect("/app/account?sms=verified#alerts");
}

export async function removePhone() {
  const user = await requireUser();
  await store.clearPhone(user.id);
  revalidatePath("/app", "layout");
  redirect("/app/account?sms=removed#alerts");
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
/** Forget the member's eBay connection (deletes the stored eBay tokens). */
export async function disconnectEbay() {
  const user = await requireUser();
  if (!user.demo) {
    const { disconnect } = await import("@/lib/ebay-sell");
    await disconnect(user.id);
  }
  redirect("/app/account?ebay=disconnected#ebay");
}

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
