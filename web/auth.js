import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { mayJoin } from "@/lib/access";
import { readLinkIntent } from "@/lib/link-intent";
import { db, schema } from "@/lib/db";
import { log } from "@/lib/log";
import { emailConfigured, sendLoginEmail } from "@/lib/mail";

// Accounts switch on once the database and a secret are configured (see .env.example).
export const authEnabled = Boolean(db && process.env.AUTH_SECRET);

const providers = [];
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) providers.push(Google);
// Discord now returns an "iss" (issuer) value on sign-in (RFC 9207); tell Auth.js what to expect, or every login fails.
if (process.env.AUTH_DISCORD_ID && process.env.AUTH_DISCORD_SECRET) providers.push(Discord({ issuer: "https://discord.com" }));
if (emailConfigured()) {
  // Passwordless email: we send a one-time sign-in link through our own mailbox.
  providers.push({
    id: "email",
    type: "email",
    name: "Email",
    maxAge: 24 * 60 * 60,
    options: {},
    async sendVerificationRequest({ identifier, url }) {
      await sendLoginEmail(identifier, url);
    },
  });
}
/** A provider's profile picture URL from its sign-in profile, or null. */
function providerImage(provider, profile) {
  if (!profile) return null;
  if (provider === "google") return typeof profile.picture === "string" ? profile.picture : null;
  if (provider === "discord" && /^\d+$/.test(String(profile.id || ""))) {
    if (profile.avatar && /^(a_)?[a-f0-9]+$/.test(profile.avatar)) {
      return `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${profile.avatar.startsWith("a_") ? "gif" : "png"}?size=128`;
    }
    return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(profile.id) >> 22n) % 6n)}.png`;
  }
  return null;
}

async function saveProviderImage(userId, provider, profile) {
  const url = providerImage(provider, profile);
  if (!db || !userId || !url) return;
  const col = provider === "google" ? { googleImage: url } : provider === "discord" ? { discordImage: url } : null;
  if (col) await db.update(schema.users).set(col).where(eq(schema.users.id, userId)).catch(() => {});
}

export const enabledProviders =providers.map((p) => (typeof p === "function" ? p({}).id : p.id));

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: db
    ? DrizzleAdapter(db, {
        usersTable: schema.users,
        accountsTable: schema.accounts,
        sessionsTable: schema.sessions,
        verificationTokensTable: schema.verificationTokens,
      })
    : undefined,
  providers,
  session: { strategy: db ? "database" : "jwt", maxAge: 30 * 24 * 60 * 60 },
  trustHost: true,
  pages: { signIn: "/login", verifyRequest: "/login/check-email", error: "/login" },
  events: {
    // Keep each provider's profile picture, so members can choose which one we show.
    async signIn({ user, account, profile, isNewUser }) {
      await saveProviderImage(user?.id, account?.provider, profile);
      await log("signin", "info", `${isNewUser ? "New member joined" : "Signed in"} with ${account?.provider || "email"}: ${user?.email || "?"}`, null, user?.id);
    },
    async linkAccount({ user, account, profile }) {
      await saveProviderImage(user?.id, account?.provider, profile);
      await log("signin", "info", `Connected ${account?.provider}: ${user?.email || "?"}`, null, user?.id);
    },
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      // A signed-in member connecting another sign-in method (e.g. Discord from the Account page): always allowed;
      // Auth.js links it to their existing account.
      if (await readLinkIntent()) return true;
      try {
        if ((await auth())?.user?.id) return true;
      } catch { /* no session readable here; fall through to the normal checks */ }
      // The provider must have verified the address, or anyone could claim someone else's email.
      const email = String(user?.email || profile?.email || "").toLowerCase();
      if ((account?.provider === "google" && profile?.email_verified !== true) || (account?.provider === "discord" && profile?.verified !== true)) {
        await log("signin", "warn", `Sign-in refused: ${account.provider} email not verified (${email || "no email"})`);
        return "/login?error=unverified";
      }
      if (!email) {
        await log("signin", "warn", `Sign-in refused: ${account?.provider} gave no email`);
        return "/login?error=noemail";
      }
      if (mayJoin(email)) return true;
      // While sign-up is invite-only, people who already have an account can still sign in.
      const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
      if (!existing) await log("signin", "warn", `Sign-up blocked (invite-only): ${email}`);
      return existing ? true : "/login?error=invite";
    },
    session({ session, user }) {
      if (user) {
        session.user.id = user.id;
        session.user.tier = user.tier || "free";
      }
      return session;
    },
  },
});
