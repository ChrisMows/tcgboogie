import Link from "next/link";
import "./globals.css";

export const metadata = {
  metadataBase: new URL("https://tcgboogie.com"),
  title: "TCG Boogie | Underpriced card deals, found for you",
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

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <div className="wrap">
            <Link href="/" className="brand">
              TCG <span>Boogie</span>
            </Link>
            <span className="pill">Launching soon</span>
          </div>
        </header>
        <main>{children}</main>
        <footer>
          <div className="wrap">
            <span>
              © {new Date().getFullYear()} TCG Boogie. Not affiliated with eBay, TCGplayer, Nintendo, or The Pokémon
              Company.
            </span>
            <nav>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
