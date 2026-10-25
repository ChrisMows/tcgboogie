import Link from "next/link";
import { SuggestIdea } from "@/components/IdeaBox";

export const metadata = { title: "Page not found", robots: { index: false } };

// Any address that doesn't exist: the site's own look, with ways back in.
export default function NotFound() {
  return (
    <div className="wrap not-found">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/pack.webp" alt="" width={120} height={120} />
      <div className="eyebrow">404</div>
      <h1>This pack was empty.</h1>
      <p className="muted">The page you were looking for isn&apos;t here. It may have moved, or the link has a typo.</p>
      <div className="not-found-actions">
        <Link href="/" className="btn primary">Go to the homepage</Link>
        <Link href="/app/collection" className="btn">My collection</Link>
        <Link href="/faq" className="btn ghost">FAQ</Link>
      </div>
      <p className="small muted">Expected something here? <SuggestIdea source="notfound" label="Tell us what you were looking for" prompt="What were you looking for? We'll see if we can add it." /></p>
    </div>
  );
}
