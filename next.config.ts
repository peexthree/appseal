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
  // counter (script/pixel/XHR/frames); everything else is locked to self
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://mc.yandex.ru",
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

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // ship the PDF fonts with the api/report serverless bundle
  outputFileTracingIncludes: {
    "/api/report": ["./assets/fonts/**"],
    // @sparticuz/chromium resolves its binary via __dirname and playwright-core
    // loads browsers.json at runtime - output tracing cannot see either, so
    // include both explicitly for the scanner
    "/api/scan": ["./node_modules/@sparticuz/chromium/**", "./node_modules/playwright-core/**"],
    // the auto-tick runs the same scanner engine and needs the same packages
    "/api/pipeline-tick": ["./node_modules/@sparticuz/chromium/**", "./node_modules/playwright-core/**"],
  },
  // practice what we scan: AppMOT itself serves the protective headers
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
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
