/**
 * Static content for the /fixes SEO guides: ready-to-paste security-header
 * configs per hosting, built from the same RECOMMENDED_HEADERS that AppSeal
 * runs in production (self-proven A+ on the same grader). One guide = one
 * long-tail landing ("как настроить заголовки безопасности на Vercel").
 */

import { RECOMMENDED_HEADERS } from "./config-patch.ts";

export interface FixGuide {
  slug: string;
  /** hosting name shown in the title */
  label: string;
  /** the file the reader must create/edit */
  file: string;
  /** one-line where-the-file-goes hint */
  place: string;
  note: string;
  code: string;
  /** long-tail page description (SEO) */
  description: string;
}

function headerLines(indent: string): string {
  return RECOMMENDED_HEADERS.map((h) => `${indent}${h.key}: ${h.value}`).join("\n");
}

const CSP_NOTE =
  "CSP ниже консервативный: с 'unsafe-inline' для script/style - так работают почти все сборки " +
  "из конструкторов и AI-агентов. Если ваш сайт не использует inline-скрипты, уберите " +
  "'unsafe-inline' из script-src: это плюс 3 балла на техосмотре.";

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
    "# /etc/nginx/sites-available/your-site (внутри server { ... })",
    ...lines,
    "",
    "# HSTS включается только на HTTPS-домене:",
    '    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;',
  ].join("\n");
}

function ghPagesWorkflow(): string {
  return [
    "# .github/workflows/deploy.yml - шаг отправки статических файлов уже есть,",
    "# заголовки для GitHub Pages задать нельзя (платформа не даёт), поэтому:",
    "# 1) вынесите сайт на Cloudflare Pages (формат _headers) или",
    "# 2) добавьте заголовки через тег <meta http-equiv> - частично работает.",
    "# Честный путь для GitHub Pages - Cloudflare перед Pages:",
    "  # (формат _headers - см. гайд Cloudflare Pages)",
  ].join("\n");
}

export const FIX_GUIDES: FixGuide[] = [
  {
    slug: "vercel",
    label: "Vercel",
    file: "vercel.json",
    place: "в корень репозитория, рядом с package.json",
    note: CSP_NOTE,
    code: vercelCode(),
    description:
      "Готовый vercel.json с защитными заголовками (CSP, HSTS, COOP, X-Frame-Options): скопируйте файл - и проект на Vercel пройдёт техосмотр AppSeal на класс выше.",
  },
  {
    slug: "nextjs",
    label: "Next.js (любой хостинг)",
    file: "next.config.ts",
    place: "в корень проекта вместо текущего next.config.ts / .mjs",
    note: CSP_NOTE,
    code: nextCode(),
    description:
      "Как добавить Content-Security-Policy, HSTS, COOP и другие заголовки безопасности в Next.js через async headers() в next.config.ts - готовый код для копипаста.",
  },
  {
    slug: "cloudflare-pages",
    label: "Cloudflare Pages / Workers",
    file: "_headers",
    place: "в корень output-директории сборки",
    note: "Формат _headers читает Cloudflare Pages при деплое. Правила Transform Response на уровне зоны в дашборде Cloudflare работают поверх - но файл надёжнее: он в git.",
    code: headersFileCode(),
    description:
      "Файл _headers для Cloudflare Pages со всем набором защитных заголовков: CSP, HSTS, COOP, Permissions-Policy. Копипаст и деплой.",
  },
  {
    slug: "netlify",
    label: "Netlify",
    file: "_headers",
    place: "в корень публикуемой папки (или netlify.toml при сборке)",
    note: CSP_NOTE,
    code: headersFileCode(),
    description:
      "Заголовки безопасности для Netlify через файл _headers: защита от кликджекинга, XSS, перехвата сессий. Готовый конфиг для копипаста.",
  },
  {
    slug: "github-pages",
    label: "GitHub Pages",
    file: "- (платформа не даёт ставить заголовки)",
    place: "-",
    note: "GitHub Pages не позволяет настраивать HTTP-заголовки вообще. Самый честный путь - поставить Cloudflare перед Pages (бесплатный тариф) и включить заголовки там, либо переехать на Cloudflare Pages.",
    code: ghPagesWorkflow(),
    description:
      "Почему на GitHub Pages нельзя задать заголовки безопасности и что делать: Cloudflare перед Pages, _headers или переезд. Разбор с конфигом.",
  },
  {
    slug: "nginx",
    label: "nginx / VPS / панели",
    file: "конфиг сайта в /etc/nginx/sites-available/",
    place: "внутри блока server { ... }",
    note: "add_header на уровне server действует на все location. Директива 'always' заставляет заголовки ставиться и на 4xx/5xx ответах - без неё техосмотр увидит дыру на страницах ошибок.",
    code: nginxCode(),
    description:
      "Блок add_header для nginx с полным набором защитных заголовков: CSP, HSTS, X-Frame-Options, COOP. Для VPS, BEGET, Timeweb и панелей.",
  },
];

export function fixGuideBySlug(slug: string): FixGuide | null {
  return FIX_GUIDES.find((g) => g.slug === slug) ?? null;
}

/** The short "why it matters" list shared by every guide page. */
export const HEADER_WHY: { name: string; why: string; miss: string }[] = [
  { name: "Content-Security-Policy", why: "ограничивает, откуда грузятся скрипты и куда уходят данные", miss: "83% AI-собранных сайтов живут без неё" },
  { name: "Strict-Transport-Security", why: "запрещает браузеру ходить на сайт по http://", miss: "защита от даунгрейда и перехвата в открытых Wi-Fi сетях" },
  { name: "Cross-Origin-Opener-Policy", why: "изолирует окно сайта от чужих вкладок (Spectre-класс атак)", miss: "самый частый провал: ~9 из 10 сайтов" },
  { name: "X-Frame-Options", why: "запрещает встраивание сайта в iframe на чужом домене", miss: "базовая защита от кликджекинга" },
  { name: "Permissions-Policy", why: "отключает камеру/микрофон/геолокацию по умолчанию", miss: "второй по частоте провал" },
  { name: "X-Content-Type-Options", why: "запрещает браузеру угадывать тип файла", miss: "без него загруженный файл можно исполнить как скрипт" },
];
