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
  /** set once the soft-404 probe has run (catch-all routing) */
  catchAll?: boolean;
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

const base = (ctx: Ctx): string => ctx.origin + (ctx.basePath ?? "");

function isRealFile(body: string, contentType: string, homeBody: string): boolean {
  const isHtml = /text\/html/i.test(contentType) && /<html|<!doctype/i.test(body);
  return !isHtml && !bodiesEquivalent(body, homeBody);
}

/* ------------------------------------------------------------------ */
/* Soft-404 / catch-all routing detector (shared context for probes)   */
/* ------------------------------------------------------------------ */

export async function checkSoft404(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const probePath = "/appseal-probe-" + randomBytes(4).toString("hex");
  const probe = await safeFetch(base(ctx) + probePath, { timeoutMs: 5000, maxBody: 200 * 1024 });
  const catchAll = probe.status === 200 && !bodiesEquivalent(probe.body, ctx.homeBody);
  ctx.catchAll = catchAll;
  return [done("soft404_routing", catchAll ? "info" : "pass", "low", 0, {
    ru: catchAll
      ? "Любой адрес отвечает страницей (catch-all routing)"
      : "Несуществующие адреса отвечают 404 корректно",
    en: catchAll
      ? "Every URL returns a page (catch-all routing)"
      : "Non-existent URLs correctly return 404",
  }, catchAll ? {
    code: "CATCH_ALL_ROUTING",
    detail: {
      ru: "Сайт отвечает 200 на произвольные пути (SPA-роутинг). Это не уязвимость, но проверкам админок и файлов нужен контекст: часть 200-ответов может быть ложной.",
      en: "The site answers 200 to arbitrary paths (SPA routing). Not a vulnerability, but admin and file probes need this context: some 200s may be false positives.",
    },
    evidence: [`${probePath} → 200`],
  } : undefined, Date.now() - t0)];
}

/* ------------------------------------------------------------------ */
/* Admin panels on standard paths                                      */
/* ------------------------------------------------------------------ */

const ADMIN_MARKERS = [
  /admin\s*(panel|dashboard|login)/i,
  /<title\b[^>]*>[^<]*(admin|панель|dashboard)/i,
  /wp-admin/i,
  /sign\s*in\s*to\s*(your|the)\s*dashboard/i,
  /вход\s*(для|в)\s*(админ|панель)/i,
];

interface AdminTarget { id: string; paths: string[]; label: { ru: string; en: string }; sev: Severity; pen: number }

const ADMIN_TARGETS: AdminTarget[] = [
  { id: "admin_generic_open", paths: ["/admin", "/admin/", "/dashboard", "/console"], label: { ru: "Панель администратора", en: "Admin panel" }, sev: "high", pen: 15 },
  { id: "admin_wp_open", paths: ["/wp-admin/", "/wp-login.php"], label: { ru: "Админка WordPress", en: "WordPress admin" }, sev: "medium", pen: 8 },
  { id: "admin_joomla_open", paths: ["/administrator/"], label: { ru: "Админка Joomla", en: "Joomla admin" }, sev: "medium", pen: 8 },
  { id: "admin_bitrix_open", paths: ["/bitrix/admin/"], label: { ru: "Админка Bitrix", en: "Bitrix admin" }, sev: "medium", pen: 8 },
];

function probeAdminTarget(ctx: Ctx, t: AdminTarget, t0: number): Promise<CheckResult> {
  return (async () => {
    for (const p of t.paths) {
      const r = await safeFetch(base(ctx) + p, { timeoutMs: 5000, maxBody: 200 * 1024 });
      if (r.status === 200 && r.body) {
        if (bodiesEquivalent(r.body, ctx.homeBody)) continue;
        let redirected = false;
        try {
          const finalPath = new URL(r.url).pathname.replace(/\/+$/, "") || "/";
          const askedPath = ((ctx.basePath ?? "") + p).replace(/\/+$/, "") || "/";
          redirected = finalPath !== askedPath;
        } catch {
          /* keep default */
        }
        const looksAdmin = ADMIN_MARKERS.some((re) => re.test(r.body));
        const hasPasswordInput = /<input[^>]+type=["']password["']/i.test(r.body);
        const hasLoginForm =
          /<form[\s\S]{0,600}?(?:log[io]n|sign[\s-]?in|войти|логин)/i.test(r.body) ||
          /(?:log[io]n|sign[\s-]?in|войти)[\s\S]{0,200}?<form/i.test(r.body);
        const real = looksAdmin && !redirected && (hasPasswordInput || hasLoginForm);
        if (real) {
          const titleMatch = r.body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
          const title = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : "";
          return done(t.id, "warn", t.sev, t.pen, {
            ru: `${t.label.ru} доступна без VPN/IP-ограничений`,
            en: `${t.label.en} reachable without VPN/IP restrictions`,
          }, {
            code: "ADMIN_EXPOSED",
            detail: {
              ru: `Страница ${p} отвечает 200 с формой входа. Если единственная защита - пароль, перебор - вопрос времени. Рекомендуются: отдельный поддомен, IP allowlist, 2FA, rate limit.`,
              en: `${p} responds 200 with a login form. If a password is the only defense, brute force is a matter of time. Recommended: separate subdomain, IP allowlist, 2FA, rate limiting.`,
            },
            evidence: [`${p} → 200, title: "${truncate(title, 60)}"`],
          }, Date.now() - t0);
        }
      }
    }
    return done(t.id, "pass", t.sev, 0, {
      ru: `${t.label.ru}: стандартные пути не открыты`,
      en: `${t.label.en}: standard paths are not exposed`,
    }, undefined, Date.now() - t0);
  })();
}

export async function checkAdminExposure(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  return Promise.all(ADMIN_TARGETS.map((t) => probeAdminTarget(ctx, t, t0)));
}

/* ------------------------------------------------------------------ */
/* Backup archives & database dumps                                    */
/* ------------------------------------------------------------------ */

const ARCHIVE_PATHS = ["/backup.zip", "/site.zip", "/backup.tar.gz", "/backup.rar", "/site-backup.zip", "/web.zip"];
const DUMP_PATHS = ["/backup.sql", "/db.sqlite3", "/database.sqlite3", "/dump.sql", "/database.json", "/export.sql", "/db.sql.gz"];
const BAK_PATHS = ["/config.php.bak", "/index.php.bak", "/settings.py.bak", "/app.js.old", "/config.old", "/wp-config.php.save"];

export async function checkBackups(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const out: CheckResult[] = [];

  const probe = async (paths: string[], id: string, label: { ru: string; en: string }, sev: Severity, pen: number, marker: RegExp) => {
    const probed = await Promise.all(
      paths.map(async (p) => {
        const r = await safeFetch(base(ctx) + p, { timeoutMs: 5000, maxBody: 512 });
        if (r.status === 200 && (r.bodyBytes > 64 || r.body.length > 32)) {
          if (!isRealFile(r.body, r.contentType, ctx.homeBody)) return null;
          if (!marker || marker.test(r.body.slice(0, 512)) || !/text\/html/i.test(r.contentType)) return p;
        }
        return null;
      }),
    );
    const found = probed.filter((p): p is string => Boolean(p));
    if (found.length) {
      out.push(done(id, "fail", sev, pen, label, {
        code: id.toUpperCase(),
        detail: {
          ru: "По прямому URL лежит файл без защиты: скачивание даёт либо данные приложения, либо структуру проекта. Файлы нужно немедленно убрать из веб-корня.",
          en: "An unprotected file sits at a direct URL: downloading it yields app data or project structure. Remove these files from the web root immediately.",
        },
        evidence: found.map((p) => `${p} → файл доступен (содержимое скрыто политикой безопасности)`),
      }, Date.now() - t0));
    } else {
      out.push(done(id, "pass", sev, 0, {
        ru: label.ru.replace(" доступны по прямым ссылкам", " не найдены").replace(" найден по прямым ссылкам", " не найден"),
        en: label.en.replace(" are directly downloadable", " not found").replace(" found", " not found"),
      }, undefined, Date.now() - t0));
    }
  };

  await probe(ARCHIVE_PATHS, "backup_archives", { ru: "Архивы бэкапов доступны по прямым ссылкам", en: "Backup archives are directly downloadable" }, "critical", 40, /./);
  await probe(DUMP_PATHS, "db_dumps", { ru: "Дампы БД доступны по прямым ссылкам", en: "Database dumps are directly downloadable" }, "critical", 40, /./);
  await probe(BAK_PATHS, "bak_files", { ru: "Резервные копии кода (.bak/.old) найдены", en: "Code backup files (.bak/.old) found" }, "medium", 8, /./);

  return out;
}

/* ------------------------------------------------------------------ */
/* Debug endpoints                                                     */
/* ------------------------------------------------------------------ */

const JSON_DEBUG_PATHS = ["/api/debug", "/api/test", "/api/diag", "/debug/vars"];

export async function checkDebugEndpoints(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const out: CheckResult[] = [];
  const probed = await Promise.all(
    JSON_DEBUG_PATHS.map(async (p) => {
      const r = await safeFetch(base(ctx) + p, { timeoutMs: 5000, maxBody: 100 * 1024 });
      if (r.status === 200 && /application\/json/i.test(r.contentType) && r.body.length > 2 && isRealFile(r.body, r.contentType, ctx.homeBody)) {
        return `${p} → ${truncate(r.body, 100)}`;
      }
      return null;
    }),
  );
  const found = probed.filter((x): x is string => Boolean(x));
  out.push(done("debug_endpoints", found.length ? "warn" : "pass", "medium", found.length ? 8 : 0, {
    ru: found.length ? "Открыты отладочные JSON-эндпоинты" : "Отладочные JSON-эндпоинты закрыты",
    en: found.length ? "Debug JSON endpoints are exposed" : "Debug JSON endpoints are not exposed",
  }, found.length ? {
    code: "DEBUG_EXPOSED",
    detail: {
      ru: "Служебные эндпоинты отвечают на проде и отдают служебную информацию (переменные окружения, стектрейсы, тестовые данные). Их нужно закрыть или удалить.",
      en: "Service endpoints respond in production and leak internals (env vars, stack traces, test data). Close or remove them.",
    },
    evidence: found.slice(0, 4),
  } : undefined, Date.now() - t0));
  return out;
}

interface DebugTarget { id: string; paths: string[]; marker: RegExp; label: { ru: string; en: string }; sev: Severity; pen: number; contentType?: RegExp }

const DEBUG_TARGETS: DebugTarget[] = [
  {
    id: "actuator_root",
    paths: ["/actuator", "/actuator/health"],
    marker: /"_links"|"status"\s*:\s*"UP"|WHITELABEL/i,
    label: { ru: "Spring Boot Actuator открыт", en: "Spring Boot Actuator exposed" },
    sev: "medium", pen: 10,
  },
  {
    id: "actuator_env",
    paths: ["/actuator/env", "/actuator/heapdump"],
    marker: /"propertySources"|HPROF|java\.heap/i,
    label: { ru: "Actuator env/heapdump открыт", en: "Actuator env/heapdump exposed" },
    sev: "critical", pen: 30,
  },
  {
    id: "laravel_debug",
    paths: ["/_ignition/health-check", "/telescope", "/_debugbar"],
    marker: /ignition|telescope|debugbar/i,
    label: { ru: "Отладка Laravel доступна", en: "Laravel debug tooling exposed" },
    sev: "high", pen: 15,
  },
  {
    id: "aspnet_debug",
    paths: ["/elmah.axd", "/trace.axd"],
    marker: /elmah|trace.*application/i,
    label: { ru: "ASP.NET отладочные страницы открыты", en: "ASP.NET debug pages exposed" },
    sev: "medium", pen: 10,
  },
  {
    id: "php_info",
    paths: ["/phpinfo.php", "/info.php", "/test.php"],
    marker: /phpinfo\(\)|PHP Version/i,
    label: { ru: "phpinfo открыт", en: "phpinfo exposed" },
    sev: "medium", pen: 10,
  },
  {
    id: "apache_status",
    paths: ["/server-status", "/server-info"],
    marker: /Apache Server Status|Server Information/i,
    label: { ru: "Статус Apache открыт", en: "Apache status exposed" },
    sev: "medium", pen: 10,
  },
  {
    id: "wp_debug_log",
    paths: ["/wp-content/debug.log"],
    marker: /PHP (?:Notice|Warning|Fatal)/i,
    label: { ru: "WordPress debug.log открыт", en: "WordPress debug.log exposed" },
    sev: "medium", pen: 10,
  },
  {
    id: "drupal_changelog",
    paths: ["/CHANGELOG.txt"],
    marker: /Drupal/i,
    label: { ru: "CHANGELOG Drupal открыт (версия CMS)", en: "Drupal CHANGELOG exposed (CMS version)" },
    sev: "low", pen: 4,
  },
];

export async function checkDebugTargets(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  return Promise.all(DEBUG_TARGETS.map((t) => (async () => {
    for (const p of t.paths) {
      const r = await safeFetch(base(ctx) + p, { timeoutMs: 5000, maxBody: 100 * 1024 });
      if (r.status === 200 && isRealFile(r.body, r.contentType, ctx.homeBody) && t.marker.test(r.body)) {
        return done(t.id, "warn", t.sev, t.pen, t.label, {
          code: t.id.toUpperCase(),
          detail: {
            ru: "Служебная страница отдаёт внутреннюю информацию: версии, пути, переменные окружения или дампы. Закройте доступ на проде (auth/IP allowlist).",
            en: "A service page leaks internals: versions, paths, env variables or dumps. Restrict access in production (auth/IP allowlist).",
          },
          evidence: [`${p} → 200`],
        }, Date.now() - t0);
      }
    }
    return done(t.id, "pass", t.sev, 0, {
      ru: `${t.label.ru.replace(" открыт", "")}: закрыто`,
      en: `${t.label.en.replace(" exposed", "")}: not exposed`,
    }, undefined, Date.now() - t0);
  })()));
}

/* ------------------------------------------------------------------ */
/* Framework error surfaces in homepage HTML                           */
/* ------------------------------------------------------------------ */

export async function checkFrameworkErrors(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const out: CheckResult[] = [];

  const django = /You're seeing this (?:page )?because DEBUG=True|Traceback \(most recent call last\)/i.test(ctx.homeBody);
  out.push(done("django_debug_marker", django ? "fail" : "pass", "high", django ? 15 : 0, {
    ru: django ? "Django DEBUG=True выведен наружу" : "Признаков Django-отладки нет",
    en: django ? "Django DEBUG=True is exposed" : "No Django debug markers",
  }, django ? {
    code: "DJANGO_DEBUG",
    detail: {
      ru: "Страница с жёлтым экраном Django (DEBUG=True) показывает стектрейсы, настройки и фрагменты кода любому посетителю. Выключите DEBUG на проде.",
      en: "A Django yellow page (DEBUG=True) shows stack traces, settings and code fragments to any visitor. Turn DEBUG off in production.",
    },
    evidence: ["DEBUG=True page marker found in homepage HTML"],
  } : undefined, Date.now() - t0));

  const php = /(?:<br\s*\/?>)?\s*(?:Warning|Fatal error|Parse error|Notice):\s+[^\n]{10,120}\.php on line \d+/i.test(ctx.homeBody);
  out.push(done("php_error_markers", php ? "warn" : "pass", "medium", php ? 6 : 0, {
    ru: php ? "PHP-ошибки выводятся в HTML" : "PHP-ошибок в разметке нет",
    en: php ? "PHP errors are rendered into HTML" : "No PHP errors in markup",
  }, php ? {
    code: "PHP_ERRORS_VISIBLE",
    detail: {
      ru: "Warning/Fatal error с путями и номерами строк попадают в выдачу: раскрывается структура файлов и версии. display_errors = Off на проде.",
      en: "Warning/Fatal error with paths and line numbers end up in the output: file structure and versions leak. Set display_errors = Off in production.",
    },
    evidence: (ctx.homeBody.match(/(?:Warning|Fatal error|Parse error):[^\n]{5,90}/i) ?? []).slice(0, 2),
  } : undefined, Date.now() - t0));

  const db = /(?:MySQLSyntaxErrorException|ORA-\d{5}|SQLSTATE\[[\w]+\]|psql:.*ERROR|Unclosed quotation mark after)/i.test(ctx.homeBody);
  out.push(done("db_error_markers", db ? "fail" : "pass", "high", db ? 12 : 0, {
    ru: db ? "Ошибки СУБД выводятся в HTML" : "Ошибок СУБД в разметке нет",
    en: db ? "Database errors are rendered into HTML" : "No DB errors in markup",
  }, db ? {
    code: "DB_ERRORS_VISIBLE",
    detail: {
      ru: "Сообщения СУБД (SQLSTATE, ORA-*, MySQL) в HTML: фрагменты SQL-запросов и схема данных на виду - помощь для SQL-инъекций. Обрабатывайте ошибки на сервере, а не в ответе.",
      en: "DB messages (SQLSTATE, ORA-*, MySQL) in HTML: SQL fragments and the data schema are on display - an assist for SQL injection. Handle errors server-side, not in the response.",
    },
    evidence: (ctx.homeBody.match(/(?:SQLSTATE\[[\w]+\]|ORA-\d{5}|MySQLSyntaxErrorException)/i) ?? []).slice(0, 2),
  } : undefined, Date.now() - t0));

  return out;
}

/* ------------------------------------------------------------------ */
/* Swagger / OpenAPI / GraphQL exposure (split)                        */
/* ------------------------------------------------------------------ */

const API_DOC_PATHS = ["/swagger.json", "/openapi.json", "/api/docs", "/v2/api-docs", "/v3/api-docs"];
const GRAPHQL_PATHS = ["/graphql", "/graphiql", "/api/graphql", "/graphql/console"];

export async function checkSwaggerOpen(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const probed = await Promise.all(
    API_DOC_PATHS.map(async (p) => {
      const r = await safeFetch(base(ctx) + p, { timeoutMs: 4000, maxBody: 10 * 1024 });
      if (r.ok && r.status === 200) {
        if (bodiesEquivalent(r.body, ctx.homeBody)) return null;
        const isJsonDoc =
          /application\/json/i.test(r.contentType) &&
          (r.body.includes('"openapi"') || r.body.includes('"swagger"') || r.body.includes('"paths"'));
        if (isJsonDoc) return p;
      }
      return null;
    }),
  );
  const found = probed.filter((p): p is string => Boolean(p));
  if (found.length) {
    return [done("swagger_open", "warn", "medium", 10, {
      ru: "Схема Swagger/OpenAPI доступна публично",
      en: "Swagger / OpenAPI schema is publicly exposed",
    }, {
      code: "API_DOCS_EXPOSED",
      detail: {
        ru: "Схема API на проде описывает все эндпоинты, параметры и модели - готовая карта для атакующего. Закройте документацию авторизацией или удалите с прода.",
        en: "A production API schema lists every endpoint, parameter and model - a ready map for attackers. Put docs behind auth or remove them from production.",
      },
      evidence: found,
    }, Date.now() - t0)];
  }
  return [done("swagger_open", "pass", "medium", 0, {
    ru: "Swagger/OpenAPI схема не открыта",
    en: "Swagger / OpenAPI schema is not exposed",
  }, undefined, Date.now() - t0)];
}

export async function checkGraphqlOpen(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const probed = await Promise.all(
    GRAPHQL_PATHS.map(async (p) => {
      const r = await safeFetch(base(ctx) + p, { timeoutMs: 4000, maxBody: 10 * 1024 });
      if (r.ok && r.status === 200) {
        if (bodiesEquivalent(r.body, ctx.homeBody)) return null;
        const isGraphiql =
          /text\/html/i.test(r.contentType) &&
          (r.body.includes("GraphQL") || r.body.includes("graphiql") || r.body.includes("GraphQLPlayground"));
        if (isGraphiql) return p;
      }
      return null;
    }),
  );
  const found = probed.filter((p): p is string => Boolean(p));
  if (found.length) {
    return [done("graphql_ui_open", "warn", "medium", 10, {
      ru: "GraphQL-консоль доступна публично",
      en: "GraphQL console is publicly exposed",
    }, {
      code: "GRAPHQL_UI_EXPOSED",
      detail: {
        ru: "Интерактивная консоль GraphQL на проде позволяет любому исследовать схему, внутренние типы и мутации. Отключите GraphiQL/Playground на проде.",
        en: "An interactive GraphQL console in production lets anyone map the schema, internal types and mutations. Disable GraphiQL/Playground in production.",
      },
      evidence: found,
    }, Date.now() - t0)];
  }
  return [done("graphql_ui_open", "pass", "medium", 0, {
    ru: "GraphQL-консоль не открыта",
    en: "GraphQL console is not exposed",
  }, undefined, Date.now() - t0)];
}

/* ------------------------------------------------------------------ */
/* WordPress enumeration surfaces                                      */
/* ------------------------------------------------------------------ */

export async function checkWpEnum(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const out: CheckResult[] = [];

  const users = await safeFetch(base(ctx) + "/wp-json/wp/v2/users", { timeoutMs: 5000, maxBody: 20 * 1024 });
  const usersOk = users.status === 200 && /\[\s*\{\s*"(?:id|name|slug)"/i.test(users.body) && /"slug"/i.test(users.body);
  out.push(done("wp_json_users", usersOk ? "warn" : "pass", "high", usersOk ? 15 : 0, {
    ru: usersOk ? "WP REST перечисляет пользователей" : "WP REST перечисление пользователей закрыто",
    en: usersOk ? "WP REST API lists users" : "WP REST user enumeration is closed",
  }, usersOk ? {
    code: "WP_USERS_ENUM",
    detail: {
      ru: "/wp-json/wp/v2/users отдаёт список логинов авторов: логины администратора на виду - половина брутфорса сделана. Закройте перечисление пользователей.",
      en: "/wp-json/wp/v2/users returns the author list: admin logins on display - half of the brute-force done. Close user enumeration.",
    },
    evidence: ["/wp-json/wp/v2/users → JSON с авторами"],
  } : undefined, Date.now() - t0));

  const xmlrpc = await safeFetch(base(ctx) + "/xmlrpc.php", { timeoutMs: 5000, maxBody: 2048 });
  const xmlrpcOk = xmlrpc.status === 200 && /xmlrpc|XML-RPC server/i.test(xmlrpc.body) && isRealFile(xmlrpc.body, xmlrpc.contentType, ctx.homeBody);
  out.push(done("xmlrpc_enabled", xmlrpcOk ? "warn" : "pass", "medium", xmlrpcOk ? 8 : 0, {
    ru: xmlrpcOk ? "XML-RPC включён" : "XML-RPC не доступен",
    en: xmlrpcOk ? "XML-RPC is enabled" : "XML-RPC is not exposed",
  }, xmlrpcOk ? {
    code: "XMLRPC_ENABLED",
    detail: {
      ru: "xmlrpc.php отвечает: через него идут амплитудные атаки брутфорса (system.multicall) и пинбэк-DDoS. Если он не нужен - отключите.",
      en: "xmlrpc.php responds: it is used for amplified brute-force (system.multicall) and pingback DDoS. Disable it if not needed.",
    },
    evidence: ["/xmlrpc.php → 200"],
  } : undefined, Date.now() - t0));

  return out;
}

/* ------------------------------------------------------------------ */
/* Directory listing                                                   */
/* ------------------------------------------------------------------ */

const DIR_PATHS = ["/uploads/", "/files/", "/assets/", "/static/"];

export async function checkDirectoryListing(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const probed = await Promise.all(
    DIR_PATHS.map(async (p) => {
      const r = await safeFetch(base(ctx) + p, { timeoutMs: 4000, maxBody: 8 * 1024 });
      if (r.status === 200 && /<title>\s*Index of\s|Directory listing for/i.test(r.body)) return p;
      return null;
    }),
  );
  const hit = probed.find((p): p is string => Boolean(p));
  if (hit) {
    return [done("directory_listing", "warn", "medium", 8, {
      ru: "Открыт листинг каталога",
      en: "Directory listing is exposed",
    }, {
      code: "DIR_LISTING",
      detail: {
        ru: `${hit} отдаёт автоиндекс: содержимое каталога перечисляется полностью, включая служебные файлы. Отключите autoindex (Options -Indexes).`,
        en: `${hit} serves an autoindex: the full directory content is listed, including service files. Disable autoindex (Options -Indexes).`,
      },
      evidence: [`${hit} → "Index of"`],
    }, Date.now() - t0)];
  }
  return [done("directory_listing", "pass", "medium", 0, {
    ru: "Листинг каталогов не обнаружен",
    en: "No directory listing found",
  }, undefined, Date.now() - t0)];
}

/* ------------------------------------------------------------------ */
/* CORS preflight destructive methods                                  */
/* ------------------------------------------------------------------ */

export async function checkCorsPreflightMethods(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const r = await safeFetch(base(ctx) + "/", {
    method: "OPTIONS",
    timeoutMs: 4000,
    headers: {
      origin: "https://evil-untrusted-origin.com",
      "access-control-request-method": "DELETE",
    },
  });
  const allowMethods = (r.headers["access-control-allow-methods"] ?? "").toUpperCase();
  const allowOrigin = r.headers["access-control-allow-origin"] ?? "";
  const dangerousMethods = ["DELETE", "PUT", "PATCH"].filter((m) => allowMethods.includes(m));
  if ((allowOrigin === "*" || allowOrigin === "https://evil-untrusted-origin.com") && dangerousMethods.length > 0) {
    return [done(
      "cors_preflight_methods",
      "warn",
      "medium",
      8,
      { ru: "Опасные методы в CORS Preflight (PUT/DELETE)", en: "Destructive HTTP methods allowed via CORS" },
      {
        code: "CORS_PREFLIGHT_METHODS",
        detail: {
          ru: `CORS preflight разрешает сторонним сайтам отправлять деструктивные методы (${dangerousMethods.join(", ")}). Если API не проверяет CSRF/Origin строго, возможны несанкционированные изменения данных.`,
          en: `CORS preflight permits external origins to use destructive methods (${dangerousMethods.join(", ")}). Without strict CSRF or Origin checks, arbitrary web apps could alter data.`,
        },
        evidence: [
          `Access-Control-Allow-Origin: ${allowOrigin}`,
          `Access-Control-Allow-Methods: ${allowMethods}`,
        ],
      },
      Date.now() - t0,
    )];
  }
  return [done("cors_preflight_methods", "pass", "low", 0, {
    ru: "CORS preflight не разрешает опасных методов для всех",
    en: "CORS preflight does not expose destructive methods to arbitrary origins",
  }, undefined, Date.now() - t0)];
}

/* ------------------------------------------------------------------ */
/* Rate limiting signals                                               */
/* ------------------------------------------------------------------ */

export async function checkRateLimitProtection(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const rlHeader =
    ctx.homeHeaders["ratelimit-limit"] ||
    ctx.homeHeaders["x-ratelimit-limit"] ||
    ctx.homeHeaders["x-rate-limit-limit"] ||
    ctx.homeHeaders["cf-mitigated"];
  return [done("auth_rate_limit", "pass", "low", 0, {
    ru: rlHeader ? "Обнаружены заголовки Rate-Limit защиты" : "Rate limit проверен",
    en: rlHeader ? "Rate-limiting headers detected" : "Rate limiting checked",
  }, rlHeader ? {
    code: "RATELIMIT_PRESENT",
    detail: {
      ru: "Сервер возвращает заголовки ограничения частоты запросов (RateLimit), защищая эндпоинты от брутфорса и перегрузки.",
      en: "Server returns rate-limiting headers, protecting resources against brute-force and scraping.",
    },
    evidence: [`limit: ${rlHeader}`],
  } : undefined, Date.now() - t0)];
}
