import "server-only";
import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { log } from "@/lib/log";
import { renderEmail, sendEmail } from "@/lib/notify";
import { RELEASES } from "@/lib/release-notes";

// Release notes by email (Admin -> Release emails). One click emails a release from lib/release-notes.js to every
// member with product updates on (Settings; default on, one-click unsubscribe in each email). Each member gets it
// once: every send is written to alert_log (kind "release", title "v1.1"), so a send that stops (the day's email
// limit, a restart) picks up where it left off on the next price-alert run, never twice. Members who join after the
// send started aren't included.
const { users, alertLog, appSettings } = schema;
const SITE = (process.env.AUTH_URL || "https://tcgboogie.com").replace(/\/$/, "");
const KIND = "release";
const TONE = { New: "good", Improved: "up", Fixed: "" };
const g = globalThis;
g.__tcgReleaseSending ??= new Set(); // versions being sent by this server right now

export const releaseByVersion = (v) => RELEASES.find((r) => r.version === String(v)) || null;
const anchor = (r) => `${SITE}/updates#v${r.version.replace(/\./g, "-")}`;
const stateKey = (r) => `release_email:v${r.version}`;

/** The email for one release (subject, heading, cards per change, button), for sendEmail / renderEmail. */
export function releaseEmail(r) {
  const counts = ["New", "Improved", "Fixed"].map((t) => [t, r.items.filter((i) => i.tag === t).length]).filter(([, n]) => n);
  return {
    subject: `🆕 TCG Boogie v${r.version}: ${r.title}`,
    heading: `What's new in TCG Boogie v${r.version}`,
    lines: [`${r.title}. ${counts.map(([t, n]) => `${n} ${t.toLowerCase()}`).join(", ")}:`],
    items: ["New", "Improved", "Fixed"].flatMap((t) => r.items.filter((i) => i.tag === t)).map((i) => ({ title: i.title, sub: i.text, value: i.tag, tone: TONE[i.tag] || "",
      url: i.href ? (/^https?:/.test(i.href) ? i.href : `${SITE}${i.href}`) : anchor(r) })),
    button: { label: "See the full release notes", url: anchor(r) },
    footer: "You're getting this because product updates are on in your TCG Boogie settings.",
  };
}

/** The email's HTML as a member will see it (Admin preview). */
export function releasePreviewHtml(r) {
  return renderEmail(releaseEmail(r), { site: SITE, off: "#", offLabel: "Unsubscribe from product update emails", verify: false }).html;
}

async function getState(r) {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, stateKey(r))).limit(1);
  return row?.value || null;
}
async function setState(r, value) {
  await db.insert(appSettings).values({ key: stateKey(r), value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}

/** Members a release goes to: an email address, product updates on, and joined before the send started. */
async function audience(startedAt) {
  return db.select({ id: users.id, email: users.email }).from(users)
    .where(and(isNotNull(users.email), eq(users.emailUpdates, true), lte(users.createdAt, startedAt)));
}

/** Who has it already (ok sends). */
async function sentTo(r) {
  const rows = await db.select({ userId: alertLog.userId }).from(alertLog)
    .where(and(eq(alertLog.kind, KIND), eq(alertLog.title, `v${r.version}`), eq(alertLog.ok, true)));
  return new Set(rows.map((x) => x.userId));
}

/** Each release's email status for the admin page: { version: { state, sent, total, startedAt, finishedAt, note } }. */
export async function releaseEmailStatus() {
  const out = {};
  if (!db) return out;
  const keys = RELEASES.map(stateKey);
  const states = Object.fromEntries((await db.select().from(appSettings).where(inArray(appSettings.key, keys))).map((x) => [x.key, x.value]));
  const counts = await db.select({ title: alertLog.title, userId: alertLog.userId }).from(alertLog)
    .where(and(eq(alertLog.kind, KIND), eq(alertLog.ok, true)));
  const optedIn = (await db.select({ id: users.id }).from(users).where(and(isNotNull(users.email), eq(users.emailUpdates, true)))).length;
  for (const r of RELEASES) {
    const s = states[stateKey(r)] || null;
    const sent = new Set(counts.filter((c) => c.title === `v${r.version}`).map((c) => c.userId)).size;
    out[r.version] = { state: s?.state || "new", sent, total: s?.total ?? optedIn, startedAt: s?.startedAt || null, finishedAt: s?.finishedAt || null, note: s?.note || "" };
  }
  return out;
}

/**
 * Send (or keep sending) a release to everyone who doesn't have it yet. Stops for the day when the email limit's
 * sign-in reserve is reached (lib/mail.js) and says so; the next price-alert run carries on. Returns the counts.
 */
export async function sendRelease(version, { by = null } = {}) {
  const r = releaseByVersion(version);
  if (!r || !db) return { error: "No such release" };
  if (g.__tcgReleaseSending.has(r.version)) return { busy: true };
  g.__tcgReleaseSending.add(r.version);
  const res = { sent: 0, failed: 0, held: false };
  try {
    let state = await getState(r);
    if (state?.state === "done") return { ...res, done: true };
    if (!state) {
      state = { state: "sending", startedAt: new Date().toISOString(), by };
      await log("admin", "info", `Release email v${r.version} started`, null, by);
    }
    const startedAt = new Date(state.startedAt);
    const people = await audience(startedAt);
    const have = await sentTo(r);
    const todo = people.filter((p) => !have.has(p.id));
    await setState(r, { ...state, state: "sending", total: people.length, note: "" });
    const email = releaseEmail(r);
    for (const p of todo) {
      try {
        await sendEmail(p.email, email, { userId: p.id, kind: "updates" });
        await db.insert(alertLog).values({ userId: p.id, kind: KIND, channel: "email", title: `v${r.version}`, ok: true });
        res.sent++;
      } catch (e) {
        if (/^Held back/.test(e.message)) { res.held = true; break; }
        res.failed++;
        await db.insert(alertLog).values({ userId: p.id, kind: KIND, channel: "email", title: `v${r.version}`, ok: false, error: String(e.message).slice(0, 300) });
      }
    }
    const done = !res.held && todo.length === res.sent + res.failed;
    await setState(r, { ...state, state: done ? "done" : "sending", total: people.length,
      ...(done ? { finishedAt: new Date().toISOString() } : {}),
      note: res.held ? "Paused for today: the daily email limit is nearly used up (the rest is kept for sign-in links). It carries on tomorrow by itself." : "" });
    await log("admin", res.failed ? "warn" : "info",
      `Release email v${r.version}: ${res.sent} sent${res.failed ? `, ${res.failed} failed` : ""}${res.held ? ", paused at the daily email limit" : done ? ", finished" : ""}`, res, by);
    return { ...res, done };
  } finally {
    g.__tcgReleaseSending.delete(r.version);
  }
}

/** The price-alert run: carry on any release email that stopped part-way. */
export async function continueReleaseEmails() {
  if (!db) return [];
  const sending = (await db.select().from(appSettings).where(inArray(appSettings.key, RELEASES.map(stateKey))))
    .filter((x) => x.value?.state === "sending").map((x) => x.key.replace("release_email:v", ""));
  const out = [];
  for (const v of sending) out.push({ version: v, ...(await sendRelease(v)) });
  return out;
}

/** A test copy to one address (the admin), marked [Test]. */
export async function sendReleaseTest(version, user) {
  const r = releaseByVersion(version);
  if (!r) throw new Error("No such release");
  const email = releaseEmail(r);
  await sendEmail(user.email, { ...email, subject: `[Test] ${email.subject}` }, { userId: user.id, kind: "updates" });
}
