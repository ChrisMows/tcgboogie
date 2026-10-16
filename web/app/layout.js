import Link from "next/link";
import "./globals.css";
import { demoMode, getCurrentUser } from "@/lib/session";
import { setDemoTier } from "@/app/app/actions";

export const metadata = {
  metadataBase: new URL("https://tcgboogie.com"),
  title: { default: "TCG Boogie | Underpriced card deals, found for you", template: "%s | TCG Boogie" },
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

export default async function RootLayout({ children }) {
  const user = await getCurrentUser();
  return (
    <html lang="en">
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
            <Link href="/" className="brand">
              TCG <span>Boogie</span>
            </Link>
            <nav className="main" aria-label="Main">
              <Link href="/how-it-works">How it works</Link>
              <Link href="/pricing">Pricing</Link>
              <Link href="/faq">FAQ</Link>
            </nav>
            <div className="header-actions">
              {user ? (
                <Link href="/app" className="btn primary sm">Dashboard</Link>
              ) : (
                <>
                  <Link href="/login" className="btn ghost sm">Log in</Link>
                  <Link href="/login?mode=signup" className="btn primary sm">Get started free</Link>
                </>
              )}
            </div>
          </div>
        </header>
        <main>{children}</main>
        <footer>
          <div className="wrap">
            <span>
              © {new Date().getFullYear()} TCG Boogie. Not affiliated with eBay, TCGplayer, Nintendo, or The Pokémon
              Company.
            </span>
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
