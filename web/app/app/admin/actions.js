"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { logAdminAction, requireAdmin, updateMember } from "@/lib/admin";
import { currentFeatures, saveFeatures } from "@/lib/features";
import { FEATURES } from "@/lib/plans";
import { setupStripe } from "@/lib/billing";
import { logError } from "@/lib/log";
import { sendTestAlert } from "@/lib/price-alerts";
import { sendRecapPreview } from "@/lib/recap";

// Every admin action re-checks that the signed-in member is an admin, and every change is written to the admin log.
const back = (id, done) => redirect(`/app/admin?tab=members&user=${encodeURIComponent(id)}&done=${done}#member`);
const DAY = 86400000;

/** Admin → Features: which plan gets each feature. On for Free always means on for Premium too. */
export async function saveFeatureChoices(formData) {
  const admin = await requireAdmin();
  const before = await currentFeatures();
  const next = Object.fromEntries(FEATURES.map((f) => {
    const free = formData.get(`${f.key}:free`) === "on";
    return [f.key, { free, premium: free || formData.get(`${f.key}:premium`) === "on" }];
  }));
  const changed = FEATURES.filter((f) => before[f.key].free !== next[f.key].free || before[f.key].premium !== next[f.key].premium)
    .map((f) => `${f.label}: ${next[f.key].free ? "Free + Premium" : next[f.key].premium ? "Premium only" : "off"}`);
  await saveFeatures(next);
  if (changed.length) await logAdminAction(admin, "features", { changed });
  revalidatePath("/", "layout");
  redirect(`/app/admin?tab=features&saved=${changed.length}`);
}

/** Complimentary Premium: for N days, until a date, or unlimited. Never charged. */
export async function grantComp(userId, formData) {
  const admin = await requireAdmin();
  const length = String(formData.get("length") || "");
  const note = String(formData.get("note") || "").trim().slice(0, 200) || null;
  let fields;
  if (length === "unlimited") fields = { compUnlimited: true, compUntil: null };
  else if (length === "date") {
    const d = String(formData.get("until") || "");
    const until = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T23:59:59`) : null;
    if (!until || until.getTime() <= Date.now()) back(userId, "baddate");
    fields = { compUnlimited: false, compUntil: until };
  } else {
    const days = Number(length);
    if (![7, 30, 90, 365].includes(days)) back(userId, "badlength");
    fields = { compUnlimited: false, compUntil: new Date(Date.now() + days * DAY) };
  }
  const u = await updateMember(admin, userId, { ...fields, compNote: note, compGrantedAt: new Date() }, "grant_comp",
    { length, until: fields.compUntil ? fields.compUntil.toISOString() : "unlimited", note });
  if (!u) back(userId, "missing");
  revalidatePath("/app", "layout");
  back(userId, "granted");
}

export async function revokeComp(userId) {
  const admin = await requireAdmin();
  const u = await updateMember(admin, userId, { compUnlimited: false, compUntil: null, compNote: null, compGrantedAt: null }, "revoke_comp", {});
  if (!u) back(userId, "missing");
  revalidatePath("/app", "layout");
  back(userId, "revoked");
}

/** Set the paid plan directly (manual fixes now; Stripe will set this once payments launch). */
export async function setPlan(userId, formData) {
  const admin = await requireAdmin();
  const tier = formData.get("tier") === "premium" ? "premium" : "free";
  const status = ["active", "past_due", "canceled", ""].includes(String(formData.get("status") || "")) ? String(formData.get("status") || "") || null : null;
  const u = await updateMember(admin, userId, { tier, subscriptionStatus: status }, "set_plan", { tier, status });
  if (!u) back(userId, "missing");
  revalidatePath("/app", "layout");
  back(userId, "plan");
}

export async function renameMember(userId, formData) {
  const admin = await requireAdmin();
  const name = String(formData.get("name") || "").trim().slice(0, 60) || null;
  const u = await updateMember(admin, userId, { name }, "rename", { name });
  if (!u) back(userId, "missing");
  back(userId, "renamed");
}

export async function removeMemberPhone(userId) {
  const admin = await requireAdmin();
  const u = await updateMember(admin, userId, { phone: null, phoneVerifiedAt: null, alertSms: false, smsCodeHash: null, smsCodeExpires: null }, "remove_phone", {});
  if (!u) back(userId, "missing");
  back(userId, "phone");
}

/** Send a sample alert to the signed-in admin on every channel that's set up. */
export async function testAlert() {
  const admin = await requireAdmin();
  const results = await sendTestAlert(admin);
  const code = results.map((r) => `${r.channel}:${r.ok === true ? "ok" : r.ok === false ? "fail" : "off"}`).join(",");
  const why = results.filter((r) => r.ok === false).map((r) => `${r.channel}: ${r.detail}`).join(" | ").slice(0, 300);
  redirect(`/app/admin?test=${encodeURIComponent(code)}${why ? `&why=${encodeURIComponent(why)}` : ""}`);
}

/** Email the signed-in admin a preview of their recap. */
export async function testRecap() {
  const admin = await requireAdmin();
  let r;
  try { r = await sendRecapPreview(admin); } catch (e) { r = `fail:${String(e.message).slice(0, 200)}`; }
  redirect(`/app/admin?recap=${encodeURIComponent(r)}`);
}

/** Create the Premium price and the payment webhook in Stripe (safe to press again: it updates instead). */
export async function connectStripe() {
  await requireAdmin();
  let msg;
  try {
    const r = await setupStripe();
    msg = `ok:${r.mode}:${r.webhook}`;
  } catch (e) {
    await logError("payments", "Stripe setup failed", e);
    msg = `fail:${String(e.message).slice(0, 200)}`;
  }
  redirect(`/app/admin?stripe=${encodeURIComponent(msg)}`);
}
