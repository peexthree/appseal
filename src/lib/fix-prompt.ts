import type { CheckResult, ScanResult } from "./scanner/types";

/**
 * Builds the "hand to your AI agent" prompt from a finished scan.
 * Every failed/warned check becomes an instruction with evidence and, where
 * applicable, a ready config snippet (per detected platform).
 */

const HEADERS_SNIPPETS: Record<string, { label: string; code: string }> = {
  vercel: {
    label: "vercel.json",
    code: `{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" }
      ]
    }
  ]
}`,
  },
  netlify: {
    label: "netlify.toml",
    code: `[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options = "nosniff"
    X-Frame-Options = "DENY"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Strict-Transport-Security = "max-age=63072000; includeSubDomains; preload"`,
  },
  next: {
    label: "next.config.ts",
    code: `const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

export default {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};`,
  },
};

function platformSnippet(platform?: string): { label: string; code: string } {
  if (!platform) return HEADERS_SNIPPETS.vercel;
  if (/v0\/vercel/i.test(platform)) return HEADERS_SNIPPETS.vercel;
  if (/lovable/i.test(platform)) return HEADERS_SNIPPETS.vercel; // lovable publishes via similar config
  if (/framer|base44|bolt|replit/i.test(platform)) return HEADERS_SNIPPETS.netlify;
  return HEADERS_SNIPPETS.vercel;
}

interface Fix {
  title: string;
  why: string;
  how: string;
}

function fixFor(r: CheckResult, lang: "ru" | "en"): Fix | null {
  const ev = r.finding?.evidence.slice(0, 3).join("\n") ?? "";
  const ru = lang === "ru";
  switch (r.id) {
    case "env_exposure":
      return {
        title: r.title[lang],
        why: ru ? "Файл .env с секретами отдаётся веб-сервером любому посетителю." : "A .env file with secrets is served to any visitor.",
        how: ru
          ? "Удали .env из публичной папки сборки (public/, dist/, out/). Секреты держи в переменных окружения хостинга; в .gitignore добавь .env."
          : "Remove .env from the published build folder (public/, dist/, out/). Keep secrets in hosting env vars; add .env to .gitignore.",
      };
    case "git_exposure":
      return {
        title: r.title[lang],
        why: ru ? "Каталог .git доступен по сети - историю репозитория можно скачать." : "The .git directory is downloadable - the whole repo history leaks.",
        how: ru ? "Запрети отдачу .git в конфиге сервера/хостинга (у Vercel/Netlify это по умолчанию закрыто - проверь, не заливается ли .git в сборку)." : "Block .git in the server/hosting config (Vercel/Netlify do it by default - check .git is not copied into the build).",
      };
    case "secrets_in_source":
      return {
        title: r.title[lang],
        why: ru ? "Ключи API зашиты в HTML/JS - всё, что видно браузеру, видно и злоумышленнику." : "API keys are embedded in HTML/JS - anything the browser sees, an attacker sees.",
        how: ru
          ? "Ротируй скомпрометированные ключи у провайдеров немедленно. Серверные ключи (sk_live_, sk-proj-) перенеси на бэкенд/edge-функции; в клиенте оставляй только публичные (pk_, Firebase anon)."
          : "Rotate the leaked keys with the providers immediately. Move server-side keys (sk_live_, sk-proj-) to backend/edge functions; only public values (pk_, Firebase anon) may stay in the client.",
      };
    case "security_headers":
      return {
        title: r.title[lang],
        why: ru ? "Не хватает защитных заголовков: CSP, nosniff, frame-ancestors." : "Missing security headers: CSP, nosniff, frame protections.",
        how: ru ? `Добавь блок заголовков в конфиг хостинга (пример ниже) или в middleware.` : "Add the headers block to the hosting config (snippet below) or middleware.",
      };
    case "cors_wildcard":
      return {
        title: r.title[lang],
        why: ru ? "CORS открыт для любого Origin (Access-Control-Allow-Origin: *)." : "CORS allows any origin (Access-Control-Allow-Origin: *).",
        how: ru
          ? "Замени «*» на явный список доменов: если API используют только твои страницы - задай точный Origin; для публичного API без cookie «*» допустим, но тогда не отдавай учётные данные."
          : "Replace '*' with an explicit origin list: if only your pages call the API, set the exact Origin; a public cookie-less API may keep '*'.",
      };
    case "cookie_flags":
      return {
        title: r.title[lang],
        why: ru ? "Cookie без HttpOnly/Secure/SameSite доступны скриптам и CSRF." : "Cookies without HttpOnly/Secure/SameSite are readable by scripts and CSRF-prone.",
        how: ru ? "Ставь флаги при выдаче cookie: HttpOnly; Secure; SameSite=Lax (или Strict для сессионных)." : "Set flags when issuing cookies: HttpOnly; Secure; SameSite=Lax (Strict for session cookies).",
      };
    case "tls_cert":
      return {
        title: r.title[lang],
        why: ru ? "Проблемы с HTTPS/TLS-сертификатом." : "HTTPS/TLS certificate problem.",
        how: ru ? "Включи HTTPS: Let's Encrypt/Caddy или TLS хостинга; добавь редирект с http на https и HSTS." : "Enable HTTPS: Let's Encrypt/Caddy or hosting TLS; redirect http to https and add HSTS.",
      };
    case "admin_exposure":
      return {
        title: r.title[lang],
        why: ru ? "Панель администратора открыта на стандартных путях без ограничений." : "Admin panel is reachable on standard paths without restrictions.",
        how: ru
          ? "Закрой админку: Basic-auth/IP-allowlist перед ней, сильный пароль + 2FA, rate limit на попытки входа; путь по умолчанию смени."
          : "Protect the admin: Basic-auth/IP allowlist in front, strong password + 2FA, login rate limit; move the default path.",
      };
    case "backup_files":
      return {
        title: r.title[lang],
        why: ru ? "Дампы БД/бэкапы лежат по прямым ссылкам - мгновенная утечка всех данных." : "DB dumps/backups sit at direct URLs - an instant leak of all data.",
        how: ru ? "Удали файлы из веб-корня и храни бэкапы вне публичного хостинга (S3 с приватным доступом)." : "Remove the files from the web root; store backups off the public host (private S3 bucket).",
      };
    case "debug_endpoints":
      return {
        title: r.title[lang],
        why: ru ? "Отладочные эндпоинты отвечают на проде и отдают служебную информацию." : "Debug endpoints respond in production and leak internals.",
        how: ru ? "Удали /api/debug и подобные, или закрой их авторизацией/переменной окружения (NODE_ENV=production)." : "Remove /api/debug and friends, or gate them behind auth/an env flag (NODE_ENV=production).",
      };
    case "broken_links":
      return {
        title: r.title[lang],
        why: ru ? "Внутренние ссылки ведут на несуществующие страницы." : "Internal links lead to non-existent pages.",
        how: ru ? "Исправь или удали битые маршруты; проверь, что страницы из меню существуют." : "Fix or remove the dead routes; make sure menu pages exist.",
      };
    case "placeholder_content":
      return {
        title: r.title[lang],
        why: ru ? "На живом сайте остались тексты-заглушки." : "Placeholder texts remain on the live site.",
        how: ru ? "Замени lorem ipsum/«Coming soon» на реальный контент или скрой незаконченные разделы." : "Replace lorem ipsum/'Coming soon' with real content or hide unfinished sections.",
      };
    case "rendered_errors":
      return {
        title: r.title[lang],
        why: ru ? "В разметку просачиваются «undefined»/«NaN» - где-то рендерятся необработанные данные." : "'undefined'/'NaN' leak into markup - unhandled values are rendered somewhere.",
        how: ru ? "Найди компоненты, рендерящие необработанные значения, и добавь проверки/дефолты." : "Find the components rendering raw values and add guards/defaults.",
      };
    case "meta_health":
      return {
        title: r.title[lang],
        why: ru ? "Пустые title/description - приложение невидимо для поисковиков и мессенджеров." : "Empty title/description - invisible to search engines and messengers.",
        how: ru ? "Добавь осмысленные <title> и <meta name=description> на главную." : "Add a meaningful <title> and <meta name=description> to the homepage.",
      };
    default:
      return null;
  }
}

export function buildFixPrompt(scan: ScanResult, lang: "ru" | "en"): string {
  const ru = lang === "ru";
  const bad = scan.results.filter((r) => r.status === "fail" || r.status === "warn");
  const L: string[] = [];

  if (ru) {
    L.push(`Ты ИИ-агент, дорабатывающий веб-приложение. Сайт: ${scan.host}${scan.platform ? ` (платформа: ${scan.platform})` : ""}.`);
    L.push(`Независимый сканер AppSeal поставил оценку ${scan.grade} (${scan.score}/100). Ниже - все найденные проблемы.`);
    L.push(`Исправь их по списку. Если правишь конфиги хостинга - используй готовые сниппеты. Отвечай патчами/диффами и краткими пояснениями.`);
    L.push("", `## Проблемы (${bad.length})`);
  } else {
    L.push(`You are an AI agent improving a web application. Site: ${scan.host}${scan.platform ? ` (platform: ${scan.platform})` : ""}.`);
    L.push(`The independent AppSeal scanner graded it ${scan.grade} (${scan.score}/100). All findings follow.`);
    L.push(`Fix them one by one. When editing hosting configs, use the ready snippets. Reply with patches/diffs and short explanations.`);
    L.push("", `## Findings (${bad.length})`);
  }

  bad.forEach((r, i) => {
    const fix = fixFor(r, lang);
    L.push("", `### ${i + 1}. ${r.title[lang]} [${r.status}, ${r.severity}]`);
    if (!fix) return;
    L.push(`- ${ru ? "Что" : "What"}: ${fix.why}`);
    L.push(`- ${ru ? "Как чинить" : "How to fix"}: ${fix.how}`);
    if (r.finding?.evidence.length) {
      L.push(`- ${ru ? "Доказательства" : "Evidence"}:`);
      for (const e of r.finding.evidence.slice(0, 4)) L.push("  ```", `  ${e}`, "  ```");
    }
  });

  const headersNeeded = bad.some((r) => r.id === "security_headers");
  if (headersNeeded) {
    const snip = platformSnippet(scan.platform);
    L.push("", ru ? `## Готовый блок заголовков (${snip.label})` : `## Ready headers block (${snip.label})`);
    L.push("```", snip.code, "```");
    L.push(
      ru
        ? "Проверь после деплоя тем же сканером: класс A достижим одним коммитом конфигов."
        : "Re-scan after deploying: grade A is one config commit away.",
    );
  }
  return L.join("\n");
}
