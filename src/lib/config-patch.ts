/**
 * Hosting-specific header-config generator (the "copy-paste fix" tab).
 * The engine detects the platform from the response (builder markers, Server
 * header, CDN fingerprints) and the report offers the exact file to patch for
 * THAT hosting: vercel.json, next.config.ts, Cloudflare/Netlify _headers or
 * nginx. Header values mirror the ones AppSeal runs in production itself -
 * proven to score 96+ on the same grader.
 */

import type { ScanResult } from "./scanner/types.ts";

export type HostingId = "vercel" | "next" | "cloudflare" | "netlify" | "nginx" | "generic";

export interface HostingPatch {
  id: HostingId;
  label: string;
  /** the file the user has to edit */
  file: string;
  code: string;
  note: { ru: string; en: string };
}

/** Protective headers proven on appseal.online (grade A+). */
export const RECOMMENDED_HEADERS: { key: string; value: string }[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Content-Security-Policy",
    value:
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; " +
      "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; " +
      "upgrade-insecure-requests",
  },
];

/** Infer the hosting platform from what the scan already knows. */
export function detectHosting(scan: ScanResult): HostingId {
  const host = scan.host.toLowerCase();
  const platform = (scan.platform ?? "").toLowerCase();
  const passport = (scan.techPassport?.cdnWaf ?? "").toLowerCase();
  const stack = (scan.techPassport?.stack ?? "").toLowerCase();

  if (host.endsWith(".vercel.app") || platform.includes("vercel") || passport.includes("vercel")) {
    return "vercel";
  }
  if (host.endsWith(".netlify.app") || passport.includes("netlify")) {
    return "netlify";
  }
  if (
    host.endsWith(".pages.dev") ||
    host.endsWith(".workers.dev") ||
    passport.includes("cloudflare") ||
    passport.includes("cf-ray")
  ) {
    return "cloudflare";
  }
  if (stack.includes("next")) {
    return "next";
  }
  if (passport.includes("nginx")) {
    return "nginx";
  }
  return "generic";
}

const CSP_NOTE_RU =
  "CSP ниже консервативный: со 'unsafe-inline' для script/style. Если сайт не использует inline-скрипты - уберите 'unsafe-inline', это +3 балла.";

function headerLines(indent: string): string {
  return RECOMMENDED_HEADERS.map((h) => `${indent}${h.key}: ${h.value}`).join("\n");
}

function nginxBlock(): string {
  const lines = RECOMMENDED_HEADERS.filter(
    (h) => h.key !== "Strict-Transport-Security",
  ).map((h) => `    add_header ${h.key} "${h.value}" always;`);
  return [
    "# /etc/nginx/sites-available/your-site (внутри server { ... })",
    ...lines,
    "",
    "# HSTS включается только на HTTPS-домене:",
    '    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;',
  ].join("\n");
}

export function buildHostingPatch(scan: ScanResult): HostingPatch {
  const id = detectHosting(scan);
  switch (id) {
    case "vercel":
      return {
        id,
        label: "Vercel",
        file: "vercel.json",
        note: { ru: CSP_NOTE_RU, en: "The CSP below is conservative ('unsafe-inline' kept for script/style). Drop it if you ship no inline scripts." },
        code: JSON.stringify(
          {
            headers: [
              { source: "/(.*)", headers: RECOMMENDED_HEADERS.map((h) => ({ key: h.key, value: h.value })) },
            ],
          },
          null,
          2,
        ),
      };
    case "next":
      return {
        id,
        label: "Next.js (next.config.ts)",
        file: "next.config.ts",
        note: { ru: CSP_NOTE_RU, en: "The CSP below is conservative ('unsafe-inline' kept for script/style). Drop it if you ship no inline scripts." },
        code: [
          "import type { NextConfig } from 'next';",
          "",
          "const securityHeaders = [",
          headerLines("  "),
          "];",
          "",
          "const nextConfig: NextConfig = {",
          "  async headers() {",
          "    return [{ source: '/:path*', headers: securityHeaders }];",
          "  },",
          "};",
          "",
          "export default nextConfig;",
        ].join("\n"),
      };
    case "netlify":
    case "cloudflare":
      return {
        id,
        label: id === "netlify" ? "Netlify" : "Cloudflare Pages",
        file: "_headers",
        note: { ru: "Файл кладётся в корень публикуемой папки (для Cloudflare Pages - в корень output-директории).", en: "Put the file into the root of the published folder (for Cloudflare Pages - the output directory)." },
        code: [
          "/*",
          headerLines("  "),
        ].join("\n"),
      };
    case "nginx":
      return {
        id,
        label: "nginx",
        file: "nginx.conf",
        note: { ru: "add_header на уровне server действует на все location; 'always' - чтобы заголовки ставились и на 4xx/5xx.", en: "add_header at the server level applies to every location; 'always' makes 4xx/5xx responses carry headers too." },
        code: nginxBlock(),
      };
    default:
      return {
        id,
        label: "Универсальный (nginx-стиль)",
        file: "nginx.conf",
        note: { ru: "Хостинг не опознан по ответу сервера - ниже базовый блок для nginx/Apache-подобных панелей. Формат _headers подходит Cloudflare Pages/Netlify.", en: "Hosting not recognized from the response - a basic nginx-style block below; the _headers format fits Cloudflare Pages/Netlify." },
        code: nginxBlock(),
      };
  }
}
