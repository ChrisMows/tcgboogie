import Link from "next/link";
import { redirect } from "next/navigation";
import { KINDS, applyUnsubscribe, validUnsubscribe } from "@/lib/unsubscribe";

export const metadata = { title: "Unsubscribe", robots: { index: false } };

async function confirm(formData) {
  "use server";
  const u = formData.get("u"), k = formData.get("k"), t = formData.get("t");
  if (!validUnsubscribe(u, k, t)) redirect("/unsubscribe?bad=1");
  await applyUnsubscribe(u, k);
  redirect(`/unsubscribe?done=${k}`);
}

export default async function Unsubscribe({ searchParams }) {
  const { u, k, t, done, bad } = (await searchParams) || {};
  const box = (children) => <div className="auth-box">{children}</div>;
  if (done && KINDS[done]) {
    return box(<>
      <h1>You&apos;re unsubscribed</h1>
      <p className="muted">We won&apos;t send you {KINDS[done]} anymore. You can turn {done === "alerts" || done === "updates" ? "them" : "it"} back on any time in Settings.</p>
      <Link href="/app/account#alerts" className="btn">Open Settings</Link>
    </>);
  }
  if (bad || !validUnsubscribe(u, k, t)) {
    return box(<>
      <h1>This link didn&apos;t work</h1>
      <p className="muted">It may be incomplete. Sign in and turn emails off in Settings, or email support@tcgboogie.com and we&apos;ll do it for you.</p>
      <Link href="/app/account#alerts" className="btn">Open Settings</Link>
    </>);
  }
  return box(<>
    <h1>Unsubscribe from {KINDS[k]}?</h1>
    <p className="muted">
      {k === "recap" ? "You'll stop getting the collection recap email. Price and deal alerts aren't affected."
        : k === "updates" ? "You'll stop getting emails about new features and fixes. Your alerts and recap aren't affected."
          : "You'll stop getting deal and price alerts by email. Discord and text alerts, if you use them, keep working."}
    </p>
    <form action={confirm}>
      <input type="hidden" name="u" value={u} />
      <input type="hidden" name="k" value={k} />
      <input type="hidden" name="t" value={t} />
      <button className="btn primary">Unsubscribe</button>
    </form>
  </>);
}
