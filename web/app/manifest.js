// Makes the site installable: "Add to Home Screen" / "Install app" opens it full-screen like an app, at
// tcgboogie.com (members go straight on to their collection, signed-out visitors see the homepage). Icons are the pack logo on the site's dark
// background (public/icons; the maskable one has room for Android's round crops). See components/InstallApp.js.
export default function manifest() {
  return {
    name: "TCG Boogie",
    short_name: "TCG Boogie",
    description: "Pokémon card deals before the auction ends, price alerts, and your collection valued daily.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0e12",
    theme_color: "#0b0e12",
    categories: ["shopping", "lifestyle", "entertainment"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Deals", url: "/app/deals", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Photo appraiser", url: "/app/collection/photo", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Price alerts", url: "/app/watches", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
