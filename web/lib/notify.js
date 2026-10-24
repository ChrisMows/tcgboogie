import "server-only";
import nodemailer from "nodemailer";
import { KINDS, unsubscribeUrl } from "@/lib/unsubscribe";

// Sending alerts. Each channel switches on when its settings exist (Hostinger environment variables):
//   Email:   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM   (the tcgboogie.com mailbox)
//            Optional ALERT_SMTP_HOST, ALERT_SMTP_PORT, ALERT_SMTP_USER, ALERT_SMTP_PASS: a separate sender for alert
//            emails (Amazon SES), so volume doesn't count against the mailbox's daily limit.
//   Discord: DISCORD_BOT_TOKEN                                        (BoogieBot; members must share a server with it)
//   Text:    TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM        (a Twilio number, e.g. +18885551234)

const alertSmtp = () => Boolean(process.env.ALERT_SMTP_HOST && process.env.ALERT_SMTP_USER && process.env.ALERT_SMTP_PASS);

export const channelsReady = () => ({
  email: alertSmtp() || Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
  discord: Boolean(process.env.DISCORD_BOT_TOKEN),
  sms: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM),
});

/** Which service alert emails go through (Admin -> Status). */
export const emailSender = () => (alertSmtp() ? "Amazon SES" : "Hostinger mailbox");

let transport;
const mailer = () => {
  if (transport) return transport;
  const ses = alertSmtp();
  const port = Number((ses ? process.env.ALERT_SMTP_PORT : process.env.SMTP_PORT) || 465);
  // A small pool of open connections: many alerts at once go out in parallel instead of one handshake each.
  transport = nodemailer.createTransport({
    pool: true, maxConnections: 3, maxMessages: 100,
    host: ses ? process.env.ALERT_SMTP_HOST : process.env.SMTP_HOST,
    port, secure: port === 465,
    auth: ses ? { user: process.env.ALERT_SMTP_USER, pass: process.env.ALERT_SMTP_PASS } : { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transport;
};

// Emails sent today (UTC), shared with Admin -> Status so you can see how close the mailbox is to its daily limit.
async function countEmail() {
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
  } catch { /* counting must never stop an email */ }
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Under every member alert and recap (emails with an unsubscribe link) and every Discord DM. See Terms section 6.
const VERIFY = "Prices and deals are automated estimates and can be wrong. Check every listing yourself before you buy; purchases are your own decision and at your own risk.";

/**
 * A branded email: heading, a few lines, an optional list of linked items (bundled deals), one button.
 * unsub: { userId, kind: "alerts" | "recap" } adds that member's one-click unsubscribe link and header.
 */
export async function sendEmail(to, { subject, heading, lines = [], items = [], button, footer }, unsub = null) {
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
  const text = [heading, "", ...lines, ...items.map((i) => `• ${i.text}\n  ${i.url}`), "", button ? `${button.label}: ${button.url}` : "", "", footer || "", unsub ? VERIFY : ""].join("\n").trim();
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;padding:28px;background:#0b0e12;color:#f4f5ef;border-radius:14px">
    <div style="font-weight:800;font-size:18px;letter-spacing:-0.5px;margin-bottom:18px">TCG <span style="color:#d3ff66">BOOGIE</span></div>
    <h2 style="margin:0 0 12px;font-size:22px">${esc(heading)}</h2>
    ${lines.map((l) => `<p style="margin:0 0 8px;color:#c9d1dd;font-size:15px">${esc(l)}</p>`).join("")}
    ${items.map((i) => `<p style="margin:0 0 10px;font-size:15px"><a href="${esc(i.url)}" style="color:#d3ff66;text-decoration:none">${esc(i.text)} →</a></p>`).join("")}
    ${button ? `<p style="margin:20px 0"><a href="${esc(button.url)}" style="display:inline-block;background:#d3ff66;color:#15200c;font-weight:700;padding:12px 22px;border-radius:8px;text-decoration:none">${esc(button.label)}</a></p>` : ""}
    ${footer ? `<p style="color:#8f9aa9;font-size:12px;margin-top:22px">${esc(footer)}</p>` : ""}
    ${unsub ? `<p style="color:#8f9aa9;font-size:12px;margin-top:${footer ? 8 : 22}px">${esc(VERIFY)}</p>` : ""}
  </div>`;
  // Every member email can be turned off in one click: a link in the footer, and the standard headers mail apps show
  // as "Unsubscribe" (RFC 8058 one-click). Without a member (e.g. a test) the link opens Settings instead.
  const site = process.env.AUTH_URL || "https://tcgboogie.com";
  const off = unsub ? unsubscribeUrl(unsub.userId, unsub.kind) : `${site}/app/account#alerts`;
  const offLabel = unsub ? `Unsubscribe from ${KINDS[unsub.kind]}` : "Turn off email alerts";
  const fullText = `${text}

${offLabel}: ${off}`;
  const fullHtml = html.replace(/<\/div>\s*$/, `<p style="color:#8f9aa9;font-size:12px;margin-top:10px">Don't want these emails? <a href="${esc(off)}" style="color:#8f9aa9">${esc(offLabel)}</a>.</p></div>`);
  const headers = unsub ? { "List-Unsubscribe": `<${off}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : { "List-Unsubscribe": `<${off}>` };
  await mailer().sendMail({ from: `TCG Boogie <${from}>`, to, subject, text: fullText, html: fullHtml, headers });
  void countEmail();
}

/** A direct message from BoogieBot. discordUserId is the member's Discord account ID. */
export async function sendDiscordDM(discordUserId, { title, description, url, fields = [] }) {
  const api = (path, body) => fetch(`https://discord.com/api/v10${path}`, {
    method: "POST",
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const ch = await api("/users/@me/channels", { recipient_id: String(discordUserId) });
  if (!ch.ok) throw new Error(`Discord couldn't open a DM (${ch.status}). The member may not share a server with BoogieBot.`);
  const { id } = await ch.json();
  const msg = await api(`/channels/${id}/messages`, {
    embeds: [{ title: title.slice(0, 256), description: description?.slice(0, 2000), url, color: 0xd3ff66, fields: fields.slice(0, 10), footer: { text: VERIFY } }],
  });
  if (!msg.ok) throw new Error(`Discord DM failed (${msg.status}). The member may have DMs turned off.`);
}

/** A text message through Twilio. to is E.164, e.g. +15551234567. */
export async function sendSms(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM, Body: body.slice(0, 600) }),
    cache: "no-store",
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(`Text failed (${r.status}${j.code ? `, Twilio ${j.code}` : ""}).`);
  }
}

/** "(555) 123-4567", "555-123-4567", "+1 555 123 4567" -> "+15551234567" (US numbers; others need a leading +). */
export function normalizePhone(input) {
  const s = String(input || "").trim();
  const digits = s.replace(/\D/g, "");
  if (s.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}
