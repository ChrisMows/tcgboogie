// Content-Security-Policy: only run code from this site, only load images from the services we use, never be framed.
// (Next.js needs inline scripts for its page data; the dev server also needs eval, so the policy is production-only.)
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tcgplayer-cdn.tcgplayer.com https://*.tcgplayer.com https://cdn.discordapp.com https://*.googleusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self' https://accounts.google.com https://discord.com https://checkout.stripe.com https://billing.stripe.com",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Old member pages, merged into Deals and Account (query strings such as ?pokemon= are kept).
  async redirects() {
    return [
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
