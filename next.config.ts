import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // 'unsafe-inline' in script/style: Next.js ships inline bootstrap scripts and
  // framer-motion/toaster write inline styles; mc.yandex.ru hosts the Metrica
  // counter (script/pixel/XHR/frames); va.vercel-scripts.com serves the Vercel
  // Analytics client (its ingest endpoint /_vercel/insights/* is same-origin,
  // covered by connect-src 'self'); everything else is locked to self
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://mc.yandex.ru https://va.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline' https://mc.yandex.ru",
      "img-src 'self' data: blob: https://mc.yandex.ru",
      "font-src 'self' data:",
      "connect-src 'self' https://mc.yandex.ru",
      "frame-src https://mc.yandex.ru",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

// public/ assets are served with max-age=0 by default: every hero-video loop
// or trophy hit revalidates at the origin (Fast Origin Transfer). Grade art
// and media never change - immutable; OG/favicon get a day so re-branding
// propagates without renaming files.
const CACHE_IMMUTABLE = "public, max-age=31536000, immutable";
const CACHE_DAY = "public, max-age=86400, stale-while-revalidate=604800";
const cacheHeaders = (value: string) => [{ key: "Cache-Control", value }];
const immutableFiles = [
  "/A.png",
  "/Aplus.png",
  "/B.png",
  "/C.png",
  "/D.png",
  "/E.png",
  "/ico.png",
  "/apple.png",
  "/apple-touch-icon.png",
  "/logo.svg",
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // ship the PDF fonts with the api/report serverless bundle
  outputFileTracingIncludes: {
    "/api/report": ["./assets/fonts/**"],
    // @sparticuz/chromium resolves its binary via __dirname and playwright-core
    // loads browsers.json at runtime - output tracing cannot see either, so
    // include both explicitly for the scanner. Only /api/scan owns the engine:
    // the ticks submit their targets over HTTP so deployments do not ship
    // three copies of the ~80 MB bundle (Vercel Functions Storage quota)
    "/api/scan": ["./node_modules/@sparticuz/chromium/**", "./node_modules/playwright-core/**"],
  },
  // practice what we scan: AppMOT itself serves the protective headers
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/video/:path*", headers: cacheHeaders(CACHE_IMMUTABLE) },
      { source: "/img/:path*", headers: cacheHeaders(CACHE_IMMUTABLE) },
      ...immutableFiles.map((file) => ({
        source: file,
        headers: cacheHeaders(CACHE_IMMUTABLE),
      })),
      { source: "/OG.png", headers: cacheHeaders(CACHE_DAY) },
      { source: "/favicon.ico", headers: cacheHeaders(CACHE_DAY) },
    ];
  },
  // legacy shared report links (?report=<id> with optional ?key=) move to the
  // ISR report route; the edge redirect keeps old links working without
  // touching the function origin (Fast Origin Transfer quota)
  async redirects() {
    return [
      {
        source: "/",
        has: [{ type: "query", key: "report" }],
        destination: "/report/:report",
        permanent: false,
      },
    ];
  },
  reactStrictMode: false,
};

export default nextConfig;
