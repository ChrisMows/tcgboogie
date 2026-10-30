"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { logAdminAction, requireAdmin, updateMember } from "@/lib/admin";
import { approveAsRead, approveRequest, declineRequests, markRequestDone } from "@/lib/card-requests";
import { hideMemberCard } from "@/lib/member-cards";
import { setIdeaStatus } from "@/lib/ideas";
import { currentFeatures, currentLimits, saveFeatures, saveLimits } from "@/lib/features";
import { FEATURES, LIMITS } from "@/lib/plans";
import { moveSubscribersToCurrentPrice, setupStripe } from "@/lib/billing";
import { log, logError } from "@/lib/log";
import { sendEmail } from "@/lib/notify";
import { sendTestAlert } from "@/lib/price-alerts";
import { sendRecapPreview } from "@/lib/recap";
import { releaseByVersion, sendRelease, sendReleaseTest } from "@/lib/release-email";
import { setPictureFromRequest } from "@/lib/card-images";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { marketItem } from "@/lib/market";
import { saleImage } from "@/lib/sale-image";
import { postToX } from "@/lib/x";

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
  let done = "granted";
  if (formData.get("email") === "on" && u.email) done = (await emailComp(u, fields)) ? "granted_emailed" : "granted_nomail";
  back(userId, done);
}

/** "You've got TCG Boogie Premium": how long it lasts, that it's free, and what it unlocks. The admin note stays private. */
async function emailComp(u, { compUnlimited, compUntil }) {
  const until = compUntil?.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });
  const site = (process.env.AUTH_URL || "https://tcgboogie.com").replace(/\/$/, "");
  try {
    await sendEmail(u.email, {
      subject: "You've got TCG Boogie Premium 🎉",
      heading: `${u.name ? `${u.name.split(" ")[0]}, you've` : "You've"} got Premium`,
      lines: [
        compUnlimited ? "We've given your account complimentary Premium with no end date." : `We've given your account complimentary Premium until ${until}.`,
        "It's on us: no card needed and you won't be charged. Everything Premium is already on: instant deal alerts and the live feed, up to 15 deal filters, many more price alerts, Japanese cards, the photo appraiser and your collection's full value history.",
        compUnlimited ? "Enjoy!" : "When it ends, your account goes back to Free and nothing in your collection is lost. To keep Premium after that, subscribe any time from the Premium page.",
      ],
      button: { label: "Open TCG Boogie", url: `${site}/app/collection` },
      footer: "You're getting this because a TCG Boogie admin added Premium to your account.",
    });
    return true;
  } catch (e) {
    await log("admin", "warn", `Couldn't email ${u.email} about their complimentary Premium: ${e.message}`, null, u.id);
    return false;
  }
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

/** Admin -> Requests -> Pictures: use a picture link for a card that had none (shown everywhere). */
export async function setRequestPicture(id, formData) {
  const admin = await requireAdmin();
  const err = await setPictureFromRequest(admin, id, formData.get("image"));
  if (err) redirect(`/app/admin?tab=requests&kind=picture&err=${encodeURIComponent(err)}`);
  await logAdminAction(admin, "set_card_picture", { request: Number(id) });
  revalidatePath("/app", "layout");
  redirect("/app/admin?tab=requests&kind=picture&ok=picture");
}

/** Admin -> Release emails: a [Test] copy of a release email to the signed-in admin. */
export async function testReleaseEmail(version) {
  const admin = await requireAdmin();
  let r = "test-sent";
  try { await sendReleaseTest(version, admin); } catch (e) { r = `fail:${String(e.message).slice(0, 200)}`; }
  redirect(`/app/admin?tab=releases&r=${encodeURIComponent(r)}&v=${encodeURIComponent(version)}`);
}

/**
 * Admin -> Release emails: email a release to every member with product updates on. The send carries on in the
 * background (and on the next price-alert run if it stops); the page shows its progress.
 */
export async function sendReleaseEmail(version, formData) {
  const admin = await requireAdmin();
  if (!releaseByVersion(version) || formData.get("confirm") !== "yes") redirect("/app/admin?tab=releases");
  await logAdminAction(admin, "release_email", { version });
  void sendRelease(version, { by: admin.id }).catch((e) => logError("admin", `Release email v${version} crashed`, e));
  redirect(`/app/admin?tab=releases&r=started&v=${encodeURIComponent(version)}`);
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

/** Move current subscribers onto today's Premium price from their next bill (after a price change). */
export async function moveSubscribers() {
  const admin = await requireAdmin();
  let msg;
  try {
    const r = await moveSubscribersToCurrentPrice();
    await logAdminAction(admin, "moveSubscribers", r);
    msg = `moved:${r.moved}:${r.already}:${r.failed}`;
  } catch (e) {
    await logError("payments", "Moving subscribers failed", e);
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

// ----- Admin → Sales: post a sale's share image to X, or skip it (lib/market.js, lib/x.js) -----
export async function postSale(id, formData) {
  const admin = await requireAdmin();
  const x = await marketItem(id);
  if (!x) redirect("/app/admin?tab=sales&err=gone");
  const [done] = await db.select().from(schema.socialPosts).where(eq(schema.socialPosts.key, id)).limit(1);
  if (done) redirect("/app/admin?tab=sales&err=already");
  const caption = String(formData.get("caption") || x.caption).trim().slice(0, 280);
  let posted;
  try {
    const png = Buffer.from(await (await saleImage(x)).arrayBuffer());
    posted = await postToX(caption, png);
  } catch (e) {
    await logError("admin", `Couldn't post ${id} to X`, e);
    redirect(`/app/admin?tab=sales&err=${encodeURIComponent(String(e.message).slice(0, 180))}`);
  }
  await db.insert(schema.socialPosts).values({ key: id, status: "posted", caption, postId: posted.id, postUrl: posted.url, by: admin.email }).onConflictDoNothing();
  await logAdminAction(admin, "x_post", { id, url: posted.url });
  redirect("/app/admin?tab=sales&ok=posted");
}

export async function skipSale(id) {
  const admin = await requireAdmin();
  await db.insert(schema.socialPosts).values({ key: id, status: "skipped", by: admin.email }).onConflictDoNothing();
  redirect("/app/admin?tab=sales&ok=skipped");
}
