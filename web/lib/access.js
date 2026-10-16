// Who may use the site, from server settings (Hostinger environment variables), never from the code.
//   ADMIN_EMAILS   comma-separated: full Premium access plus admin tools
//   SIGNUP_MODE    "invite" (default) or "open"
//   ALLOWED_EMAILS comma-separated: who may create an account while sign-up is invite-only

const list = (v) => String(v || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

export const isAdminEmail = (email) => Boolean(email) && list(process.env.ADMIN_EMAILS).includes(String(email).toLowerCase());

export const signupOpen = () => String(process.env.SIGNUP_MODE || "invite").toLowerCase() === "open";

/** May this email create a new account right now? (Existing members can always sign in.) */
export function mayJoin(email) {
  if (signupOpen()) return true;
  const e = String(email || "").toLowerCase();
  return isAdminEmail(e) || list(process.env.ALLOWED_EMAILS).includes(e);
}
