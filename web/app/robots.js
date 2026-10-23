// robots.txt: search engines may read the public pages, never the member area, sign-in or API routes.
const SITE = (process.env.AUTH_URL || "https://tcgboogie.com").replace(/\/$/, "");

export default function robots() {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app/", "/api/", "/login", "/unsubscribe"] }],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
