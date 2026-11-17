/**
 * Static content for the /fixes SEO guides: ready-to-paste security-header
 * configs per hosting, built from the same RECOMMENDED_HEADERS that AppSeal
 * runs in production (self-proven A+ on the same grader). One guide = one
 * long-tail landing ("как настроить заголовки безопасности на Vercel").
 * Bilingual: ru/en text fields ride side by side; code blocks are shared.
 */

import { RECOMMENDED_HEADERS } from "./config-patch.ts";

export interface FixGuide {
  slug: string;
  /** hosting name shown in the title */
  label: string;
  labelEn: string;
  /** the file the reader must create/edit */
  file: string;
  fileEn: string;
  /** one-line where-the-file-goes hint */
  place: string;
  placeEn: string;
  note: string;
  noteEn: string;
  code: string;
  /** long-tail page description (SEO) */
  description: string;
  descriptionEn: string;
}

function headerLines(indent: string): string {
  return RECOMMENDED_HEADERS.map((h) => `${indent}${h.key}: ${h.value}`).join("\n");
}

const CSP_NOTE =
  "CSP ниже консервативный: с 'unsafe-inline' для script/style - так работают почти все сборки " +
  "из конструкторов и AI-агентов. Если ваш сайт не использует inline-скрипты, уберите " +
  "'unsafe-inline' из script-src: это плюс 3 балла на техосмотре.";

const CSP_NOTE_EN =
  "The CSP below is conservative: it keeps 'unsafe-inline' for script/style, which is how almost " +
  "all builder- and AI-agent-built sites work. If your site does not use inline scripts, drop " +
  "'unsafe-inline' from script-src: that is +3 points on the checkup.";

function vercelCode(): string {
  return JSON.stringify(
    {
      headers: [
        { source: "/(.*)", headers: RECOMMENDED_HEADERS.map((h) => ({ key: h.key, value: h.value })) },
      ],
    },
    null,
    2,
  );
}

function nextCode(): string {
  return [
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
  ].join("\n");
}

function headersFileCode(): string {
  return ["/*", headerLines("  ")].join("\n");
}

function nginxCode(): string {
  const lines = RECOMMENDED_HEADERS.filter(
    (h) => h.key !== "Strict-Transport-Security",
  ).map((h) => `    add_header ${h.key} "${h.value}" always;`);
  return [
    "# /etc/nginx/sites-available/your-site (inside server { ... })",
    ...lines,
    "",
    "# HSTS belongs on an HTTPS-only domain:",
    '    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;',
  ].join("\n");
}

function ghPagesWorkflow(): string {
  return [
    "# .github/workflows/deploy.yml - the static file upload step already exists,",
    "# but GitHub Pages does not let you set headers, so either:",
    "# 1) move the site to Cloudflare Pages (the _headers format) or",
    "# 2) add headers via <meta http-equiv> tags - partially works.",
    "# The honest path for GitHub Pages is Cloudflare in front of Pages:",
    "  # (_headers format - see the Cloudflare Pages guide)",
  ].join("\n");
}

export const FIX_GUIDES: FixGuide[] = [
  {
    slug: "vercel",
    label: "Vercel",
    labelEn: "Vercel",
    file: "vercel.json",
    fileEn: "vercel.json",
    place: "в корень репозитория, рядом с package.json",
    placeEn: "into the repo root, next to package.json",
    note: CSP_NOTE,
    noteEn: CSP_NOTE_EN,
    code: vercelCode(),
    description:
      "Готовый vercel.json с защитными заголовками (CSP, HSTS, COOP, X-Frame-Options): скопируйте файл - и проект на Vercel пройдёт техосмотр AppSeal на класс выше.",
    descriptionEn:
      "A ready vercel.json with security headers (CSP, HSTS, COOP, X-Frame-Options): copy the file and your Vercel project moves up a grade on the AppSeal checkup.",
  },
  {
    slug: "nextjs",
    label: "Next.js (любой хостинг)",
    labelEn: "Next.js (any hosting)",
    file: "next.config.ts",
    fileEn: "next.config.ts",
    place: "в корень проекта вместо текущего next.config.ts / .mjs",
    placeEn: "into the project root, replacing the current next.config.ts / .mjs",
    note: CSP_NOTE,
    noteEn: CSP_NOTE_EN,
    code: nextCode(),
    description:
      "Как добавить Content-Security-Policy, HSTS, COOP и другие заголовки безопасности в Next.js через async headers() в next.config.ts - готовый код для копипаста.",
    descriptionEn:
      "How to add Content-Security-Policy, HSTS, COOP and other security headers in Next.js via async headers() in next.config.ts - ready-to-paste code.",
  },
  {
    slug: "cloudflare-pages",
    label: "Cloudflare Pages / Workers",
    labelEn: "Cloudflare Pages / Workers",
    file: "_headers",
    fileEn: "_headers",
    place: "в корень output-директории сборки",
    placeEn: "into the root of the build output directory",
    note: "Формат _headers читает Cloudflare Pages при деплое. Правила Transform Response на уровне зоны в дашборде Cloudflare работают поверх - но файл надёжнее: он в git.",
    noteEn: "Cloudflare Pages reads the _headers format on deploy. Zone-level Transform Response rules in the Cloudflare dashboard stack on top - but the file is more reliable: it lives in git.",
    code: headersFileCode(),
    description:
      "Файл _headers для Cloudflare Pages со всем набором защитных заголовков: CSP, HSTS, COOP, Permissions-Policy. Копипаст и деплой.",
    descriptionEn:
      "A _headers file for Cloudflare Pages with the full set of security headers: CSP, HSTS, COOP, Permissions-Policy. Copy, paste, deploy.",
  },
  {
    slug: "netlify",
    label: "Netlify",
    labelEn: "Netlify",
    file: "_headers",
    fileEn: "_headers",
    place: "в корень публикуемой папки (или netlify.toml при сборке)",
    placeEn: "into the root of the publish folder (or netlify.toml at build time)",
    note: CSP_NOTE,
    noteEn: CSP_NOTE_EN,
    code: headersFileCode(),
    description:
      "Заголовки безопасности для Netlify через файл _headers: защита от кликджекинга, XSS, перехвата сессий. Готовый конфиг для копипаста.",
    descriptionEn:
      "Security headers for Netlify via a _headers file: clickjacking, XSS and session-hijacking protection. Ready-to-paste config.",
  },
  {
    slug: "github-pages",
    label: "GitHub Pages",
    labelEn: "GitHub Pages",
    file: "- (платформа не даёт ставить заголовки)",
    fileEn: "- (the platform does not allow custom headers)",
    place: "-",
    placeEn: "-",
    note: "GitHub Pages не позволяет настраивать HTTP-заголовки вообще. Самый честный путь - поставить Cloudflare перед Pages (бесплатный тариф) и включить заголовки там, либо переехать на Cloudflare Pages.",
    noteEn: "GitHub Pages does not let you configure HTTP headers at all. The honest path is putting Cloudflare in front of Pages (free tier) and enabling headers there, or moving to Cloudflare Pages.",
    code: ghPagesWorkflow(),
    description:
      "Почему на GitHub Pages нельзя задать заголовки безопасности и что делать: Cloudflare перед Pages, _headers или переезд. Разбор с конфигом.",
    descriptionEn:
      "Why GitHub Pages cannot serve security headers and what to do instead: Cloudflare in front of Pages, a _headers file, or a move. Breakdown with config.",
  },
  {
    slug: "nginx",
    label: "nginx / VPS / панели",
    labelEn: "nginx / VPS / panels",
    file: "конфиг сайта в /etc/nginx/sites-available/",
    fileEn: "your site config in /etc/nginx/sites-available/",
    place: "внутри блока server { ... }",
    placeEn: "inside the server { ... } block",
    note: "add_header на уровне server действует на все location. Директива 'always' заставляет заголовки ставиться и на 4xx/5xx ответах - без неё техосмотр увидит дыру на страницах ошибок.",
    noteEn: "server-level add_header applies to every location. The 'always' directive makes the headers appear on 4xx/5xx responses too - without it the checkup flags the hole on error pages.",
    code: nginxCode(),
    description:
      "Блок add_header для nginx с полным набором защитных заголовков: CSP, HSTS, X-Frame-Options, COOP. Для VPS, BEGET, Timeweb и панелей.",
    descriptionEn:
      "An nginx add_header block with the full set of security headers: CSP, HSTS, X-Frame-Options, COOP. For VPS, BEGET, Timeweb and hosting panels.",
  },
];

export function fixGuideBySlug(slug: string): FixGuide | null {
  return FIX_GUIDES.find((g) => g.slug === slug) ?? null;
}

/** The short "why it matters" list shared by every guide page. */
export const HEADER_WHY: { name: string; why: string; whyEn: string; miss: string; missEn: string }[] = [
  { name: "Content-Security-Policy", why: "ограничивает, откуда грузятся скрипты и куда уходят данные", whyEn: "limits where scripts load from and where data goes", miss: "83% AI-собранных сайтов живут без неё", missEn: "83% of AI-built sites live without it" },
  { name: "Strict-Transport-Security", why: "запрещает браузеру ходить на сайт по http://", whyEn: "stops the browser from ever reaching the site over http://", miss: "защита от даунгрейда и перехвата в открытых Wi-Fi сетях", missEn: "protects against downgrade and interception on open Wi-Fi" },
  { name: "Cross-Origin-Opener-Policy", why: "изолирует окно сайта от чужих вкладок (Spectre-класс атак)", whyEn: "isolates the site's window from other tabs (the Spectre attack class)", miss: "самый частый провал: ~9 из 10 сайтов", missEn: "the most common miss: ~9 in 10 sites" },
  { name: "X-Frame-Options", why: "запрещает встраивание сайта в iframe на чужом домене", whyEn: "forbids embedding the site in an iframe on someone else's domain", miss: "базовая защита от кликджекинга", missEn: "basic clickjacking protection" },
  { name: "Permissions-Policy", why: "отключает камеру/микрофон/геолокацию по умолчанию", whyEn: "disables camera/microphone/geo by default", miss: "второй по частоте провал", missEn: "the second most common miss" },
  { name: "X-Content-Type-Options", why: "запрещает браузеру угадывать тип файла", whyEn: "stops the browser from guessing the file type", miss: "без него загруженный файл можно исполнить как скрипт", missEn: "without it an uploaded file can be executed as a script" },
];
