import Link from "next/link";
import { notFound } from "next/navigation";

// Unlisted video pages for sharing (tcgboogie.com/watch/intro): nothing on the site links here and search engines are
// asked not to list them, but anyone with the link can watch, and the link shows a preview when shared. The videos
// live in public/videos and are made by marketing-video/ (record.mjs, make-video.mjs). Visits show in Admin → Traffic.
const SITE = (process.env.AUTH_URL || "https://tcgboogie.com").replace(/\/$/, "");
const VIDEOS = {
  intro: { file: "tcgboogie-intro-vertical", width: 1080, height: 1920, label: "Phone" },
  "intro-wide": { file: "tcgboogie-intro-wide", width: 1920, height: 1080, label: "Widescreen" },
};
const TITLE = "Meet TCG Boogie";
const DESCRIPTION = "Pokémon card deals before the auction ends, your collection valued daily, and a pack opening every time you add a card. Free to start.";

export async function generateMetadata({ params }) {
  const v = VIDEOS[(await params).slug];
  if (!v) return { title: "Video not found", robots: { index: false } };
  const video = `${SITE}/videos/${v.file}.mp4`;
  const image = `${SITE}/videos/${v.file}.jpg`;
  return {
    title: TITLE,
    description: DESCRIPTION,
    robots: { index: false, follow: false },
    openGraph: {
      type: "video.other", title: TITLE, description: DESCRIPTION, url: `${SITE}/watch/${(await params).slug}`, siteName: "TCG Boogie",
      images: [{ url: image, width: v.width, height: v.height }],
      videos: [{ url: video, secureUrl: video, type: "video/mp4", width: v.width, height: v.height }],
    },
    twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [image] },
  };
}

export default async function Watch({ params }) {
  const slug = (await params).slug;
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
          <Link href="/?home=1" className="btn lg">See the site</Link>
        </div>
        <p className="hint">Free forever, no card needed. Premium is $9.99/month with 7 days free.</p>
        <p className="small muted watch-other">
          {Object.entries(VIDEOS).filter(([k]) => k !== slug).map(([k, o]) => <Link key={k} href={`/watch/${k}`}>{o.label} version</Link>)}
        </p>
      </div>
    </div>
  );
}
