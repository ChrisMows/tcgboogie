/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Old member pages, merged into Deals and Account (query strings such as ?pokemon= are kept).
  async redirects() {
    return [
      { source: "/app/filters", destination: "/app/deals", permanent: false },
      { source: "/app/feed", destination: "/app/deals", permanent: false },
      { source: "/app/alerts", destination: "/app/deals?tab=history", permanent: false },
      { source: "/app/billing", destination: "/app/account#plan", permanent: false },
    ];
  },
  async headers() {
    // Basic security headers on every page.
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
