import type { CheckResult, Severity } from "../types";
import { randomBytes } from "node:crypto";
import { bodiesEquivalent, safeFetch, truncate } from "../fetcher";

interface Ctx {
  origin: string;
  host: string;
  homeBody: string;
  homeHeaders: Record<string, string>;
  isHttp: boolean;
  /** prefix for path probes (the built-in demo target lives under /api/demo-target) */
  basePath?: string;
}

const done = (
  id: string,
  status: CheckResult["status"],
  severity: Severity,
  penalty: number,
  title: CheckResult["title"],
  finding?: CheckResult["finding"],
  durationMs = 0,
): CheckResult => ({ id, category: "admin", status, severity, penalty, title, durationMs, finding });

/* ------------------------------------------------------------------ */
/* Admin panels reachable without auth                                 */
/* ------------------------------------------------------------------ */

const ADMIN_PATHS = ["/admin", "/admin/", "/wp-admin/", "/administrator/", "/dashboard"];

const ADMIN_MARKERS = [
  /admin\s*(panel|dashboard|login)/i,
  /<title>[^<]*(admin|панель|dashboard)/i,
  /wp-admin/i,
  /sign\s*in\s*to\s*(your|the)\s*dashboard/i,
  /вход\s*(для|в)\s*(админ|панель)/i,
];

export async function checkAdminExposure(ctx: Ctx): Promise<CheckResult> {
  const t0 = Date.now();
  const open: string[] = [];
  const evidence: string[] = [];
  const soft404: string[] = [];

  // v0.2 soft-404 detector: probe a random path to reveal catch-all routing
  // (any URL returns a page instead of 404, e.g. entity-based sites)
  const probePath = "/appseal-probe-" + randomBytes(4).toString("hex");
  const probe = await safeFetch(ctx.origin + (ctx.basePath ?? "") + probePath, { timeoutMs: 5000, maxBody: 200 * 1024 });
  const catchAll = probe.status === 200 && !bodiesEquivalent(probe.body, ctx.homeBody);

  for (const p of ADMIN_PATHS) {
    const r = await safeFetch(ctx.origin + (ctx.basePath ?? "") + p, { timeoutMs: 5000, maxBody: 200 * 1024 });
    if (r.status === 200 && r.body) {
      // 200 with the homepage body is a soft-404, not a real admin page
      if (bodiesEquivalent(r.body, ctx.homeBody)) {
        soft404.push(p);
        continue;
      }
      // a redirect to a different path means the content belongs to another
      // page (catch-all routing), not to an admin panel at this path
      let redirected = false;
      try {
        const finalPath = new URL(r.url).pathname.replace(/\/+$/, "") || "/";
        const askedPath = ((ctx.basePath ?? "") + p).replace(/\/+$/, "") || "/";
        redirected = finalPath !== askedPath;
      } catch {
        /* keep default */
      }
      // looksAdmin via panel markers only; the bare word "login" alone is not
      // evidence (banal word on catch-all pages) - form evidence below decides
      const looksAdmin = ADMIN_MARKERS.some((re) => re.test(r.body));
      // v0.2: a 200 page alone proves nothing (catch-all routing, entity
      // pages) - require actual login-form evidence: a password input or a
      // form with login/sign-in wording
      const hasPasswordInput = /<input[^>]+type=["']password["']/i.test(r.body);
      const hasLoginForm =
        /<form[\s\S]{0,600}?(?:log[io]n|sign[\s-]?in|войти|логин)/i.test(r.body) ||
        /(?:log[io]n|sign[\s-]?in|войти)[\s\S]{0,200}?<form/i.test(r.body);
      const real = looksAdmin && !redirected && (hasPasswordInput || hasLoginForm);
      if (real) {
        open.push(p);
        const title = r.body.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "";
        evidence.push(`${p} → 200, title: "${truncate(title, 60)}"`);
      } else if (looksAdmin) {
        soft404.push(p);
      }
    }
    // 401/403 = protected (good), 404 = absent (good)
  }
  if (open.length) {
    return done(
      "admin_exposure",
      "warn",
      "high",
      15,
      { ru: "Панель администратора доступна без VPN/IP-ограничений", en: "Admin panel reachable without VPN/IP restrictions" },
      {
        code: "ADMIN_EXPOSED",
        detail: {
          ru: "Страницы админки отвечают 200 на стандартных путях. Если единственная защита — пароль, перебор и брутфорс только вопрос времени. Рекомендуются: отдельный поддомен, IP allowlist, 2FA, rate limit.",
          en: "Admin pages return 200 on standard paths. If a password is the only defense, brute force is a matter of time. Recommended: separate subdomain, IP allowlist, 2FA, rate limiting.",
        },
        evidence,
      },
      Date.now() - t0,
    );
  }
  return done("admin_exposure", "pass", "high", 0, {
    ru: soft404.length
      ? `Стандартные пути админок не открыты (soft-404 отфильтровано: ${soft404.length})`
      : "Стандартные пути админок не открыты",
    en: soft404.length
      ? `Standard admin paths are not exposed (soft-404 filtered: ${soft404.length})`
      : "Standard admin paths are not exposed",
  }, undefined, Date.now() - t0);
}

/* ------------------------------------------------------------------ */
/* Backup / database files                                             */
/* ------------------------------------------------------------------ */

const BACKUP_PATHS = [
  "/backup.zip",
  "/backup.sql",
  "/db.sqlite3",
  "/database.sqlite3",
  "/dump.sql",
  "/database.json",
  "/export.sql",
];

export async function checkBackups(ctx: Ctx): Promise<CheckResult> {
  const t0 = Date.now();
  const found: string[] = [];
  for (const p of BACKUP_PATHS) {
    const r = await safeFetch(ctx.origin + (ctx.basePath ?? "") + p, { method: "GET", timeoutMs: 5000, maxBody: 512 });
    if (r.status === 200 && (r.bodyBytes > 64 || r.body.length > 32)) {
      // v0.2: catch-all sites answer 200 with an HTML page for any path -
      // a real dump is binary/structured, not the site's own HTML template
      const isHtmlTemplate =
        /text\/html/i.test(r.contentType) && /<html|<!doctype/i.test(r.body);
      if (isHtmlTemplate || bodiesEquivalent(r.body, ctx.homeBody)) continue;
      found.push(`${p} (${r.bodyBytes || r.body.length}+ bytes)`);
    }
  }
  if (found.length) {
    return done(
      "backup_files",
      "fail",
      "critical",
      40,
      { ru: "Бэкапы/дампы БД доступны по прямым ссылкам", en: "Backup/DB dump files are directly downloadable" },
      {
        code: "BACKUP_EXPOSED",
        detail: {
          ru: "По прямому URL лежит дамп базы или бэкап. Это мгновенная утечка всех данных приложения. Файлы нужно убрать из веб-корня немедленно.",
          en: "A database dump or backup sits at a direct URL. That is an instant leak of every record in the app. Remove files from the web root immediately.",
        },
        evidence: found,
      },
      Date.now() - t0,
    );
  }
  return done("backup_files", "pass", "critical", 0, {
    ru: "Бэкапы и дампы не найдены",
    en: "No backup or dump files found",
  }, undefined, Date.now() - t0);
}

/* ------------------------------------------------------------------ */
/* Debug endpoints                                                     */
/* ------------------------------------------------------------------ */

const DEBUG_PATHS = ["/api/debug", "/debug/vars", "/actuator/env", "/api/test", "/api/diag"];

export async function checkDebugEndpoints(ctx: Ctx): Promise<CheckResult> {
  const t0 = Date.now();
  const found: string[] = [];
  for (const p of DEBUG_PATHS) {
    const r = await safeFetch(ctx.origin + (ctx.basePath ?? "") + p, { timeoutMs: 5000, maxBody: 100 * 1024 });
    if (r.status === 200 && /application\/json/i.test(r.contentType) && r.body.length > 2) {
      found.push(`${p} → ${truncate(r.body, 100)}`);
    }
  }
  if (found.length) {
    return done(
      "debug_endpoints",
      "warn",
      "medium",
      8,
      { ru: "Открыты отладочные эндпоинты", en: "Debug endpoints are exposed" },
      {
        code: "DEBUG_EXPOSED",
        detail: {
          ru: "Служебные эндпоинты отвечают на проде и отдают служебную информацию (переменные окружения, стектрейсы, тестовые данные). Их нужно закрыть или удалить.",
          en: "Service endpoints respond in production and leak internals (env vars, stack traces, test data). Close or remove them.",
        },
        evidence: found.slice(0, 4),
      },
      Date.now() - t0,
    );
  }
  return done("debug_endpoints", "pass", "medium", 0, {
    ru: "Отладочные эндпоинты закрыты",
    en: "Debug endpoints are not exposed",
  }, undefined, Date.now() - t0);
}
