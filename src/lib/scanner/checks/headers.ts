import type { CheckResult, Severity } from "../types";
import { safeFetch, tlsInfo } from "../fetcher";

interface Ctx {
  origin: string;
  host: string;
  homeBody: string;
  homeHeaders: Record<string, string>;
  isHttp: boolean;
  /** prefix for path probes (the built-in demo target lives under /api/demo-target) */
  basePath?: string;
  /** final URL after redirects differs from the requested one */
  finalUrl?: string;
}

const done = (
  id: string,
  status: CheckResult["status"],
  severity: Severity,
  penalty: number,
  title: CheckResult["title"],
  finding?: CheckResult["finding"],
  durationMs = 0,
): CheckResult => ({ id, category: "headers", status, severity, penalty, title, durationMs, finding });

/* ------------------------------------------------------------------ */
/* Single security headers (one check per header)                      */
/* ------------------------------------------------------------------ */

const SINGLE_HEADERS: {
  id: string;
  name: string;
  label: { ru: string; en: string };
  sev: Severity;
  pen: number;
  httpsOnly?: boolean;
  why: { ru: string; en: string };
}[] = [
  {
    id: "hdr_csp",
    name: "content-security-policy",
    label: { ru: "CSP", en: "CSP" },
    sev: "medium",
    pen: 8,
    why: {
      ru: "Content-Security-Policy - главный щит от XSS: ограничивает, откуда грузятся скрипты и куда уходят данные.",
      en: "Content-Security-Policy is the main XSS shield: it restricts where scripts load from and where data goes.",
    },
  },
  {
    id: "hdr_hsts",
    name: "strict-transport-security",
    label: { ru: "HSTS", en: "HSTS" },
    sev: "low",
    pen: 3,
    httpsOnly: true,
    why: {
      ru: "Strict-Transport-Security запрещает браузеру ходить на сайт по http:// - защита от даунгрейда и перехвата в открытых сетях.",
      en: "Strict-Transport-Security stops the browser from ever using http:// on this site - downgrade and hotspot interception protection.",
    },
  },
  {
    id: "hdr_xcto",
    name: "x-content-type-options",
    label: { ru: "X-Content-Type-Options", en: "X-Content-Type-Options" },
    sev: "low",
    pen: 3,
    why: {
      ru: "X-Content-Type-Options: nosniff запрещает браузеру угадывать тип файла - без него загруженный файл можно исполнить как скрипт.",
      en: "X-Content-Type-Options: nosniff stops the browser from guessing file types - without it an uploaded file can be executed as a script.",
    },
  },
  {
    id: "hdr_xfo",
    name: "x-frame-options",
    label: { ru: "X-Frame-Options", en: "X-Frame-Options" },
    sev: "low",
    pen: 3,
    why: {
      ru: "X-Frame-Options запрещает встраивание сайта в iframe на чужом домене - базовая защита от кликджекинга.",
      en: "X-Frame-Options forbids embedding your site in an iframe on another domain - basic clickjacking protection.",
    },
  },
  {
    id: "hdr_referrer",
    name: "referrer-policy",
    label: { ru: "Referrer-Policy", en: "Referrer-Policy" },
    sev: "low",
    pen: 2,
    why: {
      ru: "Referrer-Policy ограничивает передачу внешних адресов в Referer - без него внутренние URL с токенами утекают на сторонние сайты.",
      en: "Referrer-Policy limits what external URLs leak via Referer - without it internal URLs with tokens leak to third-party sites.",
    },
  },
  {
    id: "hdr_permissions",
    name: "permissions-policy",
    label: { ru: "Permissions-Policy", en: "Permissions-Policy" },
    sev: "low",
    pen: 3,
    why: {
      ru: "Permissions-Policy ограничивает доступ к камере, микрофону и геолокации - без него сторонние скрипты и iframe могут запрашивать чувствительные API.",
      en: "Permissions-Policy restricts camera, microphone and geolocation - without it third-party scripts and iframes can request sensitive APIs.",
    },
  },
];

export async function checkSecurityHeaders(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const out: CheckResult[] = [];
  for (const h of SINGLE_HEADERS) {
    if (h.httpsOnly && ctx.isHttp) {
      out.push(done(h.id, "skip", h.sev, 0, {
        ru: `${h.label.ru}: пропущено (сайт по http)`,
        en: `${h.label.en}: skipped (site over http)`,
      }, undefined, Date.now() - t0));
      continue;
    }
    if (!ctx.homeHeaders[h.name]) {
      out.push(done(h.id, "warn", h.sev, h.pen, {
        ru: `Заголовок ${h.label.ru} не установлен`,
        en: `${h.label.en} header is not set`,
      }, {
        code: "HEADER_MISSING",
        detail: h.why,
        evidence: [`missing: ${h.name}`],
      }, Date.now() - t0));
    } else {
      out.push(done(h.id, "pass", h.sev, 0, {
        ru: `${h.label.ru} установлен`,
        en: `${h.label.en} is set`,
      }, undefined, Date.now() - t0));
    }
  }

  // CSP quality: unsafe-inline / unsafe-eval weaken the policy to near-nothing
  const csp = ctx.homeHeaders["content-security-policy"] ?? "";
  if (csp) {
    if (/unsafe-inline|unsafe-eval/i.test(csp)) {
      out.push(done("hdr_csp_quality", "warn", "low", 3, {
        ru: "CSP ослаблен unsafe-inline/unsafe-eval",
        en: "CSP weakened by unsafe-inline/unsafe-eval",
      }, {
        code: "CSP_UNSAFE",
        detail: {
          ru: "В CSP есть unsafe-inline или unsafe-eval: произвольный inline-скрипт исполняется, даже если список источников строгий. Лучше nonce или хэши.",
          en: "CSP contains unsafe-inline or unsafe-eval: arbitrary inline scripts run even with a strict source list. Prefer nonces or hashes.",
        },
        evidence: [truncate(csp, 160)],
      }, Date.now() - t0));
    } else {
      out.push(done("hdr_csp_quality", "pass", "low", 0, {
        ru: "CSP строгий (без unsafe-inline/eval)",
        en: "CSP is strict (no unsafe-inline/eval)",
      }, undefined, Date.now() - t0));
    }
  }

  // frame-ancestors: CSP can replace X-Frame-Options; check either exists
  if (!ctx.homeHeaders["x-frame-options"] && csp && !/frame-ancestors/i.test(csp)) {
    out.push(done("hdr_frame_ancestors", "warn", "low", 2, {
      ru: "Нет ни X-Frame-Options, ни CSP frame-ancestors",
      en: "Neither X-Frame-Options nor CSP frame-ancestors",
    }, {
      code: "NO_FRAMING_PROTECTION",
      detail: {
        ru: "Сайт можно встроить в iframe с любого домена: кликджекинг, фейковые обёртки, перехват кликов.",
        en: "The site can be iframed from any domain: clickjacking, fake wrappers, click interception.",
      },
      evidence: [],
    }, Date.now() - t0));
  } else if (ctx.homeHeaders["x-frame-options"] || /frame-ancestors/i.test(csp)) {
    out.push(done("hdr_frame_ancestors", "pass", "low", 0, {
      ru: "Защита от встраивания в iframe настроена",
      en: "Framing protection is configured",
    }, undefined, Date.now() - t0));
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Modern cross-origin isolation headers (COOP / COEP / CORP)          */
/* ------------------------------------------------------------------ */

const ISO_HEADERS: { id: string; name: string; label: string; pen: number }[] = [
  { id: "hdr_coop", name: "cross-origin-opener-policy", label: "COOP", pen: 2 },
  { id: "hdr_coep", name: "cross-origin-embedder-policy", label: "COEP", pen: 0 },
  { id: "hdr_corp", name: "cross-origin-resource-policy", label: "CORP", pen: 0 },
];

export async function checkIsolationHeaders(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  return ISO_HEADERS.map((h) => {
    const has = Boolean(ctx.homeHeaders[h.name]);
    if (has) {
      return done(h.id, "pass", "low", 0, {
        ru: `${h.label} установлен`,
        en: `${h.label} is set`,
      }, undefined, Date.now() - t0);
    }
    return done(h.id, h.pen ? "warn" : "info", "low", h.pen, {
      ru: `Заголовок ${h.label} не установлен`,
      en: `${h.label} header is not set`,
    }, {
      code: "ISOLATION_HEADER_MISSING",
      detail: {
        ru: "Cross-Origin-Opener-Policy / Embedder-Policy / Resource-Policy изолируют окно браузера от чужих сайтов: защита от атак через window.opener, Spectre и похищение ресурсов.",
        en: "Cross-Origin-Opener-Policy / Embedder-Policy / Resource-Policy isolate the browser window from foreign sites: protection against window.opener attacks, Spectre and resource theft.",
      },
      evidence: [`missing: ${h.name}`],
    }, Date.now() - t0);
  });
}

/* ------------------------------------------------------------------ */
/* Deprecated / leaky headers                                          */
/* ------------------------------------------------------------------ */

export async function checkLeakyHeaders(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const out: CheckResult[] = [];

  // X-XSS-Protection is deprecated and ignored by modern browsers; its
  // presence signals an old config but hurts nothing - info only
  const xss = ctx.homeHeaders["x-xss-protection"];
  out.push(done("hdr_xss_protection", xss ? "info" : "pass", "low", 0, {
    ru: xss ? "X-XSS-Protection устарел (браузеры его игнорируют)" : "Устаревший X-XSS-Protection не используется",
    en: xss ? "X-XSS-Protection is deprecated (browsers ignore it)" : "No deprecated X-XSS-Protection header",
  }, undefined, Date.now() - t0));

  const server = ctx.homeHeaders["server"] ?? "";
  if (server && /\d+\.\d+/.test(server) && !/cloudflare/i.test(server)) {
    out.push(done("hdr_server_version", "warn", "low", 3, {
      ru: "Server раскрывает версию веб-сервера",
      en: "Server header reveals web server version",
    }, {
      code: "SERVER_VERSION",
      detail: {
        ru: "Точная версия веб-сервера в заголовке Server помогает атакующему подобрать готовый эксплойт. Скройте версию (server_tokens off в nginx).",
        en: "The exact web server version in the Server header helps attackers pick a ready-made exploit. Hide it (server_tokens off in nginx).",
      },
      evidence: [`Server: ${truncate(server, 60)}`],
    }, Date.now() - t0));
  } else {
    out.push(done("hdr_server_version", "pass", "low", 0, {
      ru: "Версия веб-сервера не раскрывается",
      en: "Web server version is not disclosed",
    }, undefined, Date.now() - t0));
  }

  const poweredBy = ctx.homeHeaders["x-powered-by"] ?? "";
  const aspnet = ctx.homeHeaders["x-aspnet-version"] ?? "";
  if (poweredBy || aspnet) {
    out.push(done("hdr_powered_by", "warn", "low", 3, {
      ru: "X-Powered-By раскрывает технологию бэкенда",
      en: "X-Powered-By reveals backend technology",
    }, {
      code: "POWERED_BY",
      detail: {
        ru: "Заголовок X-Powered-By / X-AspNet-Version называет фреймворк и его версию - отправная точка для поиска известных уязвимостей. Уберите его из конфигурации.",
        en: "The X-Powered-By / X-AspNet-Version header names the framework and version - a starting point for known-CVE searches. Remove it from the config.",
      },
      evidence: [
        poweredBy ? `X-Powered-By: ${truncate(poweredBy, 60)}` : "",
        aspnet ? `X-AspNet-Version: ${aspnet}` : "",
      ].filter(Boolean),
    }, Date.now() - t0));
  } else {
    out.push(done("hdr_powered_by", "pass", "low", 0, {
      ru: "Технология бэкенда не раскрывается",
      en: "Backend technology is not disclosed",
    }, undefined, Date.now() - t0));
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* CORS                                                                */
/* ------------------------------------------------------------------ */

export async function checkCors(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const evil = "https://evil.example";
  const r = await safeFetch(ctx.origin + (ctx.basePath ?? "") + "/", {
    headers: { origin: evil },
    timeoutMs: 6000,
  });
  const acao = r.headers["access-control-allow-origin"];
  const acac = r.headers["access-control-allow-credentials"];
  const out: CheckResult[] = [];

  if (acao === "*") {
    out.push(done("cors_wildcard", "warn", "medium", 8, {
      ru: "CORS открыт всем источникам (*)",
      en: "CORS allows all origins (*)",
    }, {
      code: "CORS_WILDCARD",
      detail: {
        ru: "Access-Control-Allow-Origin: * разрешает любому сайту читать ответы из браузера посетителя. Для публичных данных не критично, для личных - утечка.",
        en: "Access-Control-Allow-Origin: * lets any website read responses from the visitor's browser. Fine for public data, a leak for personal data.",
      },
      evidence: [`Access-Control-Allow-Origin: ${acao}`],
    }, Date.now() - t0));
  } else if (acao === evil) {
    const critical = acac === "true";
    out.push(done("cors_wildcard", critical ? "fail" : "warn", critical ? "high" : "medium", critical ? 15 : 8, {
      ru: "CORS отражает произвольный Origin",
      en: "CORS reflects arbitrary Origin",
    }, {
      code: acac === "true" ? "CORS_REFLECT_CREDS" : "CORS_REFLECT",
      detail: {
        ru: acac === "true"
          ? "Сервер отражает произвольный Origin и разрешает cookie-credentials: любой сайт может читать ответы от имени залогиненного пользователя."
          : "Сервер отражает произвольный Origin в Access-Control-Allow-Origin - признак небрежной CORS-конфигурации.",
        en: acac === "true"
          ? "The server reflects an arbitrary Origin with allow-credentials: any website can read responses as the logged-in user."
          : "The server reflects an arbitrary Origin in Access-Control-Allow-Origin - a sign of sloppy CORS configuration.",
      },
      evidence: [
        `Access-Control-Allow-Origin: ${acao}`,
        acac ? `Access-Control-Allow-Credentials: ${acac}` : "",
      ].filter(Boolean),
    }, Date.now() - t0));
  } else {
    out.push(done("cors_wildcard", "pass", "medium", 0, {
      ru: "CORS не открыт для всех",
      en: "CORS is not open to all origins",
    }, undefined, Date.now() - t0));
  }

  // SameSite=None without Secure - cookie can travel over plain http
  const rawCookies = (ctx.homeHeaders["set-cookie"] ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  const badNone = rawCookies.filter((c) => /samesite\s*=\s*none/i.test(c) && !/;\s*secure/i.test(c));
  out.push(done("cookie_samesite_none", badNone.length ? "warn" : "pass", "medium", badNone.length ? 6 : 0, {
    ru: badNone.length ? "SameSite=None без Secure" : "SameSite=None cookie корректны",
    en: badNone.length ? "SameSite=None without Secure" : "SameSite=None cookies are correct",
  }, badNone.length ? {
    code: "SAMESITE_NONE_INSECURE",
    detail: {
      ru: "SameSite=None разрешает отправку cookie с чужих сайтов, а без Secure они могут уйти по http:// - комбинация, облегчающая CSRF и перехват.",
      en: "SameSite=None allows sending cookies from foreign sites, and without Secure they can travel over http:// - a combination that eases CSRF and interception.",
    },
    evidence: badNone.slice(0, 3).map((c) => truncate(`Set-Cookie: ${c}`, 120)),
  } : undefined, Date.now() - t0));

  return out;
}

/* ------------------------------------------------------------------ */
/* Cookie flags (one check per flag)                                   */
/* ------------------------------------------------------------------ */

const SESSION_NAME = /(?:session|sess|sid|token|auth|jwt|login|csrf|remember)/i;

export async function checkCookies(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const raw = ctx.homeHeaders["set-cookie"];
  if (!raw) {
    return [done("cookie_flags", "info", "low", 0, {
      ru: "Cookies не установлены на главной",
      en: "No cookies set on the homepage",
    }, undefined, Date.now() - t0)];
  }
  const cookies = raw.split("\n").map((s) => s.trim()).filter(Boolean);
  const session = cookies.filter((c) => SESSION_NAME.test((c.split("=")[0] ?? "").trim()));

  const mk = (id: string, missing: boolean, flag: string, why: { ru: string; en: string }, pen: number, sev: Severity): CheckResult =>
    done(id, session.length && missing ? "warn" : "pass", sev, session.length && missing ? pen : 0, {
      ru: session.length && missing ? `Сессионные cookie без ${flag}` : `Флаг ${flag} в порядке`,
      en: session.length && missing ? `Session cookies missing ${flag}` : `${flag} flag is OK`,
    }, session.length && missing ? {
      code: "COOKIE_FLAGS",
      detail: why,
      evidence: session.slice(0, 3).map((c) => truncate(`Set-Cookie: ${c}`, 100)),
    } : undefined, Date.now() - t0);

  return [
    mk("cookie_secure", session.some((c) => !/secure/i.test(c)), "Secure", {
      ru: "Cookie без Secure может уйти по открытому http:// в общественной сети.",
      en: "A cookie without Secure may travel over plain http:// on a public network.",
    }, 4, "medium"),
    mk("cookie_httponly", session.some((c) => !/httponly/i.test(c)), "HttpOnly", {
      ru: "Cookie без HttpOnly читается любым JS-скриптом: один вредоносный скрипт - и сессия украдена.",
      en: "A cookie without HttpOnly is readable by any JS: one malicious script and the session is stolen.",
    }, 4, "medium"),
    mk("cookie_samesite", session.some((c) => !/samesite/i.test(c)), "SameSite", {
      ru: "Cookie без SameSite отправляется с чужих сайтов - классический вектор CSRF.",
      en: "A cookie without SameSite is sent from foreign sites - the classic CSRF vector.",
    }, 3, "low"),
  ];
}

/* ------------------------------------------------------------------ */
/* TLS certificate                                                     */
/* ------------------------------------------------------------------ */

export async function checkTls(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const out: CheckResult[] = [];

  if (ctx.isHttp) {
    out.push(done("tls_valid", "fail", "high", 15, {
      ru: "Нет HTTPS",
      en: "No HTTPS",
    }, {
      code: "NO_HTTPS",
      detail: {
        ru: "Сайт работает по http:// - весь трафик, включая пароли и токены, идёт открытым текстом. Бесплатный сертификат Let's Encrypt ставится за минуты.",
        en: "The site runs on http:// - all traffic, including passwords and tokens, travels in plain text. A free Let's Encrypt certificate takes minutes to install.",
      },
      evidence: [`target: ${ctx.origin}`],
    }, Date.now() - t0));
    return out;
  }

  const port = parseInt(new URL(ctx.origin).port, 10) || 443;
  const info = await tlsInfo(ctx.host, port);
  if (!info.available) {
    out.push(done("tls_valid", "skip", "info", 0, {
      ru: "TLS-сертификат не удалось проверить",
      en: "TLS certificate could not be checked",
    }, undefined, Date.now() - t0));
    return out;
  }
  const days = info.daysLeft ?? 999;
  out.push(done("tls_valid", days < 0 ? "fail" : "pass", days < 0 ? "critical" : "medium", days < 0 ? 35 : 0, {
    ru: days < 0 ? "TLS-сертификат истёк" : `TLS-сертификат валиден (${days} дн.)`,
    en: days < 0 ? "TLS certificate expired" : `TLS certificate valid (${days} d)`,
  }, days < 0 ? {
    code: "TLS_EXPIRED",
    detail: {
      ru: "Сертификат просрочен - браузеры показывают страшный красный экран, часть пользователей уходит навсегда.",
      en: "The certificate is expired - browsers show a red warning screen and some users never come back.",
    },
    evidence: [`valid_to: ${info.validTo}`],
  } : undefined, Date.now() - t0));

  if (days >= 0 && days < 14) {
    out.push(done("tls_expiry_soon", "warn", "medium", 8, {
      ru: "TLS-сертификат скоро истечёт",
      en: "TLS certificate expiring soon",
    }, {
      code: "TLS_EXPIRING",
      detail: {
        ru: `До истечения сертификата ${days} дн. Классическая смерть заброшенного приложения: домен жив, сертификат протух, пользователи бегут.`,
        en: `Certificate expires in ${days} days. The classic death of an abandoned app: domain alive, certificate rotten, users fleeing.`,
      },
      evidence: [`valid_to: ${info.validTo}`, `days_left: ${days}`],
    }, Date.now() - t0));
  } else if (days >= 14) {
    out.push(done("tls_expiry_soon", "pass", "medium", 0, {
      ru: `Сертификат не истекает в ближайшие 2 недели (${days} дн.)`,
      en: `Certificate does not expire within 2 weeks (${days} d)`,
    }, undefined, Date.now() - t0));
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* HTTPS enforcement & canonical host                                  */
/* ------------------------------------------------------------------ */

export async function checkHttpsRedirects(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const out: CheckResult[] = [];

  if (!ctx.isHttp) {
    // probe the plain-http twin: it must redirect to https, not serve content
    const httpUrl = ctx.origin.replace(/^https:/, "http:");
    const r = await safeFetch(httpUrl + (ctx.basePath ?? "") + "/", { timeoutMs: 6000, maxBody: 2048 });
    const landsHttps = r.ok && (r.url ?? "").startsWith("https://");
    if (r.ok && r.status === 200 && !landsHttps) {
      out.push(done("https_enforced", "warn", "medium", 6, {
        ru: "http:// версия отдаёт контент без редиректа",
        en: "http:// version serves content without redirect",
      }, {
        code: "NO_HTTPS_REDIRECT",
        detail: {
          ru: "Открытая http://-версия отвечает 200. Посетитель, набравший адрес без https, попадает на незашифрованную копию. Настройте 301-редирект на https.",
          en: "The plain http:// version responds 200. A visitor typing the bare address lands on an unencrypted copy. Set up a 301 redirect to https.",
        },
        evidence: [`http probe status: ${r.status}`],
      }, Date.now() - t0));
    } else {
      out.push(done("https_enforced", "pass", "medium", 0, {
        ru: "http:// редиректит на https://",
        en: "http:// redirects to https://",
      }, undefined, Date.now() - t0));
    }

    // canonical host: www and apex must not both serve content
    const host = new URL(ctx.origin).hostname;
    const alt = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
    const altUrl = ctx.origin.replace(`://${host}`, `://${alt}`);
    const ra = await safeFetch(altUrl + "/", { timeoutMs: 6000, maxBody: 2048 });
    // safeFetch follows redirects: the alt host only "serves as a mirror" when
    // the FINAL url still sits on the alt hostname (a 308 to the canonical
    // host lands there instead)
    let finalHost = "";
    try {
      finalHost = new URL(ra.url || altUrl).hostname;
    } catch {
      finalHost = "";
    }
    const altServes = ra.ok && ra.status === 200 && finalHost === alt;
    out.push(done("host_canonical", altServes ? "warn" : "pass", "low", altServes ? 2 : 0, {
      ru: altServes ? "www и без www отвечают как разные сайты" : "Канонический хост настроен",
      en: altServes ? "www and apex serve as different sites" : "Canonical host is configured",
    }, altServes ? {
      code: "HOST_MIRROR",
      detail: {
        ru: "Обе версии хоста (с www и без) отдают контент без редиректа: поисковики видят дубли, cookie и кэш живут раздельно. Настройте 301 на основной.",
        en: "Both host versions (with and without www) serve content without redirect: search engines see duplicates, cookies and caches split. Set a 301 to the canonical one.",
      },
      evidence: [`alt host serves content: ${alt} (final: ${finalHost})`],
    } : undefined, Date.now() - t0));
  } else {
    out.push(done("https_enforced", "skip", "info", 0, {
      ru: "HTTPS-редирект не проверялся (сайт по http)",
      en: "HTTPS redirect not checked (site over http)",
    }, undefined, Date.now() - t0));
    out.push(done("host_canonical", "skip", "info", 0, {
      ru: "Канонический хост не проверялся (сайт по http)",
      en: "Canonical host not checked (site over http)",
    }, undefined, Date.now() - t0));
  }

  // redirect chain: the final URL differs from the requested one
  if (ctx.finalUrl) {
    try {
      const from = new URL(ctx.finalUrl).host + new URL(ctx.finalUrl).pathname.replace(/\/+$/, "");
      const to = ctx.host + "/";
      if (from !== to.replace(/\/+$/, "") && from !== ctx.host) {
        out.push(done("redirect_chain", "info", "low", 0, {
          ru: "Главная отдаётся после редиректа",
          en: "Homepage is served after a redirect",
        }, {
          code: "REDIRECT_CHAIN",
          detail: {
            ru: "Запрошенный адрес и финальный различаются - лишний hop замедляет загрузку и путает кэш. Ссылайтесь сразу на финальный URL.",
            en: "The requested and final URLs differ - an extra hop slows loading and splits caches. Link straight to the final URL.",
          },
          evidence: [`final: ${ctx.finalUrl}`],
        }, Date.now() - t0));
      } else {
        out.push(done("redirect_chain", "pass", "low", 0, {
          ru: "Главная отдаётся без лишних редиректов",
          en: "Homepage served without extra redirects",
        }, undefined, Date.now() - t0));
      }
    } catch {
      out.push(done("redirect_chain", "skip", "info", 0, {
        ru: "Редирект-цепочка не определена",
        en: "Redirect chain undetermined",
      }, undefined, Date.now() - t0));
    }
  } else {
    out.push(done("redirect_chain", "pass", "low", 0, {
      ru: "Главная отдаётся без лишних редиректов",
      en: "Homepage served without extra redirects",
    }, undefined, Date.now() - t0));
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Transport hygiene: compression & caching                            */
/* ------------------------------------------------------------------ */

export async function checkTransportHygiene(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const out: CheckResult[] = [];

  // compression: request with br/gzip and see what comes back
  const r = await safeFetch(ctx.origin + (ctx.basePath ?? "") + "/", {
    headers: { "accept-encoding": "gzip, deflate, br" },
    timeoutMs: 6000,
    maxBody: 4096,
  });
  const enc = (r.headers["content-encoding"] ?? "").toLowerCase();
  out.push(done(
    "compression",
    enc.includes("br") || enc.includes("gzip") ? "pass" : "warn",
    "low",
    enc.includes("br") || enc.includes("gzip") ? 0 : 2,
    {
      ru: enc.includes("br") || enc.includes("gzip") ? "HTML сжимается на лету" : "HTML не сжимается",
      en: enc.includes("br") || enc.includes("gzip") ? "HTML is compressed" : "HTML is not compressed",
    },
    enc.includes("br") || enc.includes("gzip") ? undefined : {
      code: "NO_COMPRESSION",
      detail: {
        ru: "Ответ главной идёт без gzip/brotli: страницы грузятся медленнее на мобильных сетях. На Vercel/Cloudflare сжатие включено по умолчанию - его явно отключили.",
        en: "The homepage response has no gzip/brotli: pages load slower on mobile networks. Vercel/Cloudflare compress by default - it was turned off explicitly.",
      },
      evidence: ["content-encoding: -"],
    },
    Date.now() - t0,
  ));

  const cc = ctx.homeHeaders["cache-control"] ?? "";
  out.push(done("cache_control_home", cc ? "pass" : "info", "low", 0, {
    ru: cc ? "Cache-Control задан" : "Cache-Control не задан",
    en: cc ? "Cache-Control is set" : "Cache-Control is not set",
  }, undefined, Date.now() - t0));

  return out;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
