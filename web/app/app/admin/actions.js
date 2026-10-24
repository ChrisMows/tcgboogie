"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { logAdminAction, requireAdmin, updateMember } from "@/lib/admin";
import { approveAsRead, approveRequest, declineRequests, markRequestDone } from "@/lib/card-requests";
import { hideMemberCard } from "@/lib/member-cards";
import { setIdeaStatus } from "@/lib/ideas";
import { currentFeatures, currentLimits, saveFeatures, saveLimits } from "@/lib/features";
import { FEATURES, LIMITS } from "@/lib/plans";
import { setupStripe } from "@/lib/billing";
import { logError } from "@/lib/log";
import { sendTestAlert } from "@/lib/price-alerts";
import { sendRecapPreview } from "@/lib/recap";

// Every admin action re-checks that the signed-in member is an admin, and every change is written to the admin log.
const back = (id, done) => redirect(`/app/admin?tab=members&user=${encodeURIComponent(id)}&done=${done}#member`);
const DAY = 86400000;

/** Admin → Requests: approve a card request with a TCGplayer link (search learns the member's words), or decline. */
export async function approveCardRequest(id, formData) {
  const admin = await requireAdmin();
  const err = await approveRequest(admin, id, formData.get("tcgplayer"));
  if (!err) await logAdminAction(admin, "card_request", { id, result: "approved" });
  redirect(`/app/admin?tab=requests&${err ? `err=${encodeURIComponent(err)}` : "ok=approved"}`);
}

/** Admin → Requests: add a held card exactly as we read it from the member's link. */
export async function approveReadCard(id) {
  const admin = await requireAdmin();
  const err = await approveAsRead(admin, id);
  if (!err) await logAdminAction(admin, "card_request", { id, result: "added as read" });
  redirect(`/app/admin?tab=requests&${err ? `err=${encodeURIComponent(err)}` : "ok=approved"}`);
}

export async function declineCardRequest(id) {
  const admin = await requireAdmin();
  await declineRequests(admin, id, "Declined by an admin");
  await logAdminAction(admin, "card_request", { id, result: "declined" });
  redirect("/app/admin?tab=requests&ok=declined");
}

/** Admin → Requests → Import files: mark a file format as reviewed. */
export async function doneCardRequest(id) {
  const admin = await requireAdmin();
  await markRequestDone(admin, id);
  await logAdminAction(admin, "card_request", { id, result: "done" });
  redirect("/app/admin?tab=requests&kind=import&ok=done");
}

/** Admin → Requests: take a wrongly added member card out of search and card pages (members' lines stay saved). */
export async function removeMemberCard(productId) {
  const admin = await requireAdmin();
  await hideMemberCard(productId);
  await logAdminAction(admin, "card_request", { id: productId, result: "card removed" });
  redirect("/app/admin?tab=requests&show=all&ok=removed");
}

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

/** Admin → Plans: the number limits for each plan ("unlimited" or a whole number). */
export async function saveLimitChoices(formData) {
  const admin = await requireAdmin();
  const before = await currentLimits();
  const read = (key, tier) => {
    const v = formData.get(`${key}:${tier}`);
    return v === "unlimited" ? null : v === null || v === "" ? before[tier][key] : Number(v);
  };
  const next = Object.fromEntries(["free", "premium"].map((t) => [t, Object.fromEntries(LIMITS.map((l) => [l.key, read(l.key, t)]))]));
  const show = (v) => (v === null ? "unlimited" : String(v));
  const saved = await saveLimits(next);
  const changed = LIMITS.flatMap((l) => ["free", "premium"].filter((t) => (saved[t]?.[l.key] ?? before[t][l.key]) !== before[t][l.key])
    .map((t) => `${l.label} (${t === "free" ? "Free" : "Premium"}): ${show(before[t][l.key])} → ${show(saved[t][l.key])}`));
  if (changed.length) await logAdminAction(admin, "features", { changed });
  revalidatePath("/", "layout");
  redirect(`/app/admin?tab=features&limits=${changed.length}#limits`);
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

/** Admin → Ideas: set the status of one idea or a whole group. Done emails each member who asked (once). */
export async function setIdeas(formData) {
  const admin = await requireAdmin();
  const ids = String(formData.get("ids") || "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const status = String(formData.get("status") || "");
  const view = String(formData.get("back") || "open").replace(/[^a-z]/g, "");
  let emailed = 0;
  try {
    emailed = await setIdeaStatus(ids, status, String(formData.get("note") || ""));
    await logAdminAction(admin, "ideas", { ids, status, emailed });
  } catch (e) {
    await logError("admin", "Couldn't update ideas", e, { ids, status }, admin.id);
    redirect(`/app/admin?tab=ideas&show=${view}&err=1`);
  }
  revalidatePath("/app/admin");
  redirect(`/app/admin?tab=ideas&show=${view}&ok=${ids.length}&emailed=${emailed}`);
}
