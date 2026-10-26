// The look every TCG Boogie email shares (sign-in links in lib/mail.js, alerts and recaps in lib/notify.js): the logo,
// a dark card in the site's colors, a lime button and a footer. Email apps ignore most CSS, so it's tables and inline
// styles, system fonts, and a PNG logo (Outlook can't show WebP).
import { X_HANDLE, X_URL } from "@/lib/social";

export const BRAND = { bg: "#0b0e12", card: "#151a22", line: "#262d38", text: "#f4f5ef", body: "#c9d1dd", muted: "#8f9aa9", accent: "#d3ff66", ink: "#15200c" };
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** A button that still looks like one in Outlook (the table cell carries the color, not just the link). */
export function emailButton(label, url) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px"><tr>
    <td bgcolor="${BRAND.accent}" style="border-radius:10px">
      <a href="${esc(url)}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:700;color:${BRAND.ink};text-decoration:none;border-radius:10px">${esc(label)}</a>
    </td></tr></table>`;
}

export const emailText = (t, { size = 15, color = BRAND.body, top = 0 } = {}) =>
  `<p style="margin:${top}px 0 10px;font-family:${FONT};font-size:${size}px;line-height:1.55;color:${color}">${t}</p>`;

const TONE = { up: "#5ee08a", down: "#ff7a7a", good: BRAND.accent };

/** A headline number (the recap's collection value): small label, big value, a colored change under it. */
export function emailStat({ label, value, change = "", tone = "" }) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px"><tr>
    <td bgcolor="${BRAND.bg}" style="background:${BRAND.bg};border:1px solid ${BRAND.line};border-radius:12px;padding:16px 18px;font-family:${FONT}">
      <div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;color:${BRAND.muted}">${esc(label)}</div>
      <div style="font-size:32px;line-height:1.2;font-weight:800;color:${BRAND.text};margin-top:4px">${esc(value)}</div>
      ${change ? `<div style="font-size:14px;font-weight:700;color:${TONE[tone] || BRAND.body};margin-top:2px">${esc(change)}</div>` : ""}
    </td></tr></table>`;
}

/** A small heading inside the card, above a list. */
export const emailSubhead = (t) =>
  `<div style="margin:18px 0 6px;font-family:${FONT};font-size:12px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;color:${BRAND.muted}">${esc(t)}</div>`;

/**
 * A list of cards: picture, name (linked), a grey second line, and a number on the right (colored by tone: up, down,
 * good) with a small note under it. rows: [{ url, title, sub, image, value, note, tone }]; only title is required.
 */
export function emailRows(rows) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px">${rows.map((r, i) => {
    const pad = `padding:12px 0;${i ? `border-top:1px solid ${BRAND.line};` : ""}`;
    const link = (inner) => (r.url ? `<a href="${esc(r.url)}" style="color:${BRAND.text};text-decoration:none">${inner}</a>` : inner);
    return `<tr>
      ${r.image ? `<td width="58" valign="top" style="${pad}width:58px">${link(`<img src="${esc(r.image)}" width="46" alt="" style="display:block;border:0;width:46px;height:auto;border-radius:4px">`)}</td>` : ""}
      <td valign="top" style="${pad}font-family:${FONT}">
        <div style="font-size:15px;line-height:1.35;font-weight:700;color:${BRAND.text}">${link(esc(r.title))}</div>
        ${r.sub ? `<div style="font-size:13px;line-height:1.45;color:${BRAND.muted};margin-top:3px">${esc(r.sub)}</div>` : ""}
      </td>
      ${r.value ? `<td valign="top" align="right" style="${pad}padding-left:12px;font-family:${FONT};white-space:nowrap">
        <div style="font-size:15px;font-weight:800;color:${TONE[r.tone] || BRAND.text}">${esc(r.value)}</div>
        ${r.note ? `<div style="font-size:12px;color:${BRAND.muted};margin-top:3px">${esc(r.note)}</div>` : ""}
      </td>` : ""}
    </tr>`;
  }).join("")}</table>`;
}

/**
 * A whole email. content: HTML for inside the card (built with emailText / emailButton, values escaped);
 * preheader: the grey line inboxes show after the subject; notes: small print under the card (HTML, escaped).
 */
export function emailLayout({ site = "https://tcgboogie.com", preheader = "", heading, content = "", notes = [] }) {
  const s = site.replace(/\/$/, "");
  const link = (href, label) => `<a href="${esc(s + href)}" style="color:${BRAND.muted};text-decoration:underline">${label}</a>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${BRAND.bg}">${esc(preheader)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.bg}" style="background:${BRAND.bg}"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
    <tr><td align="center" style="padding:0 0 22px">
      <a href="${esc(s)}"><img src="${esc(s)}/brand/email-logo.png" width="170" height="107" alt="TCG Boogie" style="display:block;border:0;width:170px;height:auto"></a>
    </td></tr>
    <tr><td bgcolor="${BRAND.card}" style="background:${BRAND.card};border:1px solid ${BRAND.line};border-top:3px solid ${BRAND.accent};border-radius:16px;padding:32px 32px 26px">
      <h1 style="margin:0 0 14px;font-family:${FONT};font-size:24px;line-height:1.25;font-weight:800;color:${BRAND.text}">${esc(heading)}</h1>
      ${content}
    </td></tr>
    <tr><td style="padding:22px 12px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${BRAND.muted};text-align:center">
      ${notes.map((n) => `<p style="margin:0 0 10px">${n}</p>`).join("")}
      <p style="margin:0 0 6px"><b style="color:${BRAND.body}">TCG Boogie</b> · Pokémon card deals, prices and collection tracking</p>
      <p style="margin:0">${link("", "tcgboogie.com")} &nbsp;·&nbsp; ${link("/faq", "Help")} &nbsp;·&nbsp; ${link("/privacy", "Privacy")} &nbsp;·&nbsp; <a href="mailto:support@tcgboogie.com" style="color:${BRAND.muted};text-decoration:underline">support@tcgboogie.com</a></p>
      <p style="margin:8px 0 0"><a href="${X_URL}" style="color:${BRAND.text};text-decoration:none;font-weight:700">Follow ${X_HANDLE} on X</a></p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}
