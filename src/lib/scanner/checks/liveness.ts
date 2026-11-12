import type { CheckResult, Severity } from "../types";
import { extractLinks, safeFetch, truncate } from "../fetcher";

interface Ctx {
  origin: string;
  host: string;
  homeBody: string;
  homeHeaders: Record<string, string>;
  isHttp: boolean;
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
  const evidence: string[] = [];
  const title = ctx.homeBody.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "";
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
  const links = extractLinks(ctx.homeBody, ctx.origin, 8);
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
  const title = ctx.homeBody.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() ?? "";
  const desc = ctx.homeBody.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1]?.trim() ?? "";
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
