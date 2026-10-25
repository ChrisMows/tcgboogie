import { Suspense } from "react";
import MobileMenu from "@/components/MobileMenu";
import NavProgress from "@/components/NavProgress";
import HelperChat from "@/components/HelperChat";
import InstallApp from "@/components/InstallApp";
import IdeaBox, { SuggestIdea } from "@/components/IdeaBox";
import TourRunner from "@/components/TourRunner";
import PageViews from "@/components/PageViews";
import Link from "next/link";
import { DM_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { demoMode, getCurrentUser } from "@/lib/session";
import { logOut, setAdminView, setDemoTier } from "@/app/app/actions";
import UserMenu from "@/components/UserMenu";
import { avatarFor, initials } from "@/lib/avatar";

const body = DM_Sans({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const head = Space_Grotesk({ subsets: ["latin"], variable: "--font-head", display: "swap" });

// Installed on a home screen (app/manifest.js): the dark theme around the app, and full screen on iPhone.
export const viewport = { themeColor: "#0b0e12", colorScheme: "dark" };

export const metadata = {
  metadataBase: new URL("https://tcgboogie.com"),
  appleWebApp: { capable: true, title: "TCG Boogie", statusBarStyle: "black-translucent" },
  title: { default: "TCG Boogie | Your next grail, at your kind of price", template: "%s | TCG Boogie" },
  description:
    "TCG Boogie watches eBay for graded and raw trading cards selling below their market value and alerts you before the auction ends.",
  openGraph: {
    title: "TCG Boogie",
    description: "Underpriced graded and raw card deals, found before the auction ends.",
    url: "https://tcgboogie.com",
    siteName: "TCG Boogie",
    type: "website",
  },
};

function Brand() {
  return (
    <Link href="/" className="brand" aria-label="TCG Boogie home">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="brand-card" src="/brand/card.webp" alt="" width={144} height={160} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="brand-word" src="/brand/wordmark.webp" alt="TCG Boogie" width={605} height={90} />
    </Link>
  );
}

export default async function RootLayout({ children }) {
  const user = await getCurrentUser();
  const navLinks = [
    { href: user ? "/app/collection" : "/login?next=%2Fapp%2Fcollection", label: "Collection" },
    { href: user ? "/app/deals" : "/#deals", label: "Deals" },
    { href: user ? "/app/watches" : "/login?next=%2Fapp%2Fwatches", label: "Price alerts" },
    { href: user ? "/app/collection/photo" : "/login?next=%2Fapp%2Fcollection%2Fphoto", label: "Photo appraiser" },
    { href: "/#pricing", label: "Pricing" },
    { href: "/faq", label: "FAQ" },
  ];
  return (
    <html lang="en" className={`${body.variable} ${head.variable}`}>
      <head>
        {/* Before the page draws: keep collection values hidden if the member chose that (no flash of the total). */}
        <script dangerouslySetInnerHTML={{ __html: "try{if(localStorage.getItem('tcgb-hide-values')==='1')document.documentElement.classList.add('hide-values')}catch(e){}" }} />
      </head>
      <body>
        <Suspense fallback={null}><NavProgress /></Suspense>
        <Suspense fallback={null}><PageViews signedIn={Boolean(user)} /></Suspense>
        <HelperChat signedIn={Boolean(user)} />
        <IdeaBox />
        <InstallApp signedIn={Boolean(user)} />
        <Suspense fallback={null}><TourRunner signedIn={Boolean(user)} /></Suspense>
        {demoMode && (
          <div className="demo-bar">
            <div className="wrap">
              <b>Demo mode</b>
              <span className="muted">Sample data, nothing is saved permanently. Preview as:</span>
              <form action={setDemoTier.bind(null, "free")}>
                <button className={`btn sm ${user?.tier === "free" ? "primary" : ""}`}>Free</button>
              </form>
              <form action={setDemoTier.bind(null, "premium")}>
                <button className={`btn sm ${user?.tier === "premium" ? "primary" : ""}`}>Premium</button>
              </form>
            </div>
          </div>
        )}
        {user?.isAdmin && !user.demo && (
          <div className="demo-bar">
            <div className="wrap">
              <b>Admin</b>
              <span className="muted">Preview the site as:</span>
              <form action={setAdminView.bind(null, "free")}>
                <button className={`btn sm ${user.tier === "free" ? "primary" : ""}`}>Free member</button>
              </form>
              <form action={setAdminView.bind(null, "premium")}>
                <button className={`btn sm ${user.tier === "premium" ? "primary" : ""}`}>Premium member</button>
              </form>
            </div>
          </div>
        )}
        <header className="top">
          <div className="wrap">
            <Brand />
            <nav className="main" aria-label="Main">
              {/* Five links. Signed-out visitors: Collection and Price alerts go to sign in, then straight to that page;
                  Deals shows the deals we've caught on the homepage. How it works is in the footer. */}
              {navLinks.map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}
            </nav>
            <div className="header-actions">
              <MobileMenu links={navLinks} signedIn={Boolean(user)} />
              {user && (
                <SuggestIdea source="header" className="idea-btn" title="Suggest an idea"
                  label={<><span aria-hidden="true">💡</span><span className="idea-btn-text">Suggest an idea</span></>} />
              )}
              {user ? (
                <UserMenu name={user.name} email={user.email} avatarUrl={avatarFor(user).url} initials={initials(user)}
                  planLabel={user.plan.label} isAdmin={Boolean(user.isAdmin)} onLogOut={logOut} />
              ) : (
                <>
                  <Link href="/login" className="login-link">Log in</Link>
                  <Link href="/login?mode=signup" className="btn primary">Get started free ↗</Link>
                </>
              )}
            </div>
          </div>
        </header>
        <main>{children}</main>
        <footer>
          <div className="wrap">
            <div>
              <Brand />
              <p>
                © {new Date().getFullYear()} TCG Boogie. Not affiliated with eBay, TCGplayer, Nintendo, The Pokémon
                Company, or any game publisher. Prices, values and deals are automated estimates and can be wrong.
                Check every listing yourself before you buy; purchases are your own decision and at your own risk.
                See our <Link href="/terms#prices">Terms</Link>.
              </p>
            </div>
            <nav aria-label="Footer">
              <Link href="/how-it-works">How it works</Link>
              <Link href="/#pricing">Pricing</Link>
              <Link href="/faq">FAQ</Link>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
              <SuggestIdea source="footer" label="Suggest an idea" className="link-btn footer-idea" />
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
