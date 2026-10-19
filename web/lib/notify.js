import "server-only";
import nodemailer from "nodemailer";

// Sending alerts. Each channel switches on when its settings exist (Hostinger environment variables):
//   Email:   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM   (the tcgboogie.com mailbox)
//   Discord: DISCORD_BOT_TOKEN                                        (BoogieBot; members must share a server with it)
//   Text:    TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM        (a Twilio number, e.g. +18885551234)

export const channelsReady = () => ({
  email: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
  discord: Boolean(process.env.DISCORD_BOT_TOKEN),
  sms: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM),
});

let transport;
const mailer = () => (transport ||= nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: Number(process.env.SMTP_PORT || 465) === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
}));

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** A branded email: heading, a few lines, one button. */
export async function sendEmail(to, { subject, heading, lines = [], button, footer }) {
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
  const text = [heading, "", ...lines, "", button ? `${button.label}: ${button.url}` : "", "", footer || ""].join("\n").trim();
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;padding:28px;background:#0b0e12;color:#f4f5ef;border-radius:14px">
    <div style="font-weight:800;font-size:18px;letter-spacing:-0.5px;margin-bottom:18px">TCG <span style="color:#d3ff66">BOOGIE</span></div>
    <h2 style="margin:0 0 12px;font-size:22px">${esc(heading)}</h2>
    ${lines.map((l) => `<p style="margin:0 0 8px;color:#c9d1dd;font-size:15px">${esc(l)}</p>`).join("")}
    ${button ? `<p style="margin:20px 0"><a href="${esc(button.url)}" style="display:inline-block;background:#d3ff66;color:#15200c;font-weight:700;padding:12px 22px;border-radius:8px;text-decoration:none">${esc(button.label)}</a></p>` : ""}
    ${footer ? `<p style="color:#8f9aa9;font-size:12px;margin-top:22px">${esc(footer)}</p>` : ""}
  </div>`;
  await mailer().sendMail({ from: `TCG Boogie <${from}>`, to, subject, text, html });
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
    embeds: [{ title: title.slice(0, 256), description: description?.slice(0, 2000), url, color: 0xd3ff66, fields: fields.slice(0, 10) }],
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
