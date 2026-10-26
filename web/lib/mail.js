import nodemailer from "nodemailer";

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

// Emails sent today (UTC), shared with Admin -> Status and Admin -> Usage so you can see how close the sender is to
// its daily limit.
export async function countEmail() {
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

export async function sendLoginEmail(to, url) {
  const host = new URL(url).host;
  await mailer().sendMail({
    from: `TCG Boogie <${emailFrom()}>`,
    to,
    subject: "Your TCG Boogie sign-in link",
    text: `Sign in to TCG Boogie:\n${url}\n\nThis link expires in 24 hours and can be used once. If you didn't ask for it, you can ignore this email.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;background:#0b0d12;color:#e8ecf3;border-radius:12px">
      <h2 style="margin:0 0 12px">Sign in to TCG <span style="color:#f5c518">Boogie</span></h2>
      <p style="color:#98a2b3">Click the button to sign in to ${host}. The link expires in 24 hours and works once.</p>
      <p><a href="${url}" style="display:inline-block;background:#f5c518;color:#1a1400;font-weight:600;padding:12px 22px;border-radius:10px;text-decoration:none">Sign in</a></p>
      <p style="color:#98a2b3;font-size:13px">If you didn't ask for this, you can ignore this email.</p></div>`,
  });
  void countEmail();
}
