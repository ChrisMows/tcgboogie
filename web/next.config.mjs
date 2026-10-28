// Content-Security-Policy: only run code from this site (and X's ad pixel, app/layout.js), load images over https, never be framed.
// (Next.js needs inline scripts for its page data; the dev server also needs eval, so the policy is production-only.)
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://static.ads-twitter.com",
  "style-src 'self' 'unsafe-inline'",
  // Any https image: card pictures come from TCGplayer, eBay, TCGdex, Discord, Google and links admins paste in.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://static.ads-twitter.com https://analytics.twitter.com https://*.twitter.com https://*.x.com https://t.co",
  "frame-ancestors 'none'",
  "form-action 'self' https://accounts.google.com https://discord.com https://checkout.stripe.com https://billing.stripe.com",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Each build gets its own ID, so a page left open across a deploy is reloaded quietly instead of erroring when it
  // talks to the new server (the ID is baked into the build, including the standalone server Hostinger runs).
  deploymentId: process.env.NEXT_DEPLOYMENT_ID || `b${Date.now().toString(36)}`,
  poweredByHeader: false,
  // "Sell on eBay" sends card photos with the form (up to 6 photos, resized in the browser first).
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
  // Old member pages, merged into Deals and Account (query strings such as ?pokemon= are kept).
  async redirects() {
    return [
      // One address for the site: www.tcgboogie.com goes to tcgboogie.com (keeps search ranking in one place).
      { source: "/:path*", has: [{ type: "host", value: "www.tcgboogie.com" }], destination: "https://tcgboogie.com/:path*", permanent: true },
      { source: "/pricing", destination: "/#pricing", permanent: false },
      { source: "/app/filters", destination: "/app/deals", permanent: false },
      { source: "/app/feed", destination: "/app/deals", permanent: false },
      { source: "/app/alerts", destination: "/app/deals?tab=history", permanent: false },
      { source: "/app/billing", destination: "/app/account#plan", permanent: false },
    ];
  },
  async headers() {
    // Security headers on every page.
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          ...(process.env.NODE_ENV === "production" ? [{ key: "Content-Security-Policy", value: CSP }] : []),
        ],
      },
    ];
  },
};

export default nextConfig;
