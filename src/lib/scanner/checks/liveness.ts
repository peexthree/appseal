import type { CheckResult, Severity, TechPassport } from "../types";
import { extractLinks, safeFetch, truncate } from "../fetcher";

interface Ctx {
  origin: string;
  host: string;
  homeBody: string;
  homeHeaders: Record<string, string>;
  isHttp: boolean;
  /** prefix for path probes (the built-in demo target lives under /api/demo-target) */
  basePath?: string;
  /** v0.2: the page is a client-side render shell - liveness text checks
   *  cannot judge it from static HTML and are reported as info */
  csr?: boolean;
}

const done = (
  id: string,
  status: CheckResult["status"],
  severity: Severity,
  penalty: number,
  title: CheckResult["title"],
  finding?: CheckResult["finding"],
  durationMs = 0,
): CheckResult => ({ id, category: "liveness", status, severity, penalty, title, durationMs, finding });

/* ------------------------------------------------------------------ */
/* Placeholder content                                                 */
/* ------------------------------------------------------------------ */

const PLACEHOLDERS: { re: RegExp; label: string }[] = [
  { re: /lorem ipsum/i, label: "lorem ipsum" },
  { re: /\bTODO:/i, label: "TODO:" },
  { re: /coming soon/i, label: "Coming soon" },
  { re: /your (?:content|text) here/i, label: "Your content here" },
  { re: /add your (?:text|description|content)/i, label: "Add your text" },
  { re: /sample (?:text|content|product)/i, label: "Sample text" },
  { re: /placeholder (?:text|content)/i, label: "Placeholder" },
  { re: /xx\/xx\/x{4}/i, label: "xx/xx/xxxx" },
];

export async function checkPlaceholder(ctx: Ctx): Promise<CheckResult> {
  const t0 = Date.now();
  if (ctx.csr) {
    return done(
      "placeholder_content",
      "info",
      "low",
      0,
      { ru: "Контент рендерится на клиенте - заглушки не оценивались", en: "Content is client-rendered - placeholders were not evaluated" },
      {
        code: "CSR_SKIPPED",
        detail: {
          ru: "Главная страница рендерится в браузере (пустой HTML-шелл): текстовые проверки требуют JS-рендеринга и будут добавлены в v0.3.",
          en: "The homepage renders in the browser (empty HTML shell): text checks need JS rendering and arrive in v0.3.",
        },
        evidence: [],
      },
      Date.now() - t0,
    );
  }
  const hits: string[] = [];
  // v0.2 context filter: matches inside code samples and check descriptions
  // are meta-references, not real placeholder content (e.g. our own landing
  // listing the patterns it searches for)
  const visible = ctx.homeBody
    .replace(/<(?:code|pre|script|style)[\s\S]*?<\/(?:code|pre|script|style)>/gi, " ");
  for (const p of PLACEHOLDERS) {
    const m = visible.match(p.re);
    if (!m) continue;
    const idx = visible.indexOf(m[0]);
    const around = visible.slice(Math.max(0, idx - 100), idx + 100);
    if (/(?:заглуш|placeholder text|placeholder content|иском|паттерн|проверк|сканер|scanner|детект|detect)/i.test(around)) {
      continue; // meta-mention: the page talks about the check, not the content
    }
    hits.push(`"${truncate(m[0], 40)}"`);
  }
  if (hits.length) {
    return done(
      "placeholder_content",
      "warn",
      "low",
      4,
      { ru: "На сайте остались заглушки", en: "Placeholder content left on the site" },
      {
        code: "PLACEHOLDER_CONTENT",
        detail: {
          ru: "Найдены тексты-заглушки: " + hits.slice(0, 4).join(", ") + ". Для посетителя это маркер брошенного проекта.",
          en: "Placeholder texts found: " + hits.slice(0, 4).join(", ") + ". To visitors this marks an abandoned project.",
        },
        evidence: hits.slice(0, 5),
      },
      Date.now() - t0,
    );
  }
  return done("placeholder_content", "pass", "low", 0, {
    ru: "Заглушек не найдено",
    en: "No placeholder content",
  }, undefined, Date.now() - t0);
}

/* ------------------------------------------------------------------ */
/* Rendered JS errors / undefined in content                           */
/* ------------------------------------------------------------------ */

export async function checkRenderedErrors(ctx: Ctx): Promise<CheckResult> {
  const t0 = Date.now();
  if (ctx.csr) {
    return done(
      "rendered_errors",
      "info",
      "low",
      0,
      { ru: "Контент рендерится на клиенте - ошибки разметки не оценивались", en: "Content is client-rendered - markup errors were not evaluated" },
      {
        code: "CSR_SKIPPED",
        detail: {
          ru: "Для страницы-шелла проверка ошибок рендеринга невозможна без JS-движка (план v0.3).",
          en: "A shell page cannot be checked for render errors without a JS engine (planned for v0.3).",
        },
        evidence: [],
      },
      Date.now() - t0,
    );
  }
  const evidence: string[] = [];
  const titleMatch = ctx.homeBody.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : "";
  if (/^(undefined|null|nan)\b/i.test(title.trim())) {
    evidence.push(`title: "${truncate(title, 60)}"`);
  }
  // visible "undefined" / "NaN" inside body markup (rough heuristic)
  const textChunks = ctx.homeBody.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const und = textChunks.match(/>undefined</g)?.length ?? 0;
  const nan = textChunks.match(/>NaN</g)?.length ?? 0;
  if (und > 0) evidence.push(`"undefined" rendered ${und}× in markup`);
  if (nan > 0) evidence.push(`"NaN" rendered ${nan}× in markup`);
  if (evidence.length) {
    return done(
      "rendered_errors",
      "warn",
      "low",
      5,
      { ru: "На страницу просачиваются ошибки JS", en: "JS errors leak onto the page" },
      {
        code: "RENDERED_ERRORS",
        detail: {
          ru: "В разметке видны «undefined»/«NaN» или пустой заголовок: где-то в коде необработанные данные рендерятся напрямую. Для пользователя это выглядит сломанным.",
          en: "Markup contains \"undefined\"/\"NaN\" or an empty title: unhandled values are rendered somewhere. It looks broken to users.",
        },
        evidence,
      },
      Date.now() - t0,
    );
  }
  return done("rendered_errors", "pass", "low", 0, {
    ru: "Ошибок в разметке не видно",
    en: "No visible markup errors",
  }, undefined, Date.now() - t0);
}

/* ------------------------------------------------------------------ */
/* Broken internal links                                               */
/* ------------------------------------------------------------------ */

export async function checkBrokenLinks(ctx: Ctx): Promise<CheckResult> {
  const t0 = Date.now();
  const all = extractLinks(ctx.homeBody, ctx.origin, 8);
  const self = (ctx.origin + (ctx.basePath ?? "")).replace(/\/+$/, "");
  const links = all.filter((u) => u.replace(/\/+$/, "") !== self);
  if (!links.length) {
    return done("broken_links", "info", "medium", 0, {
      ru: "Внутренних ссылок для проверки не найдено",
      en: "No internal links to check",
    }, undefined, Date.now() - t0);
  }
  const results = await Promise.all(
    links.map(async (u) => {
      const r = await safeFetch(u, { method: "HEAD", timeoutMs: 6000 });
      if (r.status === 405 || r.status === 501) {
        const r2 = await safeFetch(u, { timeoutMs: 6000, maxBody: 1024 });
        return { u, status: r2.status };
      }
      return { u, status: r.status };
    }),
  );
  const broken = results.filter((r) => r.status >= 400 || r.status === 0);
  if (broken.length && broken.length / results.length > 0.25) {
    return done(
      "broken_links",
      "fail",
      "medium",
      8,
      { ru: "Битые внутренние ссылки", en: "Broken internal links" },
      {
        code: "BROKEN_LINKS",
        detail: {
          ru: `${broken.length} из ${results.length} внутренних ссылок не отвечают. Классический признак недостроенного приложения: разделы, на которые кликают пользователи, ведут в никуда.`,
          en: `${broken.length} of ${results.length} internal links are dead. A classic sign of an unfinished app: sections users click lead nowhere.`,
        },
        evidence: broken.slice(0, 5).map((b) => `${b.u.replace(ctx.origin, "")} → ${b.status || "no response"}`),
      },
      Date.now() - t0,
    );
  }
  return done("broken_links", "pass", "medium", 0, {
    ru: `Внутренние ссылки живы (проверено ${results.length})`,
    en: `Internal links alive (${results.length} checked)`,
  }, undefined, Date.now() - t0);
}

/* ------------------------------------------------------------------ */
/* Meta health (title / description)                                   */
/* ------------------------------------------------------------------ */

export async function checkMetaHealth(ctx: Ctx): Promise<CheckResult> {
  const t0 = Date.now();
  const titleMatch = ctx.homeBody.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : "";
  const descMatch =
    ctx.homeBody.match(/<meta\b[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
    ctx.homeBody.match(/<meta\b[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  const desc = descMatch ? descMatch[1].replace(/\s+/g, " ").trim() : "";
  const missing: string[] = [];
  if (!title || title.length < 3) missing.push("<title>");
  if (!desc || desc.length < 10) missing.push("<meta description>");
  if (missing.length) {
    return done(
      "meta_health",
      "warn",
      "low",
      3,
      { ru: "Не заполнены базовые meta-теги", en: "Basic meta tags are missing" },
      {
        code: "META_MISSING",
        detail: {
          ru: `Отсутствуют: ${missing.join(", ")}. Приложение почти невидимо для поисковиков и выглядит сырым в мессенджерах.`,
          en: `Missing: ${missing.join(", ")}. The app is nearly invisible to search engines and looks raw in messengers.`,
        },
        evidence: [`title: "${truncate(title, 60)}"`, `description: "${truncate(desc, 60)}"`],
      },
      Date.now() - t0,
    );
  }
  return done("meta_health", "pass", "low", 0, {
    ru: "Meta-теги заполнены",
    en: "Meta tags are in place",
  }, undefined, Date.now() - t0);
}

/* ------------------------------------------------------------------ */
/* Platform detection (info, unscored)                                 */
/* ------------------------------------------------------------------ */

const PLATFORMS: { re: RegExp; name: string }[] = [
  { re: /lovable\.site|made with lovable|lovable\.dev/i, name: "Lovable" },
  { re: /replit\.app|replit\.dev|made with replit/i, name: "Replit" },
  { re: /bolt\.new|bolt-deno/i, name: "Bolt.new" },
  { re: /framer\.(?:com|app|website)|framerusercontent/i, name: "Framer" },
  { re: /v0\.dev|vercel\.app/i, name: "v0/Vercel" },
  { re: /base44\.app/i, name: "Base44" },
  { re: /firebaseapp\.com|web\.app/i, name: "Firebase Hosting" },
];

export function detectPlatform(body: string, host: string): string | undefined {
  for (const p of PLATFORMS) {
    if (p.re.test(body) || p.re.test(host)) return p.name;
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Mixed Content & local development leaks                            */
/* ------------------------------------------------------------------ */

export async function checkMixedContentDom(ctx: Ctx): Promise<CheckResult> {
  const t0 = Date.now();
  const evidence: string[] = [];

  // Localhost / 127.0.0.1 relics
  const localhostRe = /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/[^\s"'>]*)?/gi;
  const localMatches = ctx.homeBody.match(localhostRe) ?? [];
  for (const m of localMatches.slice(0, 3)) {
    evidence.push(`Забытая dev-ссылка: ${truncate(m, 60)}`);
  }

  // Mixed content on HTTPS
  if (!ctx.isHttp) {
    const mixedRe = /(?:src|href)=["'](http:\/\/[^"'>]+)["']/gi;
    let match;
    while ((match = mixedRe.exec(ctx.homeBody)) !== null) {
      const url = match[1];
      if (!url.startsWith("http://www.w3.org") && !url.startsWith("http://schema.org")) {
        evidence.push(`Небезопасный ресурс (mixed content): ${truncate(url, 60)}`);
        if (evidence.length >= 4) break;
      }
    }
  }

  if (evidence.length > 0) {
    return done(
      "mixed_content_dom",
      "warn",
      "low",
      4,
      { ru: "Mixed content или ссылки на localhost", en: "Mixed content or localhost links found" },
      {
        code: "MIXED_CONTENT_LEAK",
        detail: {
          ru: "В коде страницы найдены захардкоженные ссылки на localhost/127.0.0.1 или небезопасные ресурсы по http://. Такие ссылки ломаются у внешних пользователей или блокируются браузером.",
          en: "HTML contains hardcoded links to localhost/127.0.0.1 or insecure http:// assets. These break for public users or get blocked by the browser.",
        },
        evidence,
      },
      Date.now() - t0,
    );
  }

  return done("mixed_content_dom", "pass", "low", 0, {
    ru: "Mixed content и localhost-ссылки не найдены",
    en: "No mixed content or localhost links in markup",
  }, undefined, Date.now() - t0);
}

/* ------------------------------------------------------------------ */
/* Open Graph & social preview health                                 */
/* ------------------------------------------------------------------ */

export async function checkOpenGraphHealth(ctx: Ctx): Promise<CheckResult> {
  const t0 = Date.now();
  const missing: string[] = [];

  const hasOgTitle = /<meta[^>]+property=["']og:title["']/i.test(ctx.homeBody);
  const hasOgImage = /<meta[^>]+property=["']og:image["']/i.test(ctx.homeBody);
  const hasOgDesc = /<meta[^>]+property=["']og:description["']/i.test(ctx.homeBody);
  const hasFavicon = /<link[^>]+rel=["'](?:shortcut )?icon["']/i.test(ctx.homeBody);

  if (!hasOgTitle) missing.push("og:title");
  if (!hasOgImage) missing.push("og:image (превью в соцсетях)");
  if (!hasOgDesc) missing.push("og:description");
  if (!hasFavicon) missing.push("favicon (<link rel=\"icon\">)");

  if (missing.length > 0) {
    return done(
      "open_graph_health",
      "warn",
      "low",
      3,
      { ru: "Не настроены теги Open Graph / превью", en: "Open Graph social preview tags missing" },
      {
        code: "OG_INCOMPLETE",
        detail: {
          ru: `Отсутствуют важные теги превью: ${missing.join(", ")}. В Telegram, Twitter/X, Discord ссылки на приложение будут отображаться без картинки или описания.`,
          en: `Missing social preview tags: ${missing.join(", ")}. Links shared in Telegram, Twitter/X, and Discord will appear without card preview or image.`,
        },
        evidence: missing.map((m) => `Отсутствует: ${m}`),
      },
      Date.now() - t0,
    );
  }

  return done("open_graph_health", "pass", "low", 0, {
    ru: "Open Graph превью и фавикон настроены",
    en: "Open Graph preview and favicon configured",
  }, undefined, Date.now() - t0);
}

/* ------------------------------------------------------------------ */
/* Tech passport detection (unscored metadata)                        */
/* ------------------------------------------------------------------ */

export function detectTechPassport(
  body: string,
  headers: Record<string, string>,
  host: string,
  bodyBytes: number,
  ttfbMs: number,
): TechPassport {
  let stack = "Static HTML / CSR";
  if (/__next/i.test(body) || /_next\/static/i.test(body)) {
    stack = "Next.js (App Router / SSR)";
  } else if (/data-astro|astro-/i.test(body)) {
    stack = "Astro";
  } else if (/__nuxt/i.test(body) || /_nuxt\//i.test(body)) {
    stack = "Nuxt.js";
  } else if (/@vite|vite\//i.test(body) || /id="root"/i.test(body)) {
    stack = "React / Vite (CSR)";
  } else if (/svelte/i.test(body)) {
    stack = "SvelteKit";
  } else if (/framer/i.test(body)) {
    stack = "Framer";
  }

  let cdnWaf = "Direct Server";
  const server = (headers["server"] ?? "").toLowerCase();
  if (headers["cf-ray"] || server.includes("cloudflare")) {
    cdnWaf = "Cloudflare WAF / CDN";
  } else if (headers["x-vercel-id"] || headers["x-vercel-cache"]) {
    cdnWaf = "Vercel Edge Network";
  } else if (headers["x-amz-cf-id"]) {
    cdnWaf = "AWS CloudFront";
  } else if (headers["x-nf-request-id"] || server.includes("netlify")) {
    cdnWaf = "Netlify Edge";
  } else if (server.includes("nginx")) {
    cdnWaf = "Nginx Proxy";
  } else if (server.includes("caddy")) {
    cdnWaf = "Caddy Server";
  } else if (headers["ddos-guard"] || server.includes("ddos-guard")) {
    cdnWaf = "DDoS-Guard";
  }

  const pageSizeKb = Math.round(((bodyBytes || body.length) / 1024) * 10) / 10;

  return {
    stack,
    cdnWaf,
    pageSizeKb: Math.max(0.1, pageSizeKb),
    ttfbMs: Math.max(1, Math.round(ttfbMs)),
  };
}

