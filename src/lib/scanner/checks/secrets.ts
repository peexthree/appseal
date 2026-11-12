import type { CheckResult, Severity } from "../types";
import {
  extractScripts,
  looksLikeDocExample,
  maskSecret,
  safeFetch,
  shannonEntropy,
  truncate,
} from "../fetcher";

interface Ctx {
  origin: string; // e.g. https://example.com
  homeBody: string; // homepage HTML (already fetched)
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
): CheckResult => ({ id, category: "secrets", status, severity, penalty, title, durationMs, finding });

/* ------------------------------------------------------------------ */
/* .env / .git exposure                                                */
/* ------------------------------------------------------------------ */

const ENV_PATHS = ["/.env", "/.env.local", "/.env.production", "/.env.development"];

export async function checkEnvExposure(ctx: Ctx): Promise<CheckResult> {
  const t0 = Date.now();
  const found: string[] = [];
  const evidence: string[] = [];
  for (const p of ENV_PATHS) {
    const r = await safeFetch(ctx.origin + (ctx.basePath ?? "") + p, { timeoutMs: 5000 });
    if (r.ok && r.status === 200 && /^[A-Za-z0-9_]+\s*=/.test(r.body)) {
      found.push(p);
      const firstLine = r.body.split("\n").find((l) => /^[A-Za-z0-9_]+\s*=/.test(l)) ?? "";
      evidence.push(`${p} → ${truncate(firstLine, 80)}`);
    }
  }
  if (found.length) {
    return done(
      "env_exposure",
      "fail",
      "critical",
      40,
      { ru: "Файл .env доступен из интернета", en: ".env file is publicly accessible" },
      {
        code: "ENV_EXPOSED",
        detail: {
          ru: "Файл с переменными окружения (ключи API, пароли БД) отдаётся веб-сервером любому посетителю. Это самая дорогая ошибка вайб-кодинга: злоумышленник получает ключи за 10 секунд.",
          en: "A dot-env file (API keys, DB passwords) is served to any visitor. This is the most expensive vibe-coding mistake: an attacker gets your keys in 10 seconds.",
        },
        evidence,
      },
      Date.now() - t0,
    );
  }
  return done("env_exposure", "pass", "low", 0, {
    ru: "Файлы .env не доступны",
    en: ".env files are not exposed",
  }, undefined, Date.now() - t0);
}

export async function checkGitExposure(ctx: Ctx): Promise<CheckResult> {
  const t0 = Date.now();
  const r = await safeFetch(ctx.origin + (ctx.basePath ?? "") + "/.git/HEAD", { timeoutMs: 5000 });
  if (r.ok && r.status === 200 && r.body.includes("ref: refs/")) {
    return done(
      "git_exposure",
      "fail",
      "critical",
      35,
      { ru: "Папка .git открыта для скачивания", en: ".git directory is publicly downloadable" },
      {
        code: "GIT_EXPOSED",
        detail: {
          ru: "Репозиторий исходного кода доступен по сети: можно скачать всю историю проекта и найти в ней ключи и внутренние адреса.",
          en: "The source repository is downloadable over the network: full project history including keys and internal addresses can be reconstructed.",
        },
        evidence: ["/.git/HEAD → " + truncate(r.body, 60)],
      },
      Date.now() - t0,
    );
  }
  return done("git_exposure", "pass", "medium", 0, {
    ru: "Папка .git не доступна",
    en: ".git directory is not exposed",
  }, undefined, Date.now() - t0);
}

/* ------------------------------------------------------------------ */
/* Secrets in client-side source (HTML + JS bundles)                   */
/* ------------------------------------------------------------------ */

interface Sig {
  name: string;
  re: RegExp;
  sev: Severity;
  pen: number;
  /** structural markers (private key headers) are checked for shape, not entropy */
  structural?: boolean;
}
const SIGNATURES: Sig[] = [
  { name: "OpenAI API key", re: /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g, sev: "critical", pen: 40 },
  { name: "AWS access key", re: /AKIA[0-9A-Z]{16}/g, sev: "critical", pen: 40 },
  { name: "Stripe live secret key", re: /sk_live_[0-9a-zA-Z]{10,}/g, sev: "critical", pen: 40 },
  { name: "SendGrid API key", re: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g, sev: "critical", pen: 40 },
  { name: "Google API key", re: /AIza[0-9A-Za-z_-]{35}/g, sev: "high", pen: 20 },
  { name: "Private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g, sev: "critical", pen: 40, structural: true },
  {
    name: "Supabase service_role key",
    re: /eyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}/g,
    sev: "high",
    pen: 25,
  },
  {
    name: "Generic hardcoded secret",
    re: /(?:api[_-]?key|apikey|secret|password|token)["']?\s*[:=]\s*["'][A-Za-z0-9+/_=-]{20,}["']/gi,
    sev: "medium",
    pen: 8,
  },
];

/** Decode a JWT payload (middle segment, base64url) into a plain object. */
function jwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf-8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Google API keys in client JS are common; Firebase/Supabase anon keys are by design public.
 *  These contexts are flagged only as info. */
function classifyHit(sig: Sig, context: string, hit: string): { sev: Severity; pen: number } {
  if (sig.name === "Google API key" && /firebase|maps|gstatic/i.test(context)) {
    return { sev: "info", pen: 0 };
  }
  if (sig.name === "Supabase service_role key" && /supabase/i.test(context)) {
    // JWT-shaped: only an actual service_role token is dangerous; anon /
    // authenticated tokens are public by design (real risk is tested by the
    // live RLS check in baas_open_read)
    const role = jwtPayload(hit)?.["role"];
    if (role === "anon" || role === "authenticated") return { sev: "info", pen: 0 };
    if (role === "service_role") return { sev: "critical", pen: 40 };
    return { sev: "high", pen: 25 }; // undecodable JWT in supabase context
  }
  return { sev: sig.sev, pen: sig.pen };
}

export async function checkSecretsInSource(ctx: Ctx): Promise<CheckResult> {
  const t0 = Date.now();
  const bundles = extractScripts(ctx.homeBody, ctx.origin, 6);
  const docs: { src: string; body: string }[] = [{ src: "index.html", body: ctx.homeBody }];
  await Promise.all(
    bundles.map(async (u) => {
      const r = await safeFetch(u, { timeoutMs: 6000, maxBody: 500 * 1024 });
      if (r.ok && r.body) docs.push({ src: u.replace(ctx.origin, ""), body: r.body });
    }),
  );
  const hits: { name: string; src: string; masked: string }[] = [];
  let filtered = 0; // v0.2: candidates dropped by entropy/context filters
  for (const doc of docs) {
    for (const sig of SIGNATURES) {
      const m = doc.body.match(sig.re);
      if (!m) continue;
      const uniq = [...new Set(m)].slice(0, 2);
      for (const hit of uniq) {
        const idx = doc.body.indexOf(hit);
        const context = doc.body.slice(Math.max(0, idx - 120), idx + 160);
        // v0.2 filter 0: values public by design - UUID-shaped identifiers
        // (captcha sitekeys, correlation ids) and pk_-prefixed publishable keys
        if (
          sig.name === "Generic hardcoded secret" &&
          (/\b(pk|pub|public)[_-]?key\b/i.test(hit) ||
            /pk_[A-Za-z0-9_-]{10,}/.test(hit) ||
            /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(hit))
        ) {
          filtered++;
          continue;
        }
        // v0.2 filter 1: entropy threshold - a real key looks generated,
        // a marketing/docs string looks like a word
        if (!sig.structural && shannonEntropy(hit) < 3.0) {
          filtered++;
          continue;
        }
        // v0.2 filter 1b: OpenAI keys are pure alphanumeric after the prefix;
        // lowercase-hyphenated bodies are CSS/design tokens (sk-inline-block-color)
        if (sig.name === "OpenAI API key") {
          const body = hit.replace(/^sk-(?:proj-)?/, "");
          if (/^[a-z]+-[a-z-]+$/.test(body)) {
            filtered++;
            continue;
          }
        }
        // v0.2 filter 2: documentation / code-example context
        if (!sig.structural && looksLikeDocExample(hit, context)) {
          filtered++;
          continue;
        }
        const cls = classifyHit(sig, context, hit);
        if (cls.sev === "info") continue;
        hits.push({ name: sig.name, src: doc.src, masked: maskSecret(hit) });
      }
    }
  }
  if (hits.length) {
    const worst = SIGNATURES.filter((s) => hits.some((h) => h.name === s.name)).sort(
      (a, b) => b.pen - a.pen,
    )[0];
    return done(
      "secrets_in_source",
      "fail",
      worst.sev,
      worst.pen,
      { ru: "Секреты в клиентском коде", en: "Secrets in client-side code" },
      {
        code: "SECRETS_IN_SOURCE",
        detail: {
          ru: "Ключи API зашиты в HTML или в JS-бандлы — всё, что видно браузеру, видно и злоумышленнику. Живые ключи нужно немедленно ротировать; серверные секреты переносить на бэкенд/edge-функции.",
          en: "API keys are embedded in HTML or JS bundles — anything the browser can see, an attacker can see. Live keys must be rotated immediately; server secrets moved to backend/edge functions.",
        },
        evidence: hits.slice(0, 6).map((h) => `${h.name} @ ${h.src} → ${h.masked}`),
      },
      Date.now() - t0,
    );
  }
  return done("secrets_in_source", "pass", "high", 0, {
    ru: filtered
      ? `Секретов не найдено (отфильтровано ${filtered} кандидатов из документации/примеров)`
      : "Секретов в клиентском коде не найдено",
    en: filtered
      ? `No secrets (filtered ${filtered} doc/example candidates)`
      : "No secrets found in client-side code",
  }, undefined, Date.now() - t0);
}

/* ------------------------------------------------------------------ */
/* Firebase / Supabase open database read                              */
/* ------------------------------------------------------------------ */

export async function checkBaaSOpenRead(ctx: Ctx): Promise<CheckResult> {
  const t0 = Date.now();
  const allJs = [ctx.homeBody];
  const bundles = extractScripts(ctx.homeBody, ctx.origin, 4);
  await Promise.all(
    bundles.map(async (u) => {
      const r = await safeFetch(u, { timeoutMs: 6000, maxBody: 400 * 1024 });
      if (r.ok && r.body) allJs.push(r.body);
    }),
  );
  const blob = allJs.join("\n");

  // Firebase project id
  const fbId = blob.match(/([a-z0-9][a-z0-9-]{4,28})\.firebaseio\.com/i) ??
    blob.match(/([a-z0-9][a-z0-9-]{4,28})-default-rtdb\.(?:[a-z]{2}\.)?firebaseio\.com/i);
  if (fbId) {
    const bases = [
      `https://${fbId[1]}-default-rtdb.firebaseio.com/.json`,
      `https://${fbId[1]}.firebaseio.com/.json`,
    ];
    for (const b of bases) {
      const r = await safeFetch(b, { timeoutMs: 6000 });
      if (r.ok && r.status === 200 && !/permission denied|Permission denied/.test(r.body)) {
        return done(
          "baas_open_read",
          "fail",
          "critical",
          35,
          { ru: "База Firebase открыта на чтение", en: "Firebase database allows public reads" },
          {
            code: "FIREBASE_OPEN_READ",
            detail: {
              ru: "Правила безопасности Realtime Database разрешают анонимное чтение: содержимое базы (пользователи, заказы, сообщения) скачивается одним GET-запросом.",
              en: "Realtime Database security rules allow anonymous reads: the whole database (users, orders, messages) downloads with a single GET request.",
            },
            evidence: [`${b} → ${truncate(r.body, 90)}`],
          },
          Date.now() - t0,
        );
      }
    }
    return done("baas_open_read", "pass", "critical", 0, {
      ru: "Firebase: публичное чтение закрыто",
      en: "Firebase: public reads denied",
    }, undefined, Date.now() - t0);
  }

  // Supabase: with the public anon key, probe the REST OpenAPI schema and
  // try to read real table rows (v0.2: deep RLS check)
  const sb = blob.match(/https:\/\/([a-z0-9]{15,30})\.supabase\.co/i);
  if (sb) {
    const base = `https://${sb[1]}.supabase.co/rest/v1`;
    const anon =
      blob.match(/anon[_-]?key["'\s:=]+["']([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)["']/i)?.[1] ?? "";
    const authHeaders: Record<string, string> = anon
      ? { apikey: anon, authorization: `Bearer ${anon}` }
      : {};

    // OpenAPI root returns the schema (with table paths) for a valid key
    const spec = await safeFetch(`${base}/`, { timeoutMs: 6000, headers: authHeaders });
    if (spec.status === 401 || spec.status === 403) {
      return done("baas_open_read", "pass", "critical", 0, {
        ru: "BaaS-базы (Firebase/Supabase) не обнаружены или закрыты",
        en: "No BaaS databases (Firebase/Supabase) found, or they are locked",
      }, undefined, Date.now() - t0);
    }
    if (spec.status === 200) {
      // table names from the OpenAPI paths: "/rest/v1/<table>"
      const tables = [...new Set(
        [...spec.body.matchAll(/"\/rest\/v1\/([A-Za-z0-9_]+)"/g)].map((m) => m[1]),
      )].filter((t) => t && t !== "rpc").slice(0, 3);

      const readable: string[] = [];
      for (const table of tables) {
        const r = await safeFetch(`${base}/${table}?select=*&limit=1`, {
          timeoutMs: 6000,
          headers: authHeaders,
        });
        if (r.status === 200 && /^\s*\[/.test(r.body)) {
          readable.push(`${table} (${truncate(r.body, 60)})`);
        }
      }
      if (readable.length) {
        return done(
          "baas_open_read",
          "fail",
          "critical",
          35,
          { ru: "Supabase: данные читаются анонимно (RLS выключен)", en: "Supabase: data readable anonymously (RLS disabled)" },
          {
            code: "SUPABASE_OPEN_READ",
            detail: {
              ru: "С публичным anon-ключом таблицы отдают реальные строки без авторизации: Row Level Security не настроен. Любой пользователь браузера может выгрузить данные.",
              en: "With the public anon key, tables return real rows without auth: Row Level Security is not configured. Any visitor can download the data.",
            },
            evidence: readable.slice(0, 3),
          },
          Date.now() - t0,
        );
      }
      if (tables.length) {
        return done("baas_open_read", "pass", "critical", 0, {
          ru: "Supabase: RLS закрывает публичное чтение таблиц",
          en: "Supabase: RLS denies public table reads",
        }, undefined, Date.now() - t0);
      }
      // schema visible but no tables detectable - conservative pass
      return done("baas_open_read", "pass", "critical", 0, {
        ru: "Supabase: REST отвечает, открытых таблиц не найдено",
        en: "Supabase: REST responds, no openly readable tables found",
      }, undefined, Date.now() - t0);
    }
    // spec unreachable without key and no key found
    return done("baas_open_read", "pass", "critical", 0, {
      ru: "BaaS-базы (Firebase/Supabase) не обнаружены или закрыты",
      en: "No BaaS databases (Firebase/Supabase) found, or they are locked",
    }, undefined, Date.now() - t0);
  }

  return done("baas_open_read", "pass", "critical", 0, {
    ru: "BaaS-базы (Firebase/Supabase) не обнаружены или закрыты",
    en: "No BaaS databases (Firebase/Supabase) found, or they are locked",
  }, undefined, Date.now() - t0);
}

/* ------------------------------------------------------------------ */
/* Source maps                                                         */
/* ------------------------------------------------------------------ */

export async function checkSourceMaps(ctx: Ctx): Promise<CheckResult> {
  const t0 = Date.now();
  const bundles = extractScripts(ctx.homeBody, ctx.origin, 3);
  const found: string[] = [];
  await Promise.all(
    bundles.map(async (u) => {
      // .map belongs to the pathname, not the tail of the URL: "chunk.js?dpl=1"
      // + ".map" would fetch the JS file itself (query ignored) and 200
      let mapUrl = u;
      try {
        const parsed = new URL(u);
        parsed.pathname += ".map";
        mapUrl = parsed.toString();
      } catch {
        mapUrl = u + ".map";
      }
      const r = await safeFetch(mapUrl, { timeoutMs: 5000, maxBody: 2048 });
      // a real source map is JSON with a "mappings" field - a 200 HTML/JS
      // body (soft-404 / catch-all) does not count
      if (r.ok && r.status === 200 && r.body.includes('"mappings"')) {
        found.push(mapUrl.replace(ctx.origin, ""));
      }
    }),
  );
  if (found.length) {
    return done(
      "source_maps",
      "warn",
      "low",
      3,
      { ru: "Открыты source maps", en: "Source maps are exposed" },
      {
        code: "SOURCEMAPS_EXPOSED",
        detail: {
          ru: "Карточки исходников (.map) доступны в продакшене: исходный код приложения, комментарии и пути легко восстановить. Не критично, но упрощает разведку.",
          en: "Production .map files are downloadable: original source, comments and paths are trivially reconstructed. Not critical, but eases reconnaissance.",
        },
        evidence: found,
      },
      Date.now() - t0,
    );
  }
  return done("source_maps", "pass", "low", 0, {
    ru: "Source maps закрыты",
    en: "Source maps are not exposed",
  }, undefined, Date.now() - t0);
}
