import nodemailer from "nodemailer";
import { BRAND, emailButton, emailLayout, emailText, esc } from "@/lib/email-layout";

// Every email the site sends (sign-in links, alerts, recaps) goes out through one sender:
//   - a sending service when ALERT_SMTP_HOST, ALERT_SMTP_USER and ALERT_SMTP_PASS are set (Resend: smtp.resend.com,
//     port 465, user "resend", password = an API key). Its reputation keeps mail out of spam folders.
//   - otherwise the tcgboogie.com mailbox on Hostinger (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS).
// EMAIL_FROM is the From address either way (the sending service must have tcgboogie.com verified).
const service = () => Boolean(process.env.ALERT_SMTP_HOST && process.env.ALERT_SMTP_USER && process.env.ALERT_SMTP_PASS);

export const emailConfigured = () => service() || Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

/** Which service emails go through (Admin -> Status). */
export function emailSender() {
  if (!service()) return "Hostinger mailbox";
  const host = process.env.ALERT_SMTP_HOST;
  return /resend/i.test(host) ? "Resend" : /amazonaws/i.test(host) ? "Amazon SES" : host;
}

/**
 * Emails a day the sender allows, or null for no fixed limit (Admin -> Usage and the bot's usage warnings).
 * Resend's free plan: 100 a day (and 3,000 a month). ALERT_EMAIL_DAILY_LIMIT overrides it after a plan change;
 * EMAIL_DAILY_LIMIT is the Hostinger mailbox's (about 1,000).
 */
export function emailCap() {
  if (!service()) return Number(process.env.EMAIL_DAILY_LIMIT || 1000);
  if (process.env.ALERT_EMAIL_DAILY_LIMIT) return Number(process.env.ALERT_EMAIL_DAILY_LIMIT);
  return emailSender() === "Resend" ? 100 : null;
}

export const emailFrom = () => process.env.EMAIL_FROM || process.env.SMTP_USER;

let transport;
/** The shared connection: a small pool, so many alerts at once go out in parallel instead of one handshake each. */
export function mailer() {
  if (transport) return transport;
  const s = service();
  const port = Number((s ? process.env.ALERT_SMTP_PORT : process.env.SMTP_PORT) || 465);
  transport = nodemailer.createTransport({
    pool: true, maxConnections: 3, maxMessages: 100,
    host: s ? process.env.ALERT_SMTP_HOST : process.env.SMTP_HOST,
    port, secure: port === 465,
    auth: s ? { user: process.env.ALERT_SMTP_USER, pass: process.env.ALERT_SMTP_PASS } : { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transport;
}

// Emails sent today (UTC): kept in memory as they go out (alerts go out in parallel, faster than the database count
// updates), read from the database once a day or after a restart.
const g = globalThis;
g.__tcgMailToday ??= { day: "", n: null };
const utcDay = () => new Date().toISOString().slice(0, 10);

async function sentToday() {
  const day = utcDay();
  if (g.__tcgMailToday.day !== day || g.__tcgMailToday.n === null) {
    let n = 0;
    try {
      const { db, schema } = await import("@/lib/db");
      const { eq } = await import("drizzle-orm");
      const [row] = db ? await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, "emails_sent")).limit(1) : [];
      n = row?.value?.day === day ? Number(row.value.n) || 0 : 0;
    } catch { /* unknown: count from zero */ }
    g.__tcgMailToday = { day, n };
  }
  return g.__tcgMailToday.n;
}

/** Emails kept back each day for sign-in links: a tenth of the limit, at least 10. */
export const signInReserve = (cap) => Math.max(10, Math.round(cap * 0.1));

/**
 * May a member email (an alert or a recap) go out now? Not once today's count reaches the limit minus the sign-in
 * reserve: alerts can wait until tomorrow, but without sign-in links nobody new can join or sign in. Sign-in links
 * and account emails (billing, admin) don't ask.
 */
export async function memberEmailAllowed() {
  const cap = emailCap();
  if (!cap) return true;
  return (await sentToday()) < cap - signInReserve(cap);
}

// Emails sent today (UTC), shared with Admin -> Status and Admin -> Usage so you can see how close the sender is to
// its daily limit.
export async function countEmail() {
  if (g.__tcgMailToday.day === utcDay() && g.__tcgMailToday.n !== null) g.__tcgMailToday.n++;
  try {
    const { db, schema } = await import("@/lib/db");
    if (!db) return;
    const { sql } = await import("drizzle-orm");
    const day = new Date().toISOString().slice(0, 10);
    await db.insert(schema.appSettings).values({ key: "emails_sent", value: { day, n: 1 } })
      .onConflictDoUpdate({ target: schema.appSettings.key, set: {
        value: sql`case when ${schema.appSettings.value}->>'day' = ${day}
          then jsonb_build_object('day', ${day}::text, 'n', coalesce((${schema.appSettings.value}->>'n')::int, 0) + 1)
          else jsonb_build_object('day', ${day}::text, 'n', 1) end`,
        updatedAt: new Date() } });
    const { bumpUsage } = await import("@/lib/usage");
    bumpUsage("emails", 1, emailCap());
  } catch { /* counting must never stop an email */ }
}

/** The sign-in email's subject, plain text and HTML (exported so it can be previewed). */
export function loginEmail(to, url) {
  const site = new URL(url).origin;
  const html = emailLayout({
    site, heading: "Sign in to TCG Boogie", preheader: "Your one-time sign-in link. It expires in 24 hours.",
    content: [
      emailText("Tap the button below to sign in. No password needed."),
      emailButton("Sign in to TCG Boogie", url),
      emailText("The link works once and expires in 24 hours.", { size: 13, color: BRAND.muted }),
      `<div style="border-top:1px solid ${BRAND.line};margin:22px 0 16px"></div>`,
      emailText("Button not working? Copy this link into your browser:", { size: 13, color: BRAND.muted }),
      emailText(`<a href="${esc(url)}" style="color:${BRAND.accent};word-break:break-all;text-decoration:none">${esc(url)}</a>`, { size: 12 }),
    ].join(""),
    notes: [`This link was requested for ${esc(to)}. If that wasn't you, ignore this email: no one can sign in without the link.`],
  });
  const text = `Sign in to TCG Boogie

Open this link to sign in (no password needed):
${url}

The link works once and expires in 24 hours.

This link was requested for ${to}. If that wasn't you, ignore this email: no one can sign in without the link.

TCG Boogie · ${site.replace(/^https?:\/\//, "")} · support@tcgboogie.com`;
  return { subject: "Your TCG Boogie sign-in link", text, html };
}

export async function sendLoginEmail(to, url) {
  // A failed send shows the member "Sign-in didn't work"; the sender's reason goes to Admin -> Logs.
  await mailer().sendMail({ from: `TCG Boogie <${emailFrom()}>`, to, ...loginEmail(to, url) }).catch(async (e) => {
    const { log } = await import("@/lib/log");
    await log("signin", "error", `Couldn't email a sign-in link through ${emailSender()}: ${e?.message || e}`, { to, code: e?.responseCode || e?.code || null });
    throw e;
  });
  void countEmail();
}
