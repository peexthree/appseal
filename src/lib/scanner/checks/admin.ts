import type { CheckResult, Severity } from "../types";
import { safeFetch, truncate } from "../fetcher";

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
  for (const p of ADMIN_PATHS) {
    const r = await safeFetch(ctx.origin + p, { timeoutMs: 5000, maxBody: 200 * 1024 });
    if (r.status === 200 && r.body) {
      const looksAdmin = ADMIN_MARKERS.some((re) => re.test(r.body)) || /login/i.test(r.body);
      if (looksAdmin) {
        open.push(p);
        const title = r.body.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "";
        evidence.push(`${p} → 200, title: "${truncate(title, 60)}"`);
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
    ru: "Стандартные пути админок не открыты",
    en: "Standard admin paths are not exposed",
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
    const r = await safeFetch(ctx.origin + p, { method: "GET", timeoutMs: 5000, maxBody: 512 });
    if (r.status === 200 && (r.bodyBytes > 64 || r.body.length > 32)) {
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
    const r = await safeFetch(ctx.origin + p, { timeoutMs: 5000, maxBody: 100 * 1024 });
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
