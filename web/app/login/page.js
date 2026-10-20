import Link from "next/link";
import { redirect } from "next/navigation";
import { authEnabled, enabledProviders } from "@/auth";
import { demoMode, getCurrentUser, safeNext } from "@/lib/session";
import { signInWith, signInWithEmail } from "./actions";

export async function generateMetadata({ searchParams }) {
  return { title: (await searchParams)?.mode === "signup" ? "Create your account" : "Log in" };
}

const ERRORS = {
  email: "Enter a valid email address.",
  unavailable: "That sign-in option isn't available yet.",
  OAuthAccountNotLinked: "That email is already used with a different sign-in method. Sign in with that one first, then connect this one from your account page.",
  Verification: "That sign-in link has expired or was already used. Request a new one.",
  invite: "TCG Boogie is invite-only while we finish testing. Join our Discord to get on the list.",
  AccessDenied: "TCG Boogie is invite-only while we finish testing. Join our Discord to get on the list.",
  unverified: "That account's email address isn't verified yet. Verify it with Google or Discord, then try again.",
  noemail: "We couldn't get an email address from that sign-in. Try another option.",
};

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
);
const DiscordIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#8b9cff" d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.7.1 18.2a19.9 19.9 0 0 0 6 3l1.3-2.1c-.7-.3-1.4-.6-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.8 19.8 0 0 0 6-3c.5-5.2-.8-9.7-3.6-13.8zM8 15.4c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.6 8 10.6s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4z"/></svg>
);

export default async function Login({ searchParams }) {
  const params = await searchParams;
  // Signed in already: a failed "Connect Discord" lands here with an error, so show it on the Account page.
  const next = safeNext(params?.next);
  if (await getCurrentUser()) redirect(params?.error ? `/app/account?link=failed&reason=${encodeURIComponent(params.error)}` : next);
  const signup = params?.mode === "signup";
  const open = demoMode || authEnabled;
  const has = (p) => demoMode || enabledProviders.includes(p);

  return (
    <div className="wrap">
      <div className="auth-box">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="logo-full" src="/brand/logo.webp" alt="TCG Boogie" width={900} height={569} style={{ width: 220 }} />
        <h1>{signup ? "Create your free account" : "Welcome back"}</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          {signup ? "Start free. Upgrade to Premium anytime." : "Sign in to your TCG Boogie account."}
        </p>
        {params?.error && <div className="notice bad">{ERRORS[params.error] || "Sign-in didn't work. Please try again."}</div>}
        {!open ? (
          <div className="notice warn">
            Accounts open soon. Follow along in our Discord, or check back shortly.
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gap: 10 }}>
              {has("google") && (
                <form action={signInWith.bind(null, "google", next)}>
                  <button className="btn block"><GoogleIcon /> Continue with Google</button>
                </form>
              )}
              {has("discord") && (
                <form action={signInWith.bind(null, "discord", next)}>
                  <button className="btn block"><DiscordIcon /> Continue with Discord</button>
                </form>
              )}
            </div>
            {has("email") && (
              <>
                <div className="divider">or use your email</div>
                <form action={signInWithEmail}>
                  <input type="hidden" name="next" value={next} />
                  <label className="field" htmlFor="email">Email address</label>
                  <input id="email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
                  <button className="btn primary block" style={{ marginTop: 12 }}>Email me a sign-in link</button>
                  <p className="hint">No password needed. We'll send a link that signs you in.</p>
                </form>
              </>
            )}
          </>
        )}
        <p className="small muted" style={{ marginTop: 20 }}>
          {signup ? (
            <>Already have an account? <Link href="/login">Log in</Link></>
          ) : (
            <>New here? <Link href="/login?mode=signup">Create a free account</Link></>
          )}
        </p>
        <p className="hint">
          By continuing you agree to our <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy policy</Link>.
        </p>
      </div>
    </div>
  );
}
