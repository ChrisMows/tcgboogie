import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { mayJoin } from "@/lib/access";
import { db, schema } from "@/lib/db";
import { emailConfigured, sendLoginEmail } from "@/lib/mail";

// Accounts switch on once the database and a secret are configured (see .env.example).
export const authEnabled = Boolean(db && process.env.AUTH_SECRET);

const providers = [];
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) providers.push(Google);
if (process.env.AUTH_DISCORD_ID && process.env.AUTH_DISCORD_SECRET) providers.push(Discord);
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
export const enabledProviders = providers.map((p) => (typeof p === "function" ? p({}).id : p.id));

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
  callbacks: {
    async signIn({ user, account, profile }) {
      // Google must have verified the address, or anyone could claim someone else's email.
      if (account?.provider === "google" && profile?.email_verified !== true) return "/login?error=unverified";
      const email = String(user?.email || profile?.email || "").toLowerCase();
      if (!email) return "/login?error=noemail";
      if (mayJoin(email)) return true;
      // While sign-up is invite-only, people who already have an account can still sign in.
      const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
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
