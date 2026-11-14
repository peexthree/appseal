import type { CheckResult, Severity } from "../types";
import { registrableDomain, safeFetch, tlsInfo, truncate } from "../fetcher";
import { detectPlatform } from "./liveness";

interface Ctx {
  origin: string;
  host: string;
  homeBody: string;
  homeHeaders: Record<string, string>;
  isHttp: boolean;
  /** prefix for path probes (the built-in demo target lives under /api/demo-target) */
  basePath?: string;
  /** the page is a client-side render shell - DOM-level checks report info */
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
): CheckResult => ({ id, category: "trust", status, severity, penalty, title, durationMs, finding });

const csrSkip = (id: string, ru: string, en: string, t0: number): CheckResult =>
  done(id, "info", "low", 0, {
    ru: `Контент рендерится на клиенте - ${ru.toLowerCase()}`,
    en: `Content is client-rendered - ${en.toLowerCase()}`,
  }, {
    code: "CSR_SKIPPED",
    detail: {
      ru: "Главная страница - пустой HTML-шелл: текстовые проверки требуют JS-рендеринга.",
      en: "The homepage is an empty HTML shell: text checks need JS rendering.",
    },
    evidence: [],
  }, Date.now() - t0);

/** Hosting platforms whose subdomains share platform DNS - the site owner
 *  cannot set TXT records, so DNS trust checks do not apply. */
const DEPLOY_SUFFIXES = [
  ".vercel.app", ".netlify.app", ".pages.dev", ".workers.dev", ".lovable.app",
  ".replit.app", ".replit.dev", ".onrender.com", ".up.railway.app", ".fly.dev",
  ".glitch.me", ".web.app", ".firebaseapp.com", ".amplifyapp.com",
  ".azurestaticapps.net", ".github.io", ".gitlab.io", ".deno.dev", ".lovable.site",
];

function isDeployHost(host: string): boolean {
  const h = host.toLowerCase();
  return DEPLOY_SUFFIXES.some((s) => h.endsWith(s));
}

/* ------------------------------------------------------------------ */
/* DNS-over-HTTPS helpers (literal api host - no user data in origin)  */
/* ------------------------------------------------------------------ */

interface DohReply {
  Status?: number;
  Answer?: { data?: string }[];
}

/** All TXT strings for a name, quotes stripped (DoH returns them quoted). */
async function txtRecords(name: string): Promise<string[]> {
  const url = "https://dns.google/resolve?name=" + encodeURIComponent(name) + "&type=TXT";
  const r = await safeFetch(url, { timeoutMs: 4000, maxBody: 64 * 1024 });
  if (!r.ok || !r.body) return [];
  try {
    const data = JSON.parse(r.body) as DohReply;
    if (data.Status !== 0) return [];
    return (data.Answer ?? [])
      .map((a) => (a.data ?? "").replace(/^"|"$/g, "").replace(/"\s*"/g, ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Network probes: llms.txt, sitemap, robots AI policy, SPF/DMARC, TLS */
/* ------------------------------------------------------------------ */

/** AI crawlers worth declaring in robots.txt (owner's choice - info either way) */
const AI_CRAWLERS: { re: RegExp; name: string }[] = [
  { re: /gptbot/i, name: "GPTBot (OpenAI)" },
  { re: /claudebot|anthropic-ai/i, name: "ClaudeBot (Anthropic)" },
  { re: /ccbot/i, name: "CCBot (Common Crawl)" },
  { re: /perplexitybot|perplexity/i, name: "PerplexityBot" },
  { re: /google-extended/i, name: "Google-Extended" },
  { re: /bytespider/i, name: "Bytespider (ByteDance)" },
  { re: /facebookbot|meta-externalagent/i, name: "Meta AI" },
  { re: /applebot-extended/i, name: "AppleBot-Extended" },
  { re: /cohere-ai/i, name: "Cohere" },
];

export async function checkTrustProbes(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const base = ctx.basePath ?? "";
  const out: CheckResult[] = [];

  // one robots.txt fetch shared by the AI-policy and sitemap-directive checks
  const rob = await safeFetch(ctx.origin + base + "/robots.txt", {
    timeoutMs: 5000,
    maxBody: 32 * 1024,
  });
  const robotsBody = rob.ok && rob.status === 200 ? rob.body : "";

  // 1. llms.txt - the AI-era discovery standard (info either way, no penalty)
  const llms = await safeFetch(ctx.origin + base + "/llms.txt", {
    timeoutMs: 5000,
    maxBody: 32 * 1024,
  });
  const llmsOk = llms.ok && llms.status === 200 && llms.body.length > 8;
  out.push(done("ai_llms_txt", llmsOk ? "pass" : "info", "low", 0, {
    ru: llmsOk ? "llms.txt на месте - сайт описан для ИИ-ассистентов" : "llms.txt отсутствует (новый стандарт описания сайта для ИИ)",
    en: llmsOk ? "llms.txt present - the site is described for AI assistants" : "llms.txt missing (the new AI-discovery standard)",
  }, llmsOk ? undefined : {
    code: "NO_LLMS_TXT",
    detail: {
      ru: "llms.txt - свежий стандарт: краткая шпаргалка о проекте в /llms.txt, по которой ИИ-ассистенты и агентные браузеры понимают, что за сайт перед ними. Пока стандарт молодой - штрафов нет, но публикация выделяет сайт среди остальных.",
      en: "llms.txt is a fresh standard: a short cheat sheet at /llms.txt that AI assistants and agent browsers use to understand the project. Penalties are off while the standard is young, but publishing it sets the site apart.",
    },
    evidence: [],
  }, Date.now() - t0));

  // 2. sitemap.xml exists
  const sm = await safeFetch(ctx.origin + base + "/sitemap.xml", {
    timeoutMs: 6000,
    maxBody: 32 * 1024,
  });
  const smOk = sm.ok && sm.status === 200 && /<(?:urlset|sitemapindex)/i.test(sm.body);
  out.push(done("seo_sitemap", smOk ? "pass" : "warn", "low", smOk ? 0 : 1, {
    ru: smOk ? "sitemap.xml доступен" : "sitemap.xml не найден",
    en: smOk ? "sitemap.xml is available" : "sitemap.xml is missing",
  }, smOk ? undefined : {
    code: "NO_SITEMAP",
    detail: {
      ru: "Карта сайта не найдена: поисковики находят страницы только по ссылкам, новые разделы индексируются медленнее. Сгенерируйте /sitemap.xml и укажите его в robots.txt.",
      en: "No sitemap found: search engines discover pages through links only, new sections index slower. Generate /sitemap.xml and reference it in robots.txt.",
    },
    evidence: [],
  }, Date.now() - t0));

  // 3. robots.txt declares the sitemap (info either way)
  const hasSmDecl = /sitemap:\s*\S+/i.test(robotsBody);
  out.push(done("seo_robots_sitemap", hasSmDecl ? "pass" : "info", "low", 0, {
    ru: hasSmDecl ? "robots.txt ссылается на sitemap" : "robots.txt не содержит директивы Sitemap",
    en: hasSmDecl ? "robots.txt references the sitemap" : "robots.txt has no Sitemap directive",
  }, hasSmDecl ? undefined : {
    code: "ROBOTS_NO_SITEMAP",
    detail: {
      ru: "Директива Sitemap в robots.txt ускоряет обход: краулер узнаёт полный список страниц с первого запроса.",
      en: "A Sitemap directive in robots.txt speeds up crawling: the crawler learns the full page list from the first request.",
    },
    evidence: [],
  }, Date.now() - t0));

  // 4. AI-crawler policy declared in robots.txt (info either way - owner's choice)
  const declared: string[] = [];
  if (robotsBody) {
    const blocks = robotsBody.split(/User-agent:\s*/i);
    for (const block of blocks) {
      const agent = (block.split("\n")[0] ?? "").trim().toLowerCase();
      for (const c of AI_CRAWLERS) {
        if (c.re.test(agent) && !declared.includes(c.name)) declared.push(c.name);
      }
    }
  }
  out.push(done("ai_crawler_policy", declared.length ? "pass" : "info", "low", 0, {
    ru: declared.length
      ? `Политика для ИИ-краулеров объявлена (${declared.length})`
      : "Политика для ИИ-краулеров в robots.txt не задана",
    en: declared.length
      ? `AI-crawler policy declared (${declared.length})`
      : "No AI-crawler policy in robots.txt",
  }, declared.length ? undefined : {
    code: "NO_AI_CRAWLER_POLICY",
    detail: {
      ru: "robots.txt молчит про ИИ-краулеров (GPTBot, ClaudeBot, CCBot, PerplexityBot и др.): боты обучения моделей ходят по умолчанию. Разрешите или запретите их явно - правила за секунду, а сайт получает голос в том, как его контент попадает в ИИ.",
      en: "robots.txt says nothing about AI crawlers (GPTBot, ClaudeBot, CCBot, PerplexityBot...): model-training bots crawl by default. Allow or deny them explicitly - a one-second rule that gives the site a say in how its content reaches AI.",
    },
    evidence: declared.slice(0, 4),
  }, Date.now() - t0));

  // 5. TLS protocol version (fail on legacy TLS, skip when unreachable)
  if (ctx.isHttp) {
    out.push(done("tls_protocol", "skip", "low", 0, {
      ru: "Версия TLS не проверялась (сайт по http)",
      en: "TLS version not checked (site over http)",
    }, undefined, Date.now() - t0));
  } else {
    const port = parseInt(new URL(ctx.origin).port, 10) || 443;
    const info = await tlsInfo(ctx.host, port);
    if (!info.available || !info.protocol) {
      out.push(done("tls_protocol", "skip", "low", 0, {
        ru: "Версию TLS не удалось определить",
        en: "TLS version could not be determined",
      }, undefined, Date.now() - t0));
    } else if (/TLS ?1\.[01]|SSLv/i.test(info.protocol)) {
      out.push(done("tls_protocol", "fail", "high", 8, {
        ru: `Устаревшая версия TLS (${info.protocol})`,
        en: `Legacy TLS version (${info.protocol})`,
      }, {
        code: "LEGACY_TLS",
        detail: {
          ru: "Сервер согласует TLS 1.0/1.1: протоколы с известными слабостями (BEAST, POODLE), современные браузеры и PCI DSS их запрещают. Отключите старые версии, оставьте TLS 1.2/1.3.",
          en: "The server negotiates TLS 1.0/1.1: protocols with known weaknesses (BEAST, POODLE) that modern browsers and PCI DSS forbid. Disable legacy versions, keep TLS 1.2/1.3.",
        },
        evidence: [`protocol: ${info.protocol}`],
      }, Date.now() - t0));
    } else {
      out.push(done("tls_protocol", "pass", "low", 0, {
        ru: `Современная версия TLS (${info.protocol})`,
        en: `Modern TLS version (${info.protocol})`,
      }, undefined, Date.now() - t0));
    }
  }

  // 6-7. SPF + DMARC: email spoofing protection (DoH TXT lookups)
  if (ctx.isHttp || /^127\.|^(?:10|192\.168)\.|^172\.(?:1[6-9]|2\d|3[01])\.|^localhost|\.local$/i.test(ctx.host) || isDeployHost(ctx.host)) {
    out.push(done("dns_spf", "skip", "low", 0, {
      ru: "SPF не проверялся (общий или локальный домен)",
      en: "SPF not checked (shared or local domain)",
    }, undefined, Date.now() - t0));
    out.push(done("dns_dmarc", "skip", "low", 0, {
      ru: "DMARC не проверялся (общий или локальный домен)",
      en: "DMARC not checked (shared or local domain)",
    }, undefined, Date.now() - t0));
  } else {
    const spf = await txtRecords(ctx.host);
    const hasSpf = spf.some((s) => /^v=spf1/i.test(s));
    out.push(done("dns_spf", hasSpf ? "pass" : "warn", "low", hasSpf ? 0 : 2, {
      ru: hasSpf ? "SPF-запись настроена" : "SPF-запись отсутствует",
      en: hasSpf ? "SPF record is set" : "SPF record is missing",
    }, hasSpf ? undefined : {
      code: "NO_SPF",
      detail: {
        ru: "Без SPF-записи в DNS любой почтовый сервер может отправлять письма от имени вашего домена - фишинг «от вас» проходит без препятствий. Одна TXT-строка закрывает вопрос.",
        en: "Without an SPF DNS record any mail server can send email as your domain - phishing 'from you' goes unobstructed. One TXT line closes it.",
      },
      evidence: [],
    }, Date.now() - t0));

    const reg = registrableDomain(ctx.host);
    const dmarc = await txtRecords("_dmarc." + reg);
    const hasDmarc = dmarc.some((s) => /^v=DMARC1/i.test(s));
    out.push(done("dns_dmarc", hasDmarc ? "pass" : "warn", "low", hasDmarc ? 0 : 3, {
      ru: hasDmarc ? "DMARC-политика настроена" : "DMARC-политика отсутствует",
      en: hasDmarc ? "DMARC policy is set" : "DMARC policy is missing",
    }, hasDmarc ? undefined : {
      code: "NO_DMARC",
      detail: {
        ru: `Без DMARC (запись _dmarc.${reg}) почтовые провайдеры не знают, что делать с поддельными письмами от вашего домена: часть попадает во «Входящие». Даже домен без почты стоит закрыть политикой p=reject - это защита репутации.`,
        en: `Without DMARC (a _dmarc.${reg} record) mailbox providers have no instruction for forged mail from your domain: some lands in inboxes. Even a no-email domain deserves a p=reject policy - it protects the brand.`,
      },
      evidence: [`domain: ${reg}`],
    }, Date.now() - t0));
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Trust signals: privacy/terms links, trackers, contact, inventory    */
/* ------------------------------------------------------------------ */

/** first <a> tag whose href or text matches the pattern (null when none) */
function findAnchor(body: string, re: RegExp): string | null {
  for (const tag of body.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) ?? []) {
    if (re.test(tag)) return tag;
  }
  return null;
}

const TRACKERS = [
  { re: /googletagmanager\.com|google-analytics\.com|gtag\/js|googlesyndication/i, name: "Google" },
  { re: /connect\.facebook\.net|fbq\(|facebook\.com\/tr/i, name: "Facebook Pixel" },
  { re: /mc\.yandex\.ru\/metrika|ym\(\d+/i, name: "Яндекс.Метрика" },
  { re: /hotjar\.com|hjSetting/i, name: "Hotjar" },
  { re: /clarity\.ms/i, name: "Microsoft Clarity" },
  { re: /amplitude\.com/i, name: "Amplitude" },
  { re: /mixpanel\.com/i, name: "Mixpanel" },
  { re: /cdn\.segment\.com/i, name: "Segment" },
  { re: /posthog\.com/i, name: "PostHog" },
  { re: /plausible\.io/i, name: "Plausible" },
  { re: /matomo\.js|piwik\.js/i, name: "Matomo" },
  { re: /usefathom\.com/i, name: "Fathom" },
];

export async function checkTrustSignals(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const out: CheckResult[] = [];
  const body = ctx.homeBody;

  // 1. privacy policy link
  const privacyHit = ctx.csr
    ? null
    : findAnchor(body, /(?:href=["'][^"']*(?:privacy|конфиденциаль|персональн[^"']*данн|\/legal|\/policy)|>\s*(?:privacy|политик|конфиденциаль))/i);
  out.push(privacyHit || ctx.csr ? done("trust_privacy_link", privacyHit ? "pass" : "warn", "low", privacyHit ? 0 : 2, {
    ru: privacyHit ? "Ссылка на политику приватности найдена" : "Ссылка на политику приватности не найдена",
    en: privacyHit ? "Privacy policy link found" : "Privacy policy link missing",
  }, privacyHit || ctx.csr ? undefined : {
    code: "NO_PRIVACY_LINK",
    detail: {
      ru: "На главной нет ссылки на политику приватности: посетитель не видит, что происходит с его данными, а рекламные площадки и маркетплейсы при проверке просят её в первую очередь. Даже одностраничная /privacy снимает вопрос.",
      en: "The homepage has no privacy policy link: visitors cannot see what happens to their data, and ad networks or marketplaces ask for it first. Even a one-page /privacy settles it.",
    },
    evidence: [],
  }, Date.now() - t0) : csrSkip("trust_privacy_link", "ссылка на приватность не оценивалась", "privacy link not evaluated", t0));

  // 2. terms link
  const termsHit = ctx.csr ? null : findAnchor(body, /(?:href=["'][^"']*(?:terms|tos|условия|соглашен|agreement|\/legal)|>\s*(?:terms|условия|правила))/i);
  out.push(termsHit || ctx.csr ? done("trust_terms_link", termsHit ? "pass" : "warn", "low", termsHit ? 0 : 1, {
    ru: termsHit ? "Ссылка на условия использования найдена" : "Ссылка на условия использования не найдена",
    en: termsHit ? "Terms link found" : "Terms link missing",
  }, termsHit || ctx.csr ? undefined : {
    code: "NO_TERMS_LINK",
    detail: {
      ru: "Нет ссылки на условия использования: правила сервиса нигде не объявлены, при споре не на что ссылаться. Достаточно страницы /terms с базовыми пунктами.",
      en: "No terms-of-service link: the service rules are declared nowhere and there is nothing to reference in a dispute. A basic /terms page is enough.",
    },
    evidence: [],
  }, Date.now() - t0) : csrSkip("trust_terms_link", "условия не оценивались", "terms not evaluated", t0));

  // 3. contact channel
  const contactHit = ctx.csr ? null : findAnchor(body, /(?:href=["'][^"']*(?:mailto:|t\.me\/|telegram|whatsapp|\/contact|\/support|контак)|>\s*(?:contact|контакт|support|поддержка))/i);
  out.push(done("trust_contact_link", contactHit ? "pass" : "warn", "low", contactHit ? 0 : 1, {
    ru: contactHit ? "Канал связи указан (почта/Telegram/страница контактов)" : "Канал связи не найден",
    en: contactHit ? "Contact channel present (email/Telegram/contact page)" : "No contact channel found",
  }, contactHit ? undefined : {
    code: "NO_CONTACT",
    detail: {
      ru: "На главной не найдено ни почты, ни Telegram, ни страницы контактов: сайт выглядит как витрина без ответственного. Одна строка «связаться» сильно повышает доверие.",
      en: "No email, Telegram or contact page on the homepage: the site looks like a storefront with nobody behind it. A single 'contact' line raises trust a lot.",
    },
    evidence: [],
  }, Date.now() - t0));

  // 4. exposed mailto addresses (spam harvest surface, info)
  const mailtos = [...new Set((body.match(/mailto:([^"'?>\s]+)/gi) ?? [])
    .map((m) => m.replace(/^mailto:/i, "").trim())
    .filter((e) => /^[^@]+@[^@]+\.[^@]+$/.test(e)))];
  out.push(done("trust_email_harvest", "info", "low", 0, {
    ru: mailtos.length ? `Почтовые адреса в открытом виде: ${mailtos.length}` : "Почтовых адресов в разметке нет",
    en: mailtos.length ? `Plain-text email addresses: ${mailtos.length}` : "No email addresses in markup",
  }, mailtos.length ? {
    code: "EMAIL_HARVEST",
    detail: {
      ru: "Адреса в mailto: собирают спам-боты за минуты. Если ящик начнёт тонуть в спаме - замените на контакт-форму или добавьте honeypot.",
      en: "mailto: addresses are harvested by spam bots within minutes. If the inbox drowns, switch to a contact form or add a honeypot.",
    },
    evidence: mailtos.slice(0, 3).map((e) => e.slice(0, 40)),
  } : undefined, Date.now() - t0));

  // 5. analytics/trackers vs privacy disclosure (the GDPR/152-ФЗ angle)
  const trackers = TRACKERS.filter((tr) => tr.re.test(body)).map((tr) => tr.name);
  if (!trackers.length) {
    out.push(done("privacy_trackers_disclosure", "pass", "low", 0, {
      ru: "Известных трекеров не обнаружено",
      en: "No known trackers detected",
    }, undefined, Date.now() - t0));
  } else if (privacyHit) {
    out.push(done("privacy_trackers_disclosure", "pass", "low", 0, {
      ru: `Аналитика объявлена (${trackers.join(", ")})`,
      en: `Analytics disclosed (${trackers.join(", ")})`,
    }, undefined, Date.now() - t0));
  } else {
    out.push(done("privacy_trackers_disclosure", "warn", "low", 2, {
      ru: `Трекеры без упоминания приватности: ${trackers.join(", ")}`,
      en: `Trackers without a privacy disclosure: ${trackers.join(", ")}`,
    }, {
      code: "TRACKERS_UNDISCLOSED",
      detail: {
        ru: "На сайте работает аналитика (сбор идентификаторов), но ссылки на политику приватности нет. Это прямое нарушение GDPR и 152-ФЗ: пользователь не уведомлён об обработке. Добавьте страницу и ссылку на неё.",
        en: "Analytics runs on the site (identifier collection) but no privacy policy link exists - a direct GDPR violation: users are not notified of processing. Add a page and link it.",
      },
      evidence: trackers,
    }, Date.now() - t0));
  }

  // 6. JSON-LD structured data (info either way)
  const jsonld = /<script\b[^>]+type=["']application\/ld\+json["']/i.test(body);
  out.push(done("seo_jsonld", jsonld ? "pass" : "info", "low", 0, {
    ru: jsonld ? "JSON-LD разметка присутствует" : "JSON-LD разметка отсутствует",
    en: jsonld ? "JSON-LD structured data present" : "JSON-LD structured data missing",
  }, jsonld ? undefined : {
    code: "NO_JSONLD",
    detail: {
      ru: "Нет структурированных данных: поисковик показывает обычный сниппет вместо расширенного (организация, товар, FAQ) - CTR ниже.",
      en: "No structured data: the search engine shows a plain snippet instead of a rich one (organization, product, FAQ) - lower CTR.",
    },
    evidence: [],
  }, Date.now() - t0));

  // 7. charset declared
  const charsetOk = /<meta\b[^>]+charset=/i.test(body) || /charset=/i.test(ctx.homeHeaders["content-type"] ?? "");
  out.push(done("seo_charset", charsetOk ? "pass" : "warn", "low", charsetOk ? 0 : 1, {
    ru: charsetOk ? "Кодировка объявлена" : "Кодировка не объявлена",
    en: charsetOk ? "Charset is declared" : "Charset is not declared",
  }, charsetOk ? undefined : {
    code: "NO_CHARSET",
    detail: {
      ru: "Без явного charset браузер угадывает кодировку: русский текст может превратиться в «РџСЂРёРІРµС‚».",
      en: "Without an explicit charset the browser guesses encoding: text can turn into mojibake.",
    },
    evidence: [],
  }, Date.now() - t0));

  // 8. AI-builder fingerprint (info - feeds the trust story, no penalty)
  const builder = detectPlatform(body, ctx.host);
  out.push(done("ai_builder_marker", "info", "low", 0, {
    ru: builder ? `Признаки ИИ-билдера: ${builder}` : "Маркеров ИИ-билдеров не обнаружено",
    en: builder ? `AI-builder fingerprint: ${builder}` : "No AI-builder fingerprints",
  }, builder ? {
    code: "AI_BUILDER",
    detail: {
      ru: `В разметке видны следы ${builder}. Это нормально для AppSeal: мы как раз проверяем ИИ-приложения. Полезно знать - у билдеров есть типовые дыры (открытые API-ключи, отсутствие заголовков), и именно они чаще всего встречаются в отчёте.`,
      en: `The markup shows ${builder} traces. Normal for AppSeal: AI-built apps are exactly what we inspect. Good to know - AI builders have typical blind spots (exposed API keys, missing headers), and those dominate the report.`,
    },
    evidence: [`platform: ${builder}`],
  } : undefined, Date.now() - t0));

  // 9. third-party script inventory (info - a light SBOM)
  const scriptTags = body.match(/<script\b[^>]+src=["'][^"']+["'][^>]*>/gi) ?? [];
  let originHost = "";
  try {
    originHost = new URL(ctx.origin).host;
  } catch {
    originHost = "";
  }
  const externalHosts = [...new Set(scriptTags
    .map((tag) => tag.match(/src=["']([^"']+)["']/i)?.[1] ?? "")
    .map((src) => {
      try {
        return new URL(src, ctx.origin).host;
      } catch {
        return "";
      }
    })
    .filter((h) => h && h !== originHost))];
  out.push(done("supply_third_party_scripts", "info", "low", 0, {
    ru: externalHosts.length
      ? `Сторонние скрипты (${externalHosts.length}): ${externalHosts.slice(0, 3).join(", ")}`
      : "Сторонних скриптов нет",
    en: externalHosts.length
      ? `Third-party scripts (${externalHosts.length}): ${externalHosts.slice(0, 3).join(", ")}`
      : "No third-party scripts",
  }, externalHosts.length ? {
    code: "THIRD_PARTY_INVENTORY",
    detail: {
      ru: "Каждый внешний скрипт - это чужой код на вашей странице, который может измениться без вашего ведома (поставка данных, зависимость от чужого аптайма). Список полезно знать и периодически чистить: меньше скриптов - быстрее и безопаснее.",
      en: "Every external script is someone else's code on your page that can change without your knowledge. Knowing the list and pruning it regularly makes the site faster and safer.",
    },
    evidence: externalHosts.slice(0, 6).map((h) => truncate(h, 60)),
  } : undefined, Date.now() - t0));

  return out;
}

/* ------------------------------------------------------------------ */
/* Accessibility quick pass + form hygiene                             */
/* ------------------------------------------------------------------ */

export async function checkTrustA11y(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const out: CheckResult[] = [];
  const body = ctx.homeBody;

  // 1. exactly one h1
  if (ctx.csr) {
    out.push(csrSkip("a11y_headings", "заголовки не оценивались", "headings not evaluated", t0));
  } else {
    const h1s = (body.match(/<h1\b/gi) ?? []).length;
    out.push(done("a11y_headings", h1s === 1 ? "pass" : "warn", "low", h1s === 1 ? 0 : 2, {
      ru: h1s === 1 ? "Ровно один заголовок h1" : h1s === 0 ? "Заголовок h1 отсутствует" : `Несколько h1 (${h1s})`,
      en: h1s === 1 ? "Exactly one h1 heading" : h1s === 0 ? "No h1 heading" : `Multiple h1 headings (${h1s})`,
    }, h1s === 1 ? undefined : {
      code: "H1_STRUCTURE",
      detail: {
        ru: "У страницы должен быть один главный заголовок h1: скринридеры и поисковики используют его как якорь «о чём страница». Ноль или несколько путают структуру документа.",
        en: "A page needs exactly one h1: screen readers and search engines use it as the anchor of the page. Zero or several break the document structure.",
      },
      evidence: [`h1 count: ${h1s}`],
    }, Date.now() - t0));
  }

  // 2. landmarks: nav / main / footer
  const hasNav = /<nav\b|role=["']navigation["']/i.test(body);
  const hasMain = /<main\b|role=["']main["']/i.test(body);
  const hasFooter = /<footer\b|role=["']contentinfo["']/i.test(body);
  const missing = [
    !hasNav ? "nav" : "",
    !hasMain ? "main" : "",
    !hasFooter ? "footer" : "",
  ].filter(Boolean);
  out.push(done("a11y_landmarks", missing.length ? "warn" : "pass", "low", missing.length ? 1 : 0, {
    ru: missing.length ? `Нет семантических блоков: ${missing.join(", ")}` : "Семантические блоки на месте (nav/main/footer)",
    en: missing.length ? `Missing landmarks: ${missing.join(", ")}` : "Semantic landmarks present (nav/main/footer)",
  }, missing.length ? {
    code: "NO_LANDMARKS",
    detail: {
      ru: `В разметке нет тегов ${missing.join("/")} : скринридер не может «прыгнуть» к навигации или содержимому, пользователи клавиатуры теряются на странице.`,
      en: `The markup lacks ${missing.join("/")} tags: screen readers cannot jump to navigation or content, keyboard users get lost.`,
    },
    evidence: missing.map((m) => `missing: <${m}>`),
  } : undefined, Date.now() - t0));

  // 3. form inputs have labels
  const inputs = (body.match(/<input\b[^>]*>/gi) ?? [])
    .filter((inp) => !/type=["'](?:hidden|submit|button|image|reset)["']/i.test(inp));
  const unlabeled = inputs.filter((inp) => {
    if (/\baria-label\b|\baria-labelledby\b/i.test(inp)) return false;
    const id = inp.match(/\bid=["']([^"']+)["']/i)?.[1];
    if (id && new RegExp(`<label[^>]+for=["']${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i").test(body)) return false;
    return true;
  });
  out.push(done("a11y_form_labels", ctx.csr ? "info" : !inputs.length ? "info" : unlabeled.length ? "warn" : "pass", "low",
    ctx.csr || !inputs.length ? 0 : unlabeled.length ? 2 : 0, {
    ru: ctx.csr ? "Поля формы не оценивались (CSR)" : !inputs.length
      ? "Полей ввода на главной нет - проверка не применима"
      : unlabeled.length
        ? `У ${unlabeled.length} из ${inputs.length} полей нет подписи`
        : "У всех полей ввода есть подписи",
    en: ctx.csr ? "Form fields not evaluated (CSR)" : !inputs.length
      ? "No inputs on the homepage - check not applicable"
      : unlabeled.length
        ? `${unlabeled.length} of ${inputs.length} inputs have no label`
        : "All inputs have labels",
  }, ctx.csr || !inputs.length || !unlabeled.length ? undefined : {
    code: "INPUT_NO_LABEL",
    detail: {
      ru: "Поля без label/aria-label: скринридер зачитывает «текстовое поле, пусто», автозаполнение работает хуже. Каждому полю нужен видимый или aria-label.",
      en: "Inputs without a label/aria-label: screen readers announce 'text field, blank' and autofill degrades. Every input needs a visible or aria label.",
    },
    evidence: unlabeled.slice(0, 3).map((i) => truncate(i, 80)),
  }, Date.now() - t0));

  // 4. icon-only buttons need accessible names
  const btns = body.match(/<button\b[^>]*>[\s\S]*?<\/button>/gi) ?? [];
  const emptyBtns = btns.filter((b) => {
    if (/\baria-label\b|\baria-labelledby\b|\btitle=/i.test(b)) return false;
    const text = b.replace(/<[^>]+>/g, " ").replace(/&\w+;/g, " ").trim();
    return text.length < 2;
  });
  out.push(done("a11y_button_names", ctx.csr ? "info" : !btns.length ? "info" : emptyBtns.length ? "warn" : "pass", "low",
    ctx.csr || !btns.length ? 0 : emptyBtns.length ? 1 : 0, {
    ru: ctx.csr ? "Кнопки не оценивались (CSR)" : !btns.length
      ? "Кнопок на главной нет - проверка не применима"
      : emptyBtns.length
        ? `${emptyBtns.length} кнопок без названия (иконки без aria-label)`
        : "У всех кнопок есть названия",
    en: ctx.csr ? "Buttons not evaluated (CSR)" : !btns.length
      ? "No buttons on the homepage - check not applicable"
      : emptyBtns.length
        ? `${emptyBtns.length} button(s) without a name (icons without aria-label)`
        : "All buttons have accessible names",
  }, ctx.csr || !btns.length || !emptyBtns.length ? undefined : {
    code: "BUTTON_NO_NAME",
    detail: {
      ru: "Кнопка-иконка без aria-label для скринридера звучит как «кнопка». Голосовой ввод («нажать корзину») и скринридеры не смогут её опознать. Добавьте aria-label.",
      en: "An icon button without aria-label reads as just 'button' to screen readers. Voice control ('click cart') and screen readers cannot identify it. Add aria-label.",
    },
    evidence: emptyBtns.slice(0, 2).map((b) => truncate(b.replace(/\s+/g, " "), 80)),
  }, Date.now() - t0));

  // 5. password field over plain http
  const hasPassword = /<input[^>]+type=["']password["']/i.test(body);
  if (!ctx.isHttp) {
    out.push(done("form_password_http", "skip", "low", 0, {
      ru: "Пароли по открытому http: не применимо (сайт по https)",
      en: "Passwords over plain http: not applicable (site is https)",
    }, undefined, Date.now() - t0));
  } else if (hasPassword) {
    out.push(done("form_password_http", "fail", "high", 8, {
      ru: "Поле пароля на странице без HTTPS",
      en: "Password field on a page without HTTPS",
    }, {
      code: "PASSWORD_OVER_HTTP",
      detail: {
        ru: "Пароль отправляется открытым текстом: его видно в общественном Wi-Fi и на любом узле маршрута. Поставьте HTTPS и перенаправляйте http на него - это первое, что нужно исправить.",
        en: "The password travels in plain text: visible on public Wi-Fi and at every node along the route. Install HTTPS and redirect http to it - fix this first.",
      },
      evidence: [],
    }, Date.now() - t0));
  } else {
    out.push(done("form_password_http", "info", "low", 0, {
      ru: "Полей пароля в разметке нет",
      en: "No password fields in markup",
    }, undefined, Date.now() - t0));
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Performance hygiene                                                 */
/* ------------------------------------------------------------------ */

export async function checkTrustPerf(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const out: CheckResult[] = [];
  const body = ctx.homeBody;

  // 1. homepage HTML weight
  const bytes = body.length;
  out.push(done("perf_page_weight", bytes > 1_500_000 ? "warn" : "pass", "low", bytes > 1_500_000 ? 2 : 0, {
    ru: bytes > 1_500_000 ? `HTML главной раздут (${Math.round(bytes / 1024)} КБ)` : `HTML главной в норме (${Math.round(bytes / 1024)} КБ)`,
    en: bytes > 1_500_000 ? `Homepage HTML is bloated (${Math.round(bytes / 1024)} KB)` : `Homepage HTML is fine (${Math.round(bytes / 1024)} KB)`,
  }, bytes > 1_500_000 ? {
    code: "HTML_BLOAT",
    detail: {
      ru: "HTML главной больше полутора мегабайт: First Paint уезжает на секунды на мобильных сетях. Обычно виноваты инлайн-данные или SVG-хвосты - вынесите их в отдельные ресурсы.",
      en: "The homepage HTML exceeds 1.5 MB: First Paint slides into seconds on mobile networks. Inline data or SVG tails are usually to blame - move them into separate resources.",
    },
    evidence: [`html size: ${Math.round(bytes / 1024)} KB`],
  } : undefined, Date.now() - t0));

  // 2. render-blocking scripts in <head> (type=module is deferred by spec)
  const head = body.match(/<head[\s\S]*?<\/head>/i)?.[0] ?? body;
  const blocking = (head.match(/<script\b[^>]*\bsrc=["'][^"']+["'][^>]*>/gi) ?? [])
    .filter((tag) => !/\basync\b|\bdefer\b|type=["']module["']/i.test(tag));
  out.push(done("perf_render_blocking", blocking.length ? "warn" : "pass", "low", blocking.length ? 1 : 0, {
    ru: blocking.length ? `Блокирующие скрипты в <head>: ${blocking.length}` : "Блокирующих скриптов в <head> нет",
    en: blocking.length ? `Render-blocking scripts in <head>: ${blocking.length}` : "No render-blocking scripts in <head>",
  }, blocking.length ? {
    code: "RENDER_BLOCKING",
    detail: {
      ru: "Скрипты в <head> без async/defer останавливают отрисовку страницы, пока не скачаются. Добавьте defer или перенесите их в конец <body> - страница откроется заметно быстрее.",
      en: "Scripts in <head> without async/defer freeze page rendering until they download. Add defer or move them to the end of <body> - the page opens noticeably faster.",
    },
    evidence: blocking.slice(0, 3).map((b) => truncate(b.match(/src=["']([^"']+)["']/i)?.[1] ?? "", 80)),
  } : undefined, Date.now() - t0));

  // 3. console.log leftovers in inline scripts (debug hygiene, info)
  if (ctx.csr) {
    out.push(csrSkip("debug_console", "инлайновые скрипты не оценивались", "inline scripts not evaluated", t0));
  } else {
    let consoleHits = 0;
    for (const script of body.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi) ?? []) {
      const n = (script.match(/console\.log\s*\(/g) ?? []).length;
      consoleHits += n;
    }
    out.push(done("debug_console", "info", "low", 0, {
      ru: consoleHits ? `console.log в инлайновых скриптах: ${consoleHits} (шум в консоли пользователя)` : "Инлайновые скрипты без console.log",
      en: consoleHits ? `console.log in inline scripts: ${consoleHits} (user console noise)` : "Inline scripts are free of console.log",
    }, consoleHits ? {
      code: "CONSOLE_LOG",
      detail: {
        ru: "Инлайновый код печатает в консоль посетителя: в лучшем случае это шум, в худшем - логи показывают внутренние структуры данных. Уберите отладочный вывод из продакшена.",
        en: "Inline code prints to the visitor's console: at best noise, at worst logs reveal internal data structures. Strip debug output from production.",
      },
      evidence: [`count: ${consoleHits}`],
    } : undefined, Date.now() - t0));
  }

  return out;
}
