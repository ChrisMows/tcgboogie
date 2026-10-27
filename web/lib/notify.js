import "server-only";
import { BRAND, emailButton, emailLayout, emailRows, emailStat, emailSubhead, emailText, esc } from "@/lib/email-layout";
import { countEmail, emailConfigured, emailFrom, mailer, memberEmailAllowed } from "@/lib/mail";
import { KINDS, unsubscribeUrl } from "@/lib/unsubscribe";

// Sending alerts. Each channel switches on when its settings exist (Hostinger environment variables):
//   Email:   lib/mail.js: a sending service (Resend, ALERT_SMTP_*) or the tcgboogie.com mailbox (SMTP_*), EMAIL_FROM
//   Discord: DISCORD_BOT_TOKEN                                        (BoogieBot; members must share a server with it)
//   Text:    TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM        (a Twilio number, e.g. +18885551234)
//   Push:    nothing: lib/push.js makes and keeps its own keys          (each member switches devices on in Settings)

export const channelsReady = () => ({
  email: emailConfigured(),
  discord: Boolean(process.env.DISCORD_BOT_TOKEN),
  sms: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM),
  push: Boolean(process.env.DATABASE_URL), // its keys live in the database (lib/push.js): nothing else to set up
});

// Under every member alert and recap (emails with an unsubscribe link) and every Discord DM. See Terms section 6.
const VERIFY = "Prices and deals are automated estimates and can be wrong. Check every listing yourself before you buy; purchases are your own decision and at your own risk.";

/**
 * A branded email's text and HTML (lib/email-layout.js), exported so it can be previewed. Every part is optional:
 *   stat: { label, value, change, tone } a headline number (the recap's collection value);
 *   lines: paragraphs; items: cards as rows (title, sub, image, value, note, tone, url; text for the plain-text copy),
 *   or plain linked lines when they have only text and url; itemsTitle: a small heading above them;
 *   more: paragraphs after the list; button: { label, url }; footer: small print.
 * off / offLabel: the unsubscribe link.
 */
export function renderEmail({ heading, stat, lines = [], items = [], itemsTitle, more = [], button, footer }, { site, off, offLabel, verify }) {
  const itemText = (i) => i.text || [i.title, i.sub, [i.value, i.note].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
  const text = [heading, "", stat ? `${stat.label}: ${stat.value}${stat.change ? ` (${stat.change})` : ""}` : "", ...lines,
    itemsTitle ? `\n${itemsTitle}:` : "", ...items.map((i) => `• ${itemText(i)}${i.url ? `\n  ${i.url}` : ""}`), ...more,
    "", button ? `${button.label}: ${button.url}` : "", "", footer || "", verify ? VERIFY : "", "", `${offLabel}: ${off}`]
    .join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const rich = items.some((i) => i.title);
  const html = emailLayout({
    site, heading, preheader: stat ? `${stat.label}: ${stat.value}${stat.change ? ` (${stat.change})` : ""}` : lines[0] || itemText(items[0] || {}),
    content: [
      stat ? emailStat(stat) : "",
      ...lines.map((l) => emailText(esc(l))),
      itemsTitle && items.length ? emailSubhead(itemsTitle) : "",
      rich ? emailRows(items)
        : items.map((i) => emailText(`<a href="${esc(i.url)}" style="color:${BRAND.accent};text-decoration:none;font-weight:600">${esc(i.text)} &rarr;</a>`, { top: 4 })).join(""),
      ...more.map((l) => emailText(esc(l), { top: 8 })),
      button ? emailButton(button.label, button.url) : "",
    ].join(""),
    notes: [footer && esc(footer), verify && esc(VERIFY), `Don't want these emails? <a href="${esc(off)}" style="color:${BRAND.muted};text-decoration:underline">${esc(offLabel)}</a>.`].filter(Boolean),
  });
  return { text, html };
}

/**
 * Send a branded email. unsub: { userId, kind: "alerts" | "recap" } adds that member's one-click unsubscribe link and
 * header; those member emails stop for the day near the sender's limit (lib/mail.js memberEmailAllowed).
 */
export async function sendEmail(to, email, unsub = null) {
  if (unsub && !(await memberEmailAllowed())) {
    throw new Error("Held back: today's email limit is nearly used up, and the rest is kept for sign-in links");
  }
  // Every member email can be turned off in one click: a link in the footer, and the standard headers mail apps show
  // as "Unsubscribe" (RFC 8058 one-click). Without a member (e.g. a test) the link opens Settings instead.
  const site = process.env.AUTH_URL || "https://tcgboogie.com";
  const off = unsub ? unsubscribeUrl(unsub.userId, unsub.kind) : `${site}/app/account#alerts`;
  const offLabel = unsub ? `Unsubscribe from ${KINDS[unsub.kind]}` : "Turn off email alerts";
  const { text, html } = renderEmail(email, { site, off, offLabel, verify: Boolean(unsub) });
  const headers = unsub ? { "List-Unsubscribe": `<${off}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : { "List-Unsubscribe": `<${off}>` };
  await mailer().sendMail({ from: `TCG Boogie <${emailFrom()}>`, to, subject: email.subject, text, html, headers });
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
  // A bounce is almost always the member's Discord setup (not in our server, or DMs off), not a site fault: say which
  // (lib/discord-reach.js tells the member once) and start the message with "Discord unreachable" so the admin's
  // error email leaves it out.
  const bounced = async (status) => {
    const { noteDmFailure } = await import("@/lib/discord-reach");
    throw new Error(`Discord unreachable (${status}): the member ${await noteDmFailure(discordUserId)}; they've been told how to fix it`);
  };
  const ch = await api("/users/@me/channels", { recipient_id: String(discordUserId) });
  if (!ch.ok) await bounced(ch.status);
  const { id } = await ch.json();
  const msg = await api(`/channels/${id}/messages`, {
    embeds: [{ title: title.slice(0, 256), description: description?.slice(0, 2000), url, color: 0xd3ff66, fields: fields.slice(0, 10), footer: { text: VERIFY } }],
  });
  if (!msg.ok) await bounced(msg.status);
  void import("@/lib/discord-reach").then((m) => m.noteDmSuccess(discordUserId)).catch(() => {});
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
