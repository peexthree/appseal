import type { CheckResult, Severity } from "../types";
import {
  bodiesEquivalent,
  extractScripts,
  looksLikeDocExample,
  maskSecret,
  safeFetch,
  shannonEntropy,
} from "../fetcher";

interface Ctx {
  origin: string; // e.g. https://example.com
  host: string;
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

const base = (ctx: Ctx): string => ctx.origin + (ctx.basePath ?? "");

/** A 200 response is only evidence when it is not a soft-404 HTML page. */
function isRealFile(body: string, contentType: string, homeBody: string): boolean {
  const isHtml = /text\/html/i.test(contentType) && /<html|<!doctype/i.test(body);
  return !isHtml && !bodiesEquivalent(body, homeBody);
}

/* ------------------------------------------------------------------ */
/* .env / .git exposure                                                */
/* ------------------------------------------------------------------ */

export async function checkEnvExposure(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const r = await safeFetch(base(ctx) + "/.env", { timeoutMs: 5000, maxBody: 4096 });
  if (r.ok && r.status === 200 && /^[A-Za-z0-9_]+\s*=/m.test(r.body) && isRealFile(r.body, r.contentType, ctx.homeBody)) {
    const firstLine = r.body.split("\n").find((l) => /^[A-Za-z0-9_]+\s*=/.test(l)) ?? "";
    const varName = firstLine.split("=")[0].trim() || "SECRET_KEY";
    const count = (r.body.match(/^[A-Za-z0-9_]+\s*=/gm) ?? []).length;
    return [done(
      "env_exposure",
      "fail",
      "critical",
      40,
      { ru: "Файл .env доступен из интернета", en: ".env file is publicly accessible" },
      {
        code: "ENV_EXPOSED",
        detail: {
          ru: `Файл переменных окружения открыт любому посетителю (~${count} переменных, включая ключи API и пароли БД). Это самая дорогая ошибка вайб-кодинга: злоумышленник получает ключи за 10 секунд.`,
          en: `A dot-env file is served to any visitor (~${count} variables including API keys and DB passwords). This is the most expensive vibe-coding mistake: an attacker gets your keys in 10 seconds.`,
        },
        evidence: [`${"/.env"} → ${varName}=******** (${count} vars)`],
      },
      Date.now() - t0,
    )];
  }
  return [done("env_exposure", "pass", "critical", 0, {
    ru: "Файл .env не доступен",
    en: ".env file is not exposed",
  }, undefined, Date.now() - t0)];
}

const ENV_VARIANTS = ["/.env.local", "/.env.production", "/.env.development", "/.env.bak", "/.env.backup", "/env.backup"];

export async function checkEnvVariants(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const probed = await Promise.all(
    ENV_VARIANTS.map(async (p) => {
      const r = await safeFetch(base(ctx) + p, { timeoutMs: 5000, maxBody: 2048 });
      if (r.ok && r.status === 200 && /^[A-Za-z0-9_]+\s*=/m.test(r.body) && isRealFile(r.body, r.contentType, ctx.homeBody)) {
        return p;
      }
      return null;
    }),
  );
  const found = probed.filter((p): p is string => Boolean(p));
  if (found.length) {
    return [done("env_variants", "fail", "critical", 30, {
      ru: "Варианты .env доступны по прямым ссылкам",
      en: ".env variants are publicly accessible",
    }, {
      code: "ENV_VARIANTS_EXPOSED",
      detail: {
        ru: "Найдены копии env-файлов (.env.local, .env.bak и т.п.): их часто забывают в веб-корне после ручного деплоя. Содержимое то же - живые ключи.",
        en: "Copies of env files found (.env.local, .env.bak etc.): commonly left in the web root after manual deploys. Same contents - live keys.",
      },
      evidence: found.map((p) => `${p} → vars=********`),
    }, Date.now() - t0)];
  }
  return [done("env_variants", "pass", "critical", 0, {
    ru: "Варианты .env не найдены",
    en: "No .env variants exposed",
  }, undefined, Date.now() - t0)];
}

export async function checkGitExposure(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const r = await safeFetch(base(ctx) + "/.git/HEAD", { timeoutMs: 5000, maxBody: 512 });
  if (r.ok && r.status === 200 && r.body.includes("ref: refs/") && isRealFile(r.body, r.contentType, ctx.homeBody)) {
    return [done(
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
        evidence: ["/.git/HEAD → " + r.body.slice(0, 60)],
      },
      Date.now() - t0,
    )];
  }
  return [done("git_exposure", "pass", "critical", 0, {
    ru: "Папка .git не доступна",
    en: ".git directory is not exposed",
  }, undefined, Date.now() - t0)];
}

const VCS_PATHS: { path: string; marker: RegExp; vcs: string }[] = [
  { path: "/.git/config", marker: /\[core\]|\[remote/i, vcs: "git config" },
  { path: "/.svn/entries", marker: /^\d+\s*$|\dir\b/i, vcs: "svn" },
  { path: "/.hg/hgrc", marker: /\[paths\]|\[ui\]/i, vcs: "mercurial" },
  { path: "/.DS_Store", marker: /Bud1[\x00-\xff]/, vcs: ".DS_Store (macOS)" },
];

export async function checkVcsLeaks(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const probes = await Promise.all(
    VCS_PATHS.map(async (v) => {
      const r = await safeFetch(base(ctx) + v.path, { timeoutMs: 5000, maxBody: 2048 });
      const hit = r.ok && r.status === 200 && isRealFile(r.body, r.contentType, ctx.homeBody) && v.marker.test(r.body);
      return { v, hit };
    }),
  );
  const out: CheckResult[] = [];
  for (const { v, hit } of probes) {
    if (v.vcs === ".DS_Store (macOS)") {
      out.push(done("ds_store", hit ? "warn" : "pass", "low", hit ? 3 : 0, {
        ru: hit ? ".DS_Store доступен (мусор macOS в веб-корне)" : ".DS_Store не найден",
        en: hit ? ".DS_Store exposed (macOS junk in web root)" : ".DS_Store not found",
      }, hit ? {
        code: "DS_STORE",
        detail: {
          ru: "Служебный файл macOS лежит в веб-корне: по нему восстанавливают имена файлов и структуру каталогов.",
          en: "The macOS service file sits in the web root: file names and directory structure are reconstructable from it.",
        },
        evidence: [v.path],
      } : undefined, Date.now() - t0));
    } else {
      out.push(done(v.vcs.includes("git") ? "git_config" : "vcs_others", hit ? "fail" : "pass", hit ? "critical" : "high", hit ? (v.vcs.includes("git") ? 30 : 15) : 0, {
        ru: hit ? `${v.vcs} доступен публично` : `${v.vcs} не доступен`,
        en: hit ? `${v.vcs} is publicly accessible` : `${v.vcs} is not exposed`,
      }, hit ? {
        code: "VCS_EXPOSED",
        detail: {
          ru: "Служебные файлы системы контроля версий открыты: адреса репозиториев, учётки и внутренняя структура проекта на виду.",
          en: "Version-control service files are open: repository addresses, accounts and the internal project layout are on display.",
        },
        evidence: [v.path],
      } : undefined, Date.now() - t0));
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Secrets in client-side source (HTML + JS bundles), by provider group */
/* ------------------------------------------------------------------ */

interface Sig {
  name: string;
  re: RegExp;
  sev: Severity;
  pen: number;
  structural?: boolean;
}

const SIG_GROUPS: { id: string; group: { ru: string; en: string }; sigs: Sig[] }[] = [
  {
    id: "sig_ai_keys",
    group: { ru: "ключи ИИ-сервисов", en: "AI service keys" },
    sigs: [
      { name: "OpenAI API key", re: /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g, sev: "critical", pen: 40 },
      { name: "Anthropic API key", re: /sk-ant-[A-Za-z0-9_-]{20,}/g, sev: "critical", pen: 40 },
      { name: "Groq/Mistral key", re: /gsk_[A-Za-z0-9]{20,}|mistral-[A-Za-z0-9]{20,}/g, sev: "critical", pen: 30 },
    ],
  },
  {
    id: "sig_cloud_keys",
    group: { ru: "ключи облачных провайдеров", en: "cloud provider keys" },
    sigs: [
      { name: "AWS access key", re: /AKIA[0-9A-Z]{16}/g, sev: "critical", pen: 40 },
      { name: "Google API key", re: /AIza[0-9A-Za-z_-]{35}/g, sev: "high", pen: 20 },
      { name: "Azure/DO token", re: /(?: AZ[A-Za-z0-9]{30,})|(?:dop_v1_[a-f0-9]{32,})/g, sev: "high", pen: 25 },
    ],
  },
  {
    id: "sig_payment_keys",
    group: { ru: "ключи платёжных систем", en: "payment system keys" },
    sigs: [
      { name: "Stripe live secret key", re: /sk_live_[0-9a-zA-Z]{10,}/g, sev: "critical", pen: 40 },
      { name: "Stripe restricted key", re: /rk_live_[0-9a-zA-Z]{10,}/g, sev: "critical", pen: 35 },
      { name: "PayPal secret", re: /(?:access_token\$production\$)[A-Za-z0-9$._-]{20,}/g, sev: "critical", pen: 35 },
    ],
  },
  {
    id: "sig_comms_tokens",
    group: { ru: "токены коммуникационных сервисов", en: "communication service tokens" },
    sigs: [
      { name: "Slack token", re: /xox[bpars]-[A-Za-z0-9-]{10,}/g, sev: "critical", pen: 35 },
      { name: "Telegram bot token", re: /\b\d{8,10}:AA[A-Za-z0-9_-]{30,}/g, sev: "critical", pen: 30 },
      { name: "Twilio SID/Auth", re: /SK?[a-f0-9]{32}\b[\s\S]{0,20}[a-f0-9]{32}/g, sev: "high", pen: 25 },
    ],
  },
  {
    id: "sig_email_keys",
    group: { ru: "ключи почтовых сервисов", en: "email service keys" },
    sigs: [
      { name: "SendGrid API key", re: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g, sev: "critical", pen: 40 },
      { name: "Mailgun key", re: /key-[a-f0-9]{32}/g, sev: "high", pen: 25 },
      { name: "SMTP password literal", re: /smtp[^"'\n]{0,40}(?:pass(?:word)?)["']?\s*[:=]\s*["'][^"'\s]{8,}["']/gi, sev: "high", pen: 25 },
    ],
  },
  {
    id: "sig_crypto_material",
    group: { ru: "криптографический материал", en: "cryptographic material" },
    sigs: [
      { name: "Private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g, sev: "critical", pen: 40, structural: true },
      {
        name: "JWT/service token",
        re: /eyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}/g,
        sev: "high",
        pen: 25,
      },
      {
        name: "DB connection string",
        re: /(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis):\/\/[^:\/\s"']+:[^@\/\s"']+@[^\s"'>]+/g,
        sev: "critical",
        pen: 35,
      },
    ],
  },
  {
    id: "sig_generic",
    group: { ru: "обобщённые захардкоженные секреты", en: "generic hardcoded secrets" },
    sigs: [
      {
        name: "Generic hardcoded secret",
        re: /(?:api[_-]?key|apikey|secret|password|token)["']?\s*[:=]\s*["'][A-Za-z0-9+/_=-]{20,}["']/gi,
        sev: "medium",
        pen: 8,
      },
    ],
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
function classifyHit(sig: Sig, context: string, hit: string): { sev: Severity; pen: number } | null {
  if (sig.name === "Google API key" && /firebase|maps|gstatic/i.test(context)) {
    return null; // public by design context
  }
  if (sig.name === "JWT/service token" && /supabase/i.test(context)) {
    const role = jwtPayload(hit)?.["role"];
    if (role === "anon" || role === "authenticated") return null;
    if (role === "service_role") return { sev: "critical", pen: 40 };
    return { sev: "high", pen: 25 };
  }
  return { sev: sig.sev, pen: sig.pen };
}

async function collectDocs(ctx: Ctx, maxBundles: number): Promise<{ src: string; body: string }[]> {
  const bundles = extractScripts(ctx.homeBody, ctx.origin, maxBundles);
  const docs: { src: string; body: string }[] = [{ src: "index.html", body: ctx.homeBody }];
  await Promise.all(
    bundles.map(async (u) => {
      const r = await safeFetch(u, { timeoutMs: 6000, maxBody: 500 * 1024 });
      if (r.ok && r.body) docs.push({ src: u.replace(ctx.origin, ""), body: r.body });
    }),
  );
  return docs;
}

interface SigHit { sig: Sig; src: string; masked: string; context: string }

async function scanSignatures(ctx: Ctx, maxBundles: number): Promise<{ hits: SigHit[]; filtered: number }> {
  const docs = await collectDocs(ctx, maxBundles);
  const hits: SigHit[] = [];
  let filtered = 0;
  for (const doc of docs) {
    for (const group of SIG_GROUPS) {
      for (const sig of group.sigs) {
        const m = doc.body.match(sig.re);
        if (!m) continue;
        const uniq = [...new Set(m)].slice(0, 2);
        for (const hit of uniq) {
          const idx = doc.body.indexOf(hit);
          const context = doc.body.slice(Math.max(0, idx - 120), idx + 160);
          if (
            sig.name === "Generic hardcoded secret" &&
            (/\b(pk|pub|public)[_-]?key\b/i.test(hit) ||
              /pk_[A-Za-z0-9_-]{10,}/.test(hit) ||
              /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(hit))
          ) {
            filtered++;
            continue;
          }
          if (!sig.structural && shannonEntropy(hit) < 3.0) {
            filtered++;
            continue;
          }
          if (sig.name === "OpenAI API key") {
            const body = hit.replace(/^sk-(?:proj-)?/, "");
            if (/^[a-z]+-[a-z-]+$/.test(body)) {
              filtered++;
              continue;
            }
          }
          if (!sig.structural && looksLikeDocExample(hit, context)) {
            filtered++;
            continue;
          }
          const cls = classifyHit(sig, context, hit);
          if (!cls) continue;
          hits.push({ sig, src: doc.src, masked: maskSecret(hit), context });
        }
      }
    }
  }
  return { hits, filtered };
}

function sigGroupResult(
  ctx: Ctx,
  groupId: string,
  groupLabel: { ru: string; en: string },
  groupHits: SigHit[],
  t0: number,
): CheckResult {
  const worst = groupHits.reduce((a, b) => (b.sig.pen > a.sig.pen ? b : a));
  return done(
    groupId,
    "fail",
    worst.sig.sev,
    worst.sig.pen,
    {
      ru: `В клиентском коде найдены ${groupLabel.ru}`,
      en: `${groupLabel.en} found in client-side code`,
    },
    {
      code: groupId.toUpperCase(),
      detail: {
        ru: "Ключи API зашиты в HTML или JS-бандлы - всё, что видно браузеру, видно и злоумышленнику. Живые ключи нужно немедленно ротировать, серверные секреты переносить на бэкенд/edge-функции.",
        en: "API keys are embedded in HTML or JS bundles - anything the browser can see, an attacker can see. Rotate live keys immediately and move server secrets to backend/edge functions.",
      },
      evidence: groupHits.slice(0, 4).map((h) => `${h.sig.name} @ ${h.src} → ${h.masked}`),
    },
    Date.now() - t0,
  );
}

export async function checkSecretsInSource(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const { hits, filtered } = await scanSignatures(ctx, 6);
  const out: CheckResult[] = [];
  for (const group of SIG_GROUPS) {
    const groupHits = hits.filter((h) => group.sigs.some((s) => s.name === h.sig.name));
    if (groupHits.length) {
      out.push(sigGroupResult(ctx, group.id, group.group, groupHits, t0));
    } else {
      out.push(done(group.id, "pass", "high", 0, {
        ru: `${group.group.ru} не найдены`,
        en: `No ${group.group.en} found`,
      }, undefined, Date.now() - t0));
    }
  }
  if (filtered > 0) {
    out.push(done("sig_filter_report", "info", "low", 0, {
      ru: `Отфильтровано ${filtered} ложных кандидатов (документация/примеры)`,
      en: `${filtered} false candidates filtered (docs/examples)`,
    }, undefined, Date.now() - t0));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Firebase / Supabase open database read (two separate checks)        */
/* ------------------------------------------------------------------ */

export async function checkFirebaseOpenRead(ctx: Ctx): Promise<CheckResult[]> {
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
  const fbId = blob.match(/([a-z0-9][a-z0-9-]{4,28})\.firebaseio\.com/i) ??
    blob.match(/([a-z0-9][a-z0-9-]{4,28})-default-rtdb\.(?:[a-z]{2}\.)?firebaseio\.com/i);
  if (!fbId) {
    return [done("firebase_open_read", "pass", "critical", 0, {
      ru: "Firebase RTDB не используется или не обнаружен",
      en: "Firebase RTDB not used or not detected",
    }, undefined, Date.now() - t0)];
  }
  const bases = [
    `https://${fbId[1]}-default-rtdb.firebaseio.com/.json`,
    `https://${fbId[1]}.firebaseio.com/.json`,
  ];
  for (const b of bases) {
    const r = await safeFetch(b, { timeoutMs: 6000 });
    if (r.ok && r.status === 200 && !/permission denied|Permission denied/.test(r.body)) {
      return [done(
        "firebase_open_read",
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
          evidence: [`${b} → ${r.body.slice(0, 90)}`],
        },
        Date.now() - t0,
      )];
    }
  }
  return [done("firebase_open_read", "pass", "critical", 0, {
    ru: "Firebase: публичное чтение закрыто",
    en: "Firebase: public reads denied",
  }, undefined, Date.now() - t0)];
}

export async function checkSupabaseOpenRead(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const blob = ctx.homeBody;
  const sb = blob.match(/https:\/\/([a-z0-9]{15,30})\.supabase\.co/i);
  if (!sb) {
    return [done("supabase_open_read", "pass", "critical", 0, {
      ru: "Supabase не используется или не обнаружен",
      en: "Supabase not used or not detected",
    }, undefined, Date.now() - t0)];
  }
  const baseSb = `https://${sb[1]}.supabase.co/rest/v1`;
  const anon =
    blob.match(/anon[_-]?key["'\s:=]+["']([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)["']/i)?.[1] ?? "";
  const authHeaders: Record<string, string> = anon
    ? { apikey: anon, authorization: `Bearer ${anon}` }
    : {};
  const spec = await safeFetch(`${baseSb}/`, { timeoutMs: 6000, headers: authHeaders });
  if (spec.status === 401 || spec.status === 403) {
    return [done("supabase_open_read", "pass", "critical", 0, {
      ru: "Supabase: REST закрыт ключом",
      en: "Supabase: REST is key-protected",
    }, undefined, Date.now() - t0)];
  }
  if (spec.status === 200) {
    const tables = [...new Set(
      [...spec.body.matchAll(/"\/rest\/v1\/([A-Za-z0-9_]+)"/g)].map((m) => m[1]),
    )].filter((t) => t && t !== "rpc").slice(0, 3);
    const readable: string[] = [];
    for (const table of tables) {
      const r = await safeFetch(`${baseSb}/${table}?select=*&limit=1`, {
        timeoutMs: 6000,
        headers: authHeaders,
      });
      if (r.status === 200 && /^\s*\[/.test(r.body)) {
        readable.push(`${table} (${r.body.slice(0, 60)})`);
      }
    }
    if (readable.length) {
      return [done(
        "supabase_open_read",
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
      )];
    }
    return [done("supabase_open_read", "pass", "critical", 0, {
      ru: tables.length ? "Supabase: RLS закрывает публичное чтение таблиц" : "Supabase: REST отвечает, открытых таблиц не найдено",
      en: tables.length ? "Supabase: RLS denies public table reads" : "Supabase: REST responds, no openly readable tables found",
    }, undefined, Date.now() - t0)];
  }
  return [done("supabase_open_read", "pass", "critical", 0, {
    ru: "Supabase: REST не доступен для проверки",
    en: "Supabase: REST not reachable for verification",
  }, undefined, Date.now() - t0)];
}

/* ------------------------------------------------------------------ */
/* Source maps                                                         */
/* ------------------------------------------------------------------ */

export async function checkSourceMaps(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const bundles = extractScripts(ctx.homeBody, ctx.origin, 3);
  const found: string[] = [];
  await Promise.all(
    bundles.map(async (u) => {
      let mapUrl = u;
      try {
        const parsed = new URL(u);
        parsed.pathname += ".map";
        mapUrl = parsed.toString();
      } catch {
        mapUrl = u + ".map";
      }
      const r = await safeFetch(mapUrl, { timeoutMs: 5000, maxBody: 2048 });
      if (r.ok && r.status === 200 && r.body.includes('"mappings"')) {
        found.push(mapUrl.replace(ctx.origin, ""));
      }
    }),
  );
  if (found.length) {
    return [done(
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
    )];
  }
  return [done("source_maps", "pass", "low", 0, {
    ru: "Source maps закрыты",
    en: "Source maps are not exposed",
  }, undefined, Date.now() - t0)];
}

/* ------------------------------------------------------------------ */
/* Client env leak (NEXT_PUBLIC_SECRET, VITE_PRIVATE_, etc.)           */
/* ------------------------------------------------------------------ */

const DANGEROUS_CLIENT_ENV = [
  /NEXT_PUBLIC_(?:SECRET|PRIVATE|API_SECRET|SERVICE_ROLE|PASSWORD|TOKEN|AUTH_SECRET|DATABASE|DB_URL)\b/i,
  /VITE_(?:PRIVATE|SECRET|API_SECRET|SERVICE_ROLE|PASSWORD|TOKEN)\b/i,
  /REACT_APP_(?:SECRET|PRIVATE|API_SECRET|SERVICE_ROLE|PASSWORD|TOKEN)\b/i,
  /NUXT_PUBLIC_(?:SECRET|PRIVATE|TOKEN|PASSWORD)\b/i,
];

export async function checkClientEnvLeak(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const bundles = extractScripts(ctx.homeBody, ctx.origin, 3);
  const found: string[] = [];

  const checkText = (text: string, srcLabel: string) => {
    for (const re of DANGEROUS_CLIENT_ENV) {
      const match = text.match(re);
      if (match) {
        found.push(`${srcLabel} → ${match[0]}`);
      }
    }
  };
  checkText(ctx.homeBody, "homepage HTML");
  await Promise.all(
    bundles.map(async (u) => {
      const r = await safeFetch(u, { timeoutMs: 5000, maxBody: 256 * 1024 });
      if (r.ok && r.status === 200 && r.body) {
        checkText(r.body, u.replace(ctx.origin, ""));
      }
    }),
  );

  if (found.length) {
    return [done(
      "client_env_leak",
      "fail",
      "high",
      15,
      { ru: "Приватные env-переменные в клиентском коде", en: "Private env vars in client bundles" },
      {
        code: "CLIENT_ENV_LEAK",
        detail: {
          ru: "В клиентских скриптах найдены переменные с префиксами NEXT_PUBLIC_ / VITE_ / REACT_APP_, содержащие маркеры приватных секретов (SECRET, PASSWORD, SERVICE_ROLE, DB). Такие ключи видны всем пользователям в браузере.",
          en: "Client scripts contain build-time variables with NEXT_PUBLIC_ / VITE_ / REACT_APP_ prefixes referencing sensitive markers (SECRET, PASSWORD, SERVICE_ROLE, DB). These values are visible to anyone in DevTools.",
        },
        evidence: found,
      },
      Date.now() - t0,
    )];
  }
  return [done("client_env_leak", "pass", "low", 0, {
    ru: "Приватные env-переменные не найдены в клиенте",
    en: "No sensitive env vars leaked to client bundles",
  }, undefined, Date.now() - t0)];
}

/* ------------------------------------------------------------------ */
/* Docker / Kubernetes files exposure                                  */
/* ------------------------------------------------------------------ */

const DOCKER_K8S_PATHS = [
  "/Dockerfile",
  "/docker-compose.yml",
  "/docker-compose.yaml",
  "/compose.yml",
  "/.dockerenv",
  "/.kube/config",
];

export async function checkDockerK8sExposure(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const probed = await Promise.all(
    DOCKER_K8S_PATHS.map(async (p) => {
      const r = await safeFetch(base(ctx) + p, { timeoutMs: 4000, maxBody: 1024 });
      if (r.ok && r.status === 200) {
        if (!isRealFile(r.body, r.contentType, ctx.homeBody)) return null;
        const isDockerfile = p.includes("Dockerfile") && /FROM\s+[a-z0-9_.-]+|WORKDIR\s+|ENTRYPOINT\s+/i.test(r.body);
        const isCompose = p.includes("compose") && /services:\s*|version:\s*['"]?[0-9]/i.test(r.body);
        const isDockerEnv = p === "/.dockerenv";
        const isKube = p.includes(".kube") && /apiVersion:|clusters:|users:/i.test(r.body);
        if (isDockerfile || isCompose || isDockerEnv || isKube) {
          return `${p} → файл конфигурации контейнеризации доступен публично`;
        }
      }
      return null;
    }),
  );
  const found = probed.filter((x): x is string => Boolean(x));
  if (found.length) {
    return [done(
      "docker_k8s_exposure",
      "fail",
      "high",
      20,
      { ru: "Docker / K8s файлы доступны из интернета", en: "Docker / K8s files publicly accessible" },
      {
        code: "INFRA_EXPOSED",
        detail: {
          ru: "В веб-корне обнаружены файлы конфигурации контейнеризации (Dockerfile, docker-compose.yml или .dockerenv). Они раскрывают структуру сервисов, порты, секреты сборки и системные пути.",
          en: "Container configuration files (Dockerfile, docker-compose.yml, or .dockerenv) found in the web root. They expose internal service architecture, ports, secrets, and system paths.",
        },
        evidence: found,
      },
      Date.now() - t0,
    )];
  }
  return [done("docker_k8s_exposure", "pass", "low", 0, {
    ru: "Файлы Docker и Kubernetes не найдены",
    en: "No Docker or Kubernetes configuration exposed",
  }, undefined, Date.now() - t0)];
}

/* ------------------------------------------------------------------ */
/* Package manifests in web root                                       */
/* ------------------------------------------------------------------ */

const MANIFEST_PATHS = ["/package.json", "/composer.json", "/Gemfile", "/requirements.txt"];

export async function checkManifestExposure(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const probed = await Promise.all(
    MANIFEST_PATHS.map(async (p): Promise<string | null> => {
      const r = await safeFetch(base(ctx) + p, { timeoutMs: 4000, maxBody: 4096 });
      if (r.ok && r.status === 200 && isRealFile(r.body, r.contentType, ctx.homeBody)) {
        const isManifest =
          p === "/package.json" && /"name"|"dependencies"/i.test(r.body) ||
          p === "/composer.json" && /"require"|"name"/i.test(r.body) ||
          p === "/Gemfile" && /gem\s/i.test(r.body) ||
          p === "/requirements.txt" && /==|>=/i.test(r.body);
        if (isManifest) return p;
      }
      return null;
    }),
  );
  const found = probed.filter((p): p is string => Boolean(p));
  if (found.length) {
    return [done("manifest_exposure", "warn", "medium", 8, {
      ru: "Манифесты зависимостей в веб-корне",
      en: "Dependency manifests exposed in web root",
    }, {
      code: "MANIFEST_EXPOSED",
      detail: {
        ru: "package.json / composer.json доступны по прямому URL: точные версии библиотек помогают подобрать известные уязвимости под стек. Уберите манифесты из веб-корня.",
        en: "package.json / composer.json are reachable by URL: exact dependency versions help target known CVEs for the stack. Remove manifests from the web root.",
      },
      evidence: found,
    }, Date.now() - t0)];
  }
  return [done("manifest_exposure", "pass", "medium", 0, {
    ru: "Манифесты зависимостей не доступны",
    en: "No dependency manifests exposed",
  }, undefined, Date.now() - t0)];
}

/* ------------------------------------------------------------------ */
/* security.txt (RFC 9116 - good practice, info)                       */
/* ------------------------------------------------------------------ */

export async function checkSecurityTxt(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const r = await safeFetch(base(ctx) + "/.well-known/security.txt", { timeoutMs: 4000, maxBody: 2048 });
  const has = r.ok && r.status === 200 && /contact:/i.test(r.body);
  return [done("security_txt", has ? "pass" : "info", "low", 0, {
    ru: has ? "security.txt опубликован (канал для сообщений о уязвимостях)" : "security.txt не опубликован",
    en: has ? "security.txt published (vulnerability disclosure channel)" : "security.txt is not published",
  }, has ? undefined : {
    code: "NO_SECURITY_TXT",
    detail: {
      ru: "RFC 9116 security.txt говорит исследователям, куда сообщать о найденных уязвимостях. Это бесплатный сигнал зрелости: /.well-known/security.txt со строкой Contact.",
      en: "RFC 9116 security.txt tells researchers where to report vulnerabilities. A free maturity signal: /.well-known/security.txt with a Contact line.",
    },
    evidence: [],
  }, Date.now() - t0)];
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
