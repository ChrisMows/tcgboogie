import Link from "next/link";
import { DM_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { demoMode, getCurrentUser } from "@/lib/session";
import { setDemoTier } from "@/app/app/actions";

const body = DM_Sans({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const head = Space_Grotesk({ subsets: ["latin"], variable: "--font-head", display: "swap" });

export const metadata = {
  metadataBase: new URL("https://tcgboogie.com"),
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
    <Link href="/" className="brand">
      <span className="mark" aria-hidden="true" />TCG <em>boogie</em>
    </Link>
  );
}

export default async function RootLayout({ children }) {
  const user = await getCurrentUser();
  return (
    <html lang="en" className={`${body.variable} ${head.variable}`}>
      <body>
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
        <header className="top">
          <div className="wrap">
            <Brand />
            <nav className="main" aria-label="Main">
              <Link href="/#deals">Explore deals</Link>
              <Link href="/how-it-works">How it works</Link>
              <Link href="/pricing">Pricing</Link>
              <Link href="/faq">FAQ</Link>
            </nav>
            <div className="header-actions">
              {user ? (
                <Link href="/app" className="btn primary">Dashboard ↗</Link>
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
                Company, or any game publisher. Values are estimates; auction prices can change.
              </p>
            </div>
            <nav aria-label="Footer">
              <Link href="/how-it-works">How it works</Link>
              <Link href="/pricing">Pricing</Link>
              <Link href="/faq">FAQ</Link>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
