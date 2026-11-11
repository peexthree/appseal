import type { CheckResult, Severity } from "../types";
import { safeFetch, tlsInfo, truncate } from "../fetcher";

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
): CheckResult => ({ id, category: "headers", status, severity, penalty, title, durationMs, finding });

/* ------------------------------------------------------------------ */
/* Security headers                                                    */
/* ------------------------------------------------------------------ */

const HEADERS: { name: string; label: { ru: string; en: string }; sev: Severity; pen: number; httpsOnly?: boolean }[] = [
  { name: "content-security-policy", label: { ru: "CSP", en: "CSP" }, sev: "medium", pen: 8 },
  { name: "strict-transport-security", label: { ru: "HSTS", en: "HSTS" }, sev: "low", pen: 3, httpsOnly: true },
  { name: "x-content-type-options", label: { ru: "X-Content-Type-Options", en: "X-Content-Type-Options" }, sev: "low", pen: 3 },
  { name: "x-frame-options", label: { ru: "X-Frame-Options", en: "X-Frame-Options" }, sev: "low", pen: 3 },
  { name: "referrer-policy", label: { ru: "Referrer-Policy", en: "Referrer-Policy" }, sev: "low", pen: 2 },
];

export async function checkSecurityHeaders(ctx: Ctx): Promise<CheckResult> {
  const t0 = Date.now();
  const missing: { ru: string; en: string }[] = [];
  for (const h of HEADERS) {
    if (h.httpsOnly && ctx.isHttp) continue;
    if (!ctx.homeHeaders[h.name]) missing.push(h.label);
  }
  if (missing.length) {
    const pen = HEADERS.filter((h) => missing.some((m) => m.en === h.label.en)).reduce(
      (a, h) => a + h.pen,
      0,
    );
    return done(
      "security_headers",
      "warn",
      "medium",
      pen,
      { ru: "Не хватает защитных заголовков", en: "Security headers missing" },
      {
        code: "HEADERS_MISSING",
        detail: {
          ru: "Отсутствуют заголовки: " +
            missing.map((m) => m.ru).join(", ") +
            ". Они дёшево добавляются и закрывают кликджекинг, MIME-sniffing, утечку referrer и часть XSS-векторов.",
          en: "Missing headers: " +
            missing.map((m) => m.en).join(", ") +
            ". They are cheap to add and mitigate clickjacking, MIME-sniffing, referrer leaks and some XSS vectors.",
        },
        evidence: missing.map((m) => `missing: ${m.en}`),
      },
      Date.now() - t0,
    );
  }
  return done("security_headers", "pass", "medium", 0, {
    ru: "Защитные заголовки на месте",
    en: "Security headers are in place",
  }, undefined, Date.now() - t0);
}

/* ------------------------------------------------------------------ */
/* CORS                                                                */
/* ------------------------------------------------------------------ */

export async function checkCors(ctx: Ctx): Promise<CheckResult> {
  const t0 = Date.now();
  const evil = "https://evil.example";
  const r = await safeFetch(ctx.origin + "/", {
    headers: { origin: evil },
    timeoutMs: 6000,
  });
  const acao = r.headers["access-control-allow-origin"];
  const acac = r.headers["access-control-allow-credentials"];
  if (acao && (acao === "*" || acao === evil)) {
    const critical = acao === evil && acac === "true";
    return done(
      "cors_wildcard",
      critical ? "fail" : "warn",
      critical ? "high" : "medium",
      critical ? 15 : 8,
      { ru: "Разрешён CORS для любого источника", en: "CORS allows any origin" },
      {
        code: critical ? "CORS_REFLECT_CREDS" : "CORS_WILDCARD",
        detail: {
          ru: critical
            ? "Сервер отражает произвольный Origin и разрешает cookie-credentials: любой сайт может читать ответы от имени залогиненного пользователя."
            : "Access-Control-Allow-Origin: * разрешает любому сайту читать ответы API из браузера посетителя. Для публичных данных не критично, для личных — утечка.",
          en: critical
            ? "The server reflects an arbitrary Origin with allow-credentials: any website can read responses as the logged-in user."
            : "Access-Control-Allow-Origin: * lets any website read API responses from the visitor's browser. Fine for public data, a leak for personal data.",
        },
        evidence: [`Access-Control-Allow-Origin: ${acao}`, acac ? `Access-Control-Allow-Credentials: ${acac}` : ""].filter(Boolean),
      },
      Date.now() - t0,
    );
  }
  return done("cors_wildcard", "pass", "medium", 0, {
    ru: "CORS не открыт для всех",
    en: "CORS is not open to all origins",
  }, undefined, Date.now() - t0);
}

/* ------------------------------------------------------------------ */
/* Cookies flags                                                       */
/* ------------------------------------------------------------------ */

export async function checkCookies(ctx: Ctx): Promise<CheckResult> {
  const t0 = Date.now();
  const raw = ctx.homeHeaders["set-cookie"];
  if (!raw) {
    return done("cookie_flags", "info", "low", 0, {
      ru: "Cookies не установлены на главной",
      en: "No cookies set on the homepage",
    }, undefined, Date.now() - t0);
  }
  const problems: string[] = [];
  if (!/httponly/i.test(raw)) problems.push("HttpOnly");
  if (!/secure/i.test(raw) && !ctx.isHttp) problems.push("Secure");
  if (!/samesite/i.test(raw)) problems.push("SameSite");
  const name = raw.split("=")[0];
  if (problems.length) {
    return done(
      "cookie_flags",
      "warn",
      "medium",
      problems.length * 3,
      { ru: "Cookie без защитных флагов", en: "Cookie without protective flags" },
      {
        code: "COOKIE_FLAGS",
        detail: {
          ru: `Cookie «${name}» без: ${problems.join(", ")}. Cookie доступна скриптам, может уйти по http и не защищена от CSRF.`,
          en: `Cookie "${name}" missing: ${problems.join(", ")}. The cookie is script-readable, may travel over http and is not CSRF-protected.`,
        },
        evidence: [`Set-Cookie: ${truncate(raw, 120)}`],
      },
      Date.now() - t0,
    );
  }
  return done("cookie_flags", "pass", "medium", 0, {
    ru: "Флаги cookie в порядке",
    en: "Cookie flags are OK",
  }, undefined, Date.now() - t0);
}

/* ------------------------------------------------------------------ */
/* TLS certificate                                                     */
/* ------------------------------------------------------------------ */

export async function checkTls(ctx: Ctx): Promise<CheckResult> {
  const t0 = Date.now();
  if (ctx.isHttp) {
    return done(
      "tls_cert",
      "fail",
      "high",
      15,
      { ru: "Нет HTTPS", en: "No HTTPS" },
      {
        code: "NO_HTTPS",
        detail: {
          ru: "Сайт работает по http:// — весь трафик, включая пароли и токены, идёт открытым текстом. Бесплатный сертификат Let's Encrypt ставится за минуты.",
          en: "The site runs on http:// — all traffic, including passwords and tokens, travels in plain text. A free Let's Encrypt certificate takes minutes to install.",
        },
        evidence: [`target: ${ctx.origin}`],
      },
      Date.now() - t0,
    );
  }
  const info = await tlsInfo(ctx.host);
  if (!info.available) {
    return done("tls_cert", "skip", "info", 0, {
      ru: "TLS-сертификат не удалось проверить",
      en: "TLS certificate could not be checked",
    }, undefined, Date.now() - t0);
  }
  const days = info.daysLeft ?? 999;
  if (days < 0) {
    return done(
      "tls_cert",
      "fail",
      "critical",
      35,
      { ru: "TLS-сертификат истёк", en: "TLS certificate expired" },
      {
        code: "TLS_EXPIRED",
        detail: {
          ru: "Сертификат просрочен — браузеры показывают страшный красный экран, часть пользователей уходит навсегда.",
          en: "The certificate is expired — browsers show a red warning screen and some users never come back.",
        },
        evidence: [`valid_to: ${info.validTo}`],
      },
      Date.now() - t0,
    );
  }
  if (days < 14) {
    return done(
      "tls_cert",
      "warn",
      "medium",
      8,
      { ru: "TLS-сертификат скоро истечёт", en: "TLS certificate expiring soon" },
      {
        code: "TLS_EXPIRING",
        detail: {
          ru: `До истечения сертификата ${days} дн. Классическая смерть заброшенного приложения: домен жив, сертификат протух, пользователи бегут.`,
          en: `Certificate expires in ${days} days. The classic death of an abandoned app: domain alive, certificate rotten, users fleeing.`,
        },
        evidence: [`valid_to: ${info.validTo}`, `days_left: ${days}`],
      },
      Date.now() - t0,
    );
  }
  return done("tls_cert", "pass", "medium", 0, {
    ru: `TLS-сертификат валиден (${days} дн.)`,
    en: `TLS certificate valid (${days} d)`,
  }, undefined, Date.now() - t0);
}
