import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { cookies } from "next/headers";
import { FLOW_COOKIE, validChallenge } from "@/lib/app-login";

export const metadata = { title: "Sign in to the app", robots: { index: false } };

// Signing in to the Android app from a browser that's already signed in: use this account, or sign out here and pick
// another. Only a tap on this page lets a signed-in browser hand its account to the app.
async function useThisAccount(challenge) {
  "use server";
  if (!validChallenge(challenge)) redirect("/login?error=unavailable");
  (await cookies()).set(FLOW_COOKIE, challenge, { httpOnly: true, secure: true, sameSite: "lax", path: "/app-login", maxAge: 900 });
  redirect(`/app-login/done?challenge=${encodeURIComponent(challenge)}`);
}

async function useAnotherAccount(provider, challenge) {
  "use server";
  await signOut({ redirectTo: `/app-login/start?${new URLSearchParams({ provider, challenge })}` });
}

export default async function ConfirmAppLogin({ searchParams }) {
  const sp = await searchParams;
  const provider = typeof sp?.provider === "string" ? sp.provider : "";
  const challenge = typeof sp?.challenge === "string" ? sp.challenge : "";
  if (!validChallenge(challenge)) redirect("/login?error=unavailable");
  const session = await auth();
  if (!session?.user?.id) redirect(`/app-login/start?${new URLSearchParams({ provider, challenge })}`);
  return (
    <div className="wrap">
      <div className="auth-box">
        <h1>Sign in to the app</h1>
        <p className="muted" style={{ marginTop: 0 }}>This browser is signed in as <b>{session.user.email}</b>. Which account should the TCG Boogie app use?</p>
        <div style={{ display: "grid", gap: 10 }}>
          <form action={useThisAccount.bind(null, challenge)}><button className="btn primary block">Continue as {session.user.email}</button></form>
          <form action={useAnotherAccount.bind(null, provider, challenge)}><button className="btn block">Use a different account</button></form>
        </div>
        <p className="hint">Didn&apos;t start this from the TCG Boogie app? Close this page.</p>
      </div>
    </div>
  );
}
