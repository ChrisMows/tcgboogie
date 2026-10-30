import { X_HANDLE } from "@/lib/social";
import { PLANS } from "@/lib/plans";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

// Unlisted video pages for sharing (tcgboogie.com/watch/film): nothing on the site links here and search engines are
// asked not to list them, but anyone with the link can watch, and the link shows a preview when shared. The videos
// live in public/videos (a 1080p copy of the product film; the 4K original stays with Chris). Visits show in
// Admin → Traffic. Old links forward to the current video (MOVED).
const SITE = (process.env.AUTH_URL || "https://tcgboogie.com").replace(/\/$/, "");
const VIDEOS = {
  film: { file: "tcgboogie-film", width: 1920, height: 1080 },
};
const MOVED = { intro: "film", "intro-wide": "film" }; // links shared before the product film
const TITLE = "Meet TCG Boogie";
const DESCRIPTION = "Pokémon card deals before the auction ends, your collection valued daily, and a pack opening every time you add a card. Free to start.";

export async function generateMetadata({ params }) {
  const slug = MOVED[(await params).slug] || (await params).slug;
  const v = VIDEOS[slug];
  if (!v) return { title: "Video not found", robots: { index: false } };
  const video = `${SITE}/videos/${v.file}.mp4`;
  const image = `${SITE}/videos/${v.file}.jpg`;
  return {
    title: TITLE,
    description: DESCRIPTION,
    robots: { index: false, follow: false },
    openGraph: {
      type: "video.other", title: TITLE, description: DESCRIPTION, url: `${SITE}/watch/${slug}`, siteName: "TCG Boogie",
      images: [{ url: image, width: v.width, height: v.height }],
      videos: [{ url: video, secureUrl: video, type: "video/mp4", width: v.width, height: v.height }],
    },
    twitter: { card: "summary_large_image", site: X_HANDLE, creator: X_HANDLE, title: TITLE, description: DESCRIPTION, images: [image] },
  };
}

export default async function Watch({ params }) {
  const slug = (await params).slug;
  if (MOVED[slug]) permanentRedirect(`/watch/${MOVED[slug]}`);
  const v = VIDEOS[slug];
  if (!v) notFound();
  const tall = v.height > v.width;
  return (
    <div className="wrap watch">
      <div className={`watch-frame ${tall ? "tall" : "wide"}`}>
        <video src={`/videos/${v.file}.mp4`} poster={`/videos/${v.file}.jpg`} controls playsInline preload="metadata"
          width={v.width} height={v.height} aria-label={TITLE} />
      </div>
      <div className="watch-copy">
        <div className="eyebrow">FOR POKÉMON CARD COLLECTORS</div>
        <h1>{TITLE}</h1>
        <p className="muted">{DESCRIPTION}</p>
        <div className="watch-actions">
          <Link href="/login?mode=signup" className="btn primary lg">Start free ↗</Link>
          <Link href="/" className="btn lg">See the site</Link>
        </div>
        <p className="hint">Free forever, no card needed. Premium is ${PLANS.premium.price}/month with 7 days free.</p>
      </div>
    </div>
  );
}
