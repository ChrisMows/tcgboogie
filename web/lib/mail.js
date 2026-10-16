import nodemailer from "nodemailer";

// Login emails go out through the tcgboogie.com mailbox on Hostinger (SMTP settings in the environment).
let transport;
function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: Number(process.env.SMTP_PORT || 465) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transport;
}

export const emailConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

export async function sendLoginEmail(to, url) {
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
  const host = new URL(url).host;
  await getTransport().sendMail({
    from: `TCG Boogie <${from}>`,
    to,
    subject: "Your TCG Boogie sign-in link",
    text: `Sign in to TCG Boogie:\n${url}\n\nThis link expires in 24 hours and can be used once. If you didn't ask for it, you can ignore this email.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;background:#0b0d12;color:#e8ecf3;border-radius:12px">
      <h2 style="margin:0 0 12px">Sign in to TCG <span style="color:#f5c518">Boogie</span></h2>
      <p style="color:#98a2b3">Click the button to sign in to ${host}. The link expires in 24 hours and works once.</p>
      <p><a href="${url}" style="display:inline-block;background:#f5c518;color:#1a1400;font-weight:600;padding:12px 22px;border-radius:10px;text-decoration:none">Sign in</a></p>
      <p style="color:#98a2b3;font-size:13px">If you didn't ask for this, you can ignore this email.</p></div>`,
  });
}
