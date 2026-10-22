import "server-only";

// Admin → Status → "Download settings backup": every setting the live site runs on, as a file Hostinger's
// Environment variables → Import .env accepts. Hostinger has wiped this list during a redeploy (2026-10-22), so the
// admin keeps a fresh copy somewhere safe and restores it in one import. Values only ever go to the admin's browser.

// Everything the site reads, in the order the import shows them. Values that aren't set are left out.
export const SETTINGS = [
  "DATABASE_URL", "AUTH_URL", "AUTH_SECRET", "ADMIN_EMAILS", "SIGNUP_MODE", "ALLOWED_EMAILS",
  "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "AUTH_DISCORD_ID", "AUTH_DISCORD_SECRET",
  "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM",
  "ALERT_SMTP_HOST", "ALERT_SMTP_PORT", "ALERT_SMTP_USER", "ALERT_SMTP_PASS",
  "EMAIL_DAILY_LIMIT", "EMAIL_DEALS_PER_DAY", "SMS_DEALS_PER_DAY", "RECAPS_PER_RUN",
  "PPT_API_KEY", "ANTHROPIC_API_KEY", "DISCORD_BOT_TOKEN",
  "EBAY_CAMPAIGN_ID", "EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "EBAY_RUNAME", "EBAY_DELETION_TOKEN",
  "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
  "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM",
  "CRON_SECRET",
];

// The ones the site can't run properly without (shown on Admin → Status if missing).
export const ESSENTIAL = ["DATABASE_URL", "AUTH_URL", "AUTH_SECRET", "ADMIN_EMAILS", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET",
  "SMTP_HOST", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM", "PPT_API_KEY"];

const isSet = (k) => typeof process.env[k] === "string" && process.env[k] !== "";

/** Names only: which settings are set and which essential ones are missing. */
export function settingsSummary() {
  return { set: SETTINGS.filter(isSet), missingEssential: ESSENTIAL.filter((k) => !isSet(k)) };
}

// KEY=value, quoted only when the value needs it.
const line = (k, v) => (/^[\w.:/@,+=%~-]*$/.test(v) ? `${k}=${v}` : `${k}="${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`);

/** The .env file text (with a header saying what it is and how to restore it). */
export function settingsEnvFile(now = new Date()) {
  const keys = SETTINGS.filter(isSet);
  return [
    `# TCG Boogie website settings, downloaded ${now.toISOString()} (${keys.length} settings).`,
    "# Restore: Hostinger -> tcgboogie.com -> Environment variables -> Import .env -> pick this file -> save.",
    "# Contains passwords and keys: keep it in a password manager or other private place, never email or share it.",
    "",
    ...keys.map((k) => line(k, process.env[k])),
    "",
  ].join("\n");
}
