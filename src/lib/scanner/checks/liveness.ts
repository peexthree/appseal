import type { CheckResult, Severity, TechPassport } from "../types";
import { extractLinks, safeFetch } from "../fetcher";

interface Ctx {
  origin: string;
  host: string;
  homeBody: string;
  homeHeaders: Record<string, string>;
  isHttp: boolean;
  /** prefix for path probes (the built-in demo target lives under /api/demo-target) */
  basePath?: string;
  /** v0.2: the page is a client-side render shell - liveness text checks
   *  cannot judge it from static HTML and are reported as info */
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
): CheckResult => ({ id, category: "liveness", status, severity, penalty, title, durationMs, finding });

/** visible markup without scripts/styles (context filter for text checks) */
function visibleText(body: string): string {
  return body.replace(/<(?:code|pre|script|style)[\s\S]*?<\/(?:code|pre|script|style)>/gi, " ");
}

function isMetaMention(around: string): boolean {
  return /(?:заглуш|placeholder text|placeholder content|иском|паттерн|проверк|сканер|scanner|детект|detect)/i.test(around);
}

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

/* ------------------------------------------------------------------ */
/* Placeholder content (four granular checks)                          */
/* ------------------------------------------------------------------ */

interface PhRule { id: string; re: RegExp; label: { ru: string; en: string }; pen: number }

const PH_RULES: PhRule[] = [
  { id: "ph_lorem", re: /lorem ipsum/i, label: { ru: "lorem ipsum", en: "lorem ipsum" }, pen: 3 },
  { id: "ph_todo", re: /\bTODO:\s|\bFIXME:\s/, label: { ru: "TODO/FIXME", en: "TODO/FIXME" }, pen: 3 },
  { id: "ph_soon", re: /coming soon|under construction|скоро будет|сайт в разработке/i, label: { ru: "coming soon / в разработке", en: "coming soon / under construction" }, pen: 4 },
  { id: "ph_your_text", re: /your (?:content|text) here|add your (?:text|description|content)|sample (?:text|content|product)|placeholder (?:text|content)|xx\/xx\/x{4}/i, label: { ru: "шаблонные заглушки", en: "template placeholders" }, pen: 3 },
];

export async function checkPlaceholder(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  if (ctx.csr) {
    return [csrSkip("ph_lorem", "Заглушки не оценивались", "Placeholders were not evaluated", t0)];
  }
  const visible = visibleText(ctx.homeBody);
  return PH_RULES.map((p) => {
    const m = visible.match(p.re);
    if (!m) {
      return done(p.id, "pass", "low", 0, {
        ru: `Заглушки «${p.label.ru}» не найдены`,
        en: `No "${p.label.en}" placeholders`,
      }, undefined, Date.now() - t0);
    }
    const idx = visible.indexOf(m[0]);
    const around = visible.slice(Math.max(0, idx - 100), idx + 100);
    if (isMetaMention(around)) {
      return done(p.id, "pass", "low", 0, {
        ru: `Заглушки «${p.label.ru}» не найдены`,
        en: `No "${p.label.en}" placeholders`,
      }, undefined, Date.now() - t0);
    }
    return done(p.id, "warn", "low", p.pen, {
      ru: `На сайте заглушка: ${p.label.ru}`,
      en: `Placeholder found: ${p.label.en}`,
    }, {
      code: "PLACEHOLDER_CONTENT",
      detail: {
        ru: `Найден текст-заглушка «${p.label.ru}». Для посетителя это маркер брошенного проекта, для конкурентов - сигнал, что сайтом никто не занимается.`,
        en: `A placeholder text "${p.label.en}" was found. To visitors it marks an abandoned project.`,
      },
      evidence: [`"${m[0].slice(0, 40)}"`],
    }, Date.now() - t0);
  });
}

/* ------------------------------------------------------------------ */
/* Default server/starter pages                                        */
/* ------------------------------------------------------------------ */

const DEFAULT_PAGES: { re: RegExp; name: string }[] = [
  { re: /Welcome to (?:nginx|nginx!)/i, name: "nginx default page" },
  { re: /Apache2 (?:Ubuntu )?Default Page|It works!/i, name: "Apache default page" },
  { re: /deployed but not configured|no deployment configured/i, name: "Vercel/Netlify empty deployment" },
  { re: /This is the default index page of your website/i, name: "hosting default page" },
  { re: /Quick website setup|default web site page/i, name: "panel default page" },
];

export async function checkDefaultPage(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const hit = DEFAULT_PAGES.find((d) => d.re.test(ctx.homeBody));
  if (hit) {
    return [done("default_page", "fail", "high", 10, {
      ru: `Сайт отдаёт дефолтную страницу (${hit.name})`,
      en: `Site serves a default page (${hit.name})`,
    }, {
      code: "DEFAULT_PAGE",
      detail: {
        ru: "Главная страница - стандартная заглушка сервера или хостинга: приложение не задеплоено или удалено. Домен жив, но проекта за ним нет.",
        en: "The homepage is a server or hosting default stub: the app is not deployed or has been removed. The domain is alive but there is no project behind it.",
      },
      evidence: [`marker: ${hit.name}`],
    }, Date.now() - t0)];
  }
  return [done("default_page", "pass", "high", 0, {
    ru: "Дефолтных страниц сервера нет",
    en: "No server default pages",
  }, undefined, Date.now() - t0)];
}

/* ------------------------------------------------------------------ */
/* Rendered JS errors / undefined in content                           */
/* ------------------------------------------------------------------ */

export async function checkRenderedErrors(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  if (ctx.csr) {
    return [csrSkip("rendered_errors", "ошибки разметки не оценивались", "markup errors were not evaluated", t0)];
  }
  const evidence: string[] = [];
  const titleMatch = ctx.homeBody.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : "";
  if (/^(undefined|null|nan)\b/i.test(title.trim())) {
    evidence.push(`title: "${title.slice(0, 60)}"`);
  }
  const textChunks = ctx.homeBody.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const und = textChunks.match(/>undefined</g)?.length ?? 0;
  const nan = textChunks.match(/>NaN</g)?.length ?? 0;
  if (und > 0) evidence.push(`"undefined" rendered ${und}× in markup`);
  if (nan > 0) evidence.push(`"NaN" rendered ${nan}× in markup`);
  if (evidence.length) {
    return [done(
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
    )];
  }
  return [done("rendered_errors", "pass", "low", 0, {
    ru: "Ошибок в разметке не видно",
    en: "No visible markup errors",
  }, undefined, Date.now() - t0)];
}

/* ------------------------------------------------------------------ */
/* Tiny/empty page                                                     */
/* ------------------------------------------------------------------ */

export async function checkTinyPage(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const size = ctx.homeBody.length;
  if (size < 500) {
    return [done("tiny_page", "warn", "high", 8, {
      ru: "Главная страница почти пустая",
      en: "The homepage is nearly empty",
    }, {
      code: "TINY_PAGE",
      detail: {
        ru: `HTML главной - всего ${size} байт: страница-обрубок или сломанная сборка. Пользователи (и сканеры доверия) видят пустоту.`,
        en: `The homepage HTML is just ${size} bytes: a stub page or a broken build. Users (and trust scanners) see emptiness.`,
      },
      evidence: [`size: ${size} bytes`],
    }, Date.now() - t0)];
  }
  return [done("tiny_page", "pass", "high", 0, {
    ru: "Страница содержит полноценную разметку",
    en: "The page contains full markup",
  }, undefined, Date.now() - t0)];
}

/* ------------------------------------------------------------------ */
/* Broken internal links                                               */
/* ------------------------------------------------------------------ */

export async function checkBrokenLinks(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const all = extractLinks(ctx.homeBody, ctx.origin, 8);
  const self = (ctx.origin + (ctx.basePath ?? "")).replace(/\/+$/, "");
  const links = all.filter((u) => u.replace(/\/+$/, "") !== self);
  if (!links.length) {
    return [done("broken_links", "info", "medium", 0, {
      ru: "Внутренних ссылок для проверки не найдено",
      en: "No internal links to check",
    }, undefined, Date.now() - t0)];
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
    return [done(
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
    )];
  }
  return [done("broken_links", "pass", "medium", 0, {
    ru: `Внутренние ссылки живы (проверено ${results.length})`,
    en: `Internal links alive (${results.length} checked)`,
  }, undefined, Date.now() - t0)];
}

/* ------------------------------------------------------------------ */
/* Meta health (one check per tag)                                     */
/* ------------------------------------------------------------------ */

export async function checkMetaHealth(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const out: CheckResult[] = [];

  const titleMatch = ctx.homeBody.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : "";
  out.push(done("meta_title", title.length >= 3 ? "pass" : "warn", "low", title.length >= 3 ? 0 : 3, {
    ru: title.length >= 3 ? "Заголовок страницы заполнен" : "Заголовок страницы отсутствует",
    en: title.length >= 3 ? "Page title is set" : "Page title is missing",
  }, title.length >= 3 ? undefined : {
    code: "META_TITLE_MISSING",
    detail: {
      ru: "Пустой <title>: вкладка браузера безымянная, поисковик не знает, о чём страница, а закладка выглядит как «undefined».",
      en: "An empty <title>: a nameless browser tab, search engines guess, bookmarks show a blank.",
    },
    evidence: [`title: "${title.slice(0, 60)}"`],
  }, Date.now() - t0));

  const descMatch =
    ctx.homeBody.match(/<meta\b[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
    ctx.homeBody.match(/<meta\b[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  const desc = descMatch ? descMatch[1].replace(/\s+/g, " ").trim() : "";
  out.push(done("meta_description", desc.length >= 10 ? "pass" : "warn", "low", desc.length >= 10 ? 0 : 3, {
    ru: desc.length >= 10 ? "Meta description заполнена" : "Meta description отсутствует",
    en: desc.length >= 10 ? "Meta description is set" : "Meta description is missing",
  }, desc.length >= 10 ? undefined : {
    code: "META_DESCRIPTION_MISSING",
    detail: {
      ru: "Нет <meta name=description>: сниппет в поиске собирается из случайного текста страницы.",
      en: "No <meta name=description>: the search snippet is assembled from random page text.",
    },
    evidence: [`description: "${desc.slice(0, 60)}"`],
  }, Date.now() - t0));

  const viewport = /<meta\b[^>]+name=["']viewport["']/i.test(ctx.homeBody);
  out.push(done("meta_viewport", viewport ? "pass" : "warn", "low", viewport ? 0 : 3, {
    ru: viewport ? "Viewport-метатег на месте" : "Viewport-метатег отсутствует",
    en: viewport ? "Viewport meta tag is set" : "Viewport meta tag is missing",
  }, viewport ? undefined : {
    code: "VIEWPORT_MISSING",
    detail: {
      ru: "Без <meta viewport> мобильные браузеры рендерят сайт как 980px-десктоп: текст мелкий, тапать больно.",
      en: "Without <meta viewport> mobile browsers render the site as a 980px desktop: tiny text, painful taps.",
    },
    evidence: [],
  }, Date.now() - t0));

  const langMatch = ctx.homeBody.match(/<html\b[^>]*\blang=["']([a-z-]+)["']/i);
  out.push(done("meta_lang", langMatch ? "pass" : "warn", "low", langMatch ? 0 : 2, {
    ru: langMatch ? `Язык страницы объявлен (${langMatch[1]})` : "Атрибут lang у <html> отсутствует",
    en: langMatch ? `Page language declared (${langMatch[1]})` : "Missing lang attribute on <html>",
  }, langMatch ? undefined : {
    code: "HTML_LANG_MISSING",
    detail: {
      ru: "Без lang у <html> скринридеры выбирают неверное произношение, а поисковики путают язык страницы.",
      en: "Without lang on <html> screen readers pick the wrong pronunciation and search engines misread the page language.",
    },
    evidence: [],
  }, Date.now() - t0));

  const noindex = /<meta\b[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(ctx.homeBody) ||
    /<meta\b[^>]+content=["'][^"']*noindex[^"']*["'][^>]+name=["']robots["']/i.test(ctx.homeBody);
  out.push(done("robots_noindex", noindex ? "warn" : "pass", "medium", noindex ? 8 : 0, {
    ru: noindex ? "Страница закрыта от индексации (noindex)" : "Индексация не запрещена",
    en: noindex ? "Page is noindex (hidden from search)" : "Indexing is not blocked",
  }, noindex ? {
    code: "ROBOTS_NOINDEX",
    detail: {
      ru: "Мета-тег noindex запрещает поисковикам показывать сайт: приложение невидимо в поиске целиком. Если это не staging - уберите noindex.",
      en: "A noindex meta tag tells search engines to hide the site: the app is invisible in search entirely. If this is not staging - remove noindex.",
    },
    evidence: ["<meta robots noindex>"],
  } : undefined, Date.now() - t0));

  const canonical = /<link\b[^>]+rel=["']canonical["']/i.test(ctx.homeBody);
  out.push(done("meta_canonical", canonical ? "pass" : "info", "low", 0, {
    ru: canonical ? "Canonical-ссылка задана" : "Canonical-ссылка не задана",
    en: canonical ? "Canonical link is set" : "Canonical link is not set",
  }, canonical ? undefined : {
    code: "NO_CANONICAL",
    detail: {
      ru: "Без rel=canonical поисковики сами выбирают «главную» версию страницы из дублей (параметры, www, слэши).",
      en: "Without rel=canonical search engines pick their own 'primary' copy from duplicates (params, www, slashes).",
    },
    evidence: [],
  }, Date.now() - t0));

  return out;
}

/* ------------------------------------------------------------------ */
/* Favicon                                                             */
/* ------------------------------------------------------------------ */

export async function checkFavicon(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const declared = /<link[^>]+rel=["'](?:shortcut )?icon["']/i.test(ctx.homeBody);
  if (declared) {
    return [done("favicon", "pass", "low", 0, {
      ru: "Favicon объявлен в разметке",
      en: "Favicon is declared in markup",
    }, undefined, Date.now() - t0)];
  }
  const r = await safeFetch(ctx.origin + "/favicon.ico", { timeoutMs: 4000, maxBody: 256 });
  if (r.status === 200 && (r.bodyBytes > 100 || /image\//i.test(r.contentType))) {
    return [done("favicon", "pass", "low", 0, {
      ru: "Favicon доступен по умолчанию (/favicon.ico)",
      en: "Favicon served by default (/favicon.ico)",
    }, undefined, Date.now() - t0)];
  }
  return [done("favicon", "warn", "low", 2, {
    ru: "Favicon отсутствует",
    en: "Favicon is missing",
  }, {
    code: "NO_FAVICON",
    detail: {
      ru: "У вкладки браузера и в закладках - серый квадрат по умолчанию: мелочь, но заметный признак небрежности.",
      en: "The browser tab and bookmarks show the default grey square: a small but telling sign of neglect.",
    },
    evidence: [],
  }, Date.now() - t0)];
}

/* ------------------------------------------------------------------ */
/* Open Graph (three granular checks)                                  */
/* ------------------------------------------------------------------ */

export async function checkOpenGraphHealth(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const og = (prop: string) => new RegExp(`<meta[^>]+property=["']og:${prop}["']`, "i").test(ctx.homeBody);
  const mk = (id: string, prop: string, extra: { ru: string; en: string }, pen: number): CheckResult =>
    og(prop)
      ? done(id, "pass", "low", 0, {
          ru: `og:${prop} настроен`,
          en: `og:${prop} is set`,
        }, undefined, Date.now() - t0)
      : done(id, "warn", "low", pen, {
          ru: `og:${prop} отсутствует`,
          en: `og:${prop} is missing`,
        }, {
          code: "OG_MISSING",
          detail: {
            ru: `Без og:${prop} ссылки в Telegram, Twitter/X и Discord показываются без ${extra.ru}.`,
            en: `Without og:${prop}, links shared in Telegram, Twitter/X and Discord show no ${extra.en}.`,
          },
          evidence: [`missing: og:${prop}`],
        }, Date.now() - t0);

  return [
    mk("og_title", "title", { ru: "заголовка", en: "a title" }, 2),
    mk("og_description", "description", { ru: "описания", en: "a description" }, 2),
    mk("og_image", "image", { ru: "картинки-превью", en: "preview image" }, 2),
  ];
}

/* ------------------------------------------------------------------ */
/* Mixed content & dev leaks                                           */
/* ------------------------------------------------------------------ */

export async function checkMixedContentDom(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const out: CheckResult[] = [];

  const localhostRe = /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/[^\s"'>]*)?/gi;
  const localMatches = ctx.homeBody.match(localhostRe) ?? [];
  out.push(done("localhost_links", localMatches.length ? "warn" : "pass", "low", localMatches.length ? 3 : 0, {
    ru: localMatches.length ? "Найдены ссылки на localhost" : "Ссылок на localhost нет",
    en: localMatches.length ? "Links to localhost found" : "No localhost links",
  }, localMatches.length ? {
    code: "LOCALHOST_LEAK",
    detail: {
      ru: "В HTML захардкожены ссылки на localhost/127.0.0.1 - рудименты разработки. У пользователей они ведут в никуда.",
      en: "The HTML contains hardcoded localhost/127.0.0.1 links - development leftovers. They lead nowhere for real users.",
    },
    evidence: localMatches.slice(0, 3).map((m) => m.slice(0, 60)),
  } : undefined, Date.now() - t0));

  const mixed: string[] = [];
  if (!ctx.isHttp) {
    const mixedMatches = ctx.homeBody.match(/(?:src|href)=["'](http:\/\/[^"'>]+)["']/gi) ?? [];
    for (const tag of mixedMatches) {
      const url = tag.replace(/^(?:src|href)=["']/i, "").replace(/["']$/, "");
      if (!url.startsWith("http://www.w3.org") && !url.startsWith("http://schema.org")) {
        mixed.push(url.slice(0, 60));
        if (mixed.length >= 4) break;
      }
    }
  }
  out.push(done("mixed_content", mixed.length ? "warn" : "pass", "low", mixed.length ? 4 : 0, {
    ru: mixed.length ? "Mixed content: ресурсы по http://" : "Mixed content не найден",
    en: mixed.length ? "Mixed content: http:// resources" : "No mixed content",
  }, mixed.length ? {
    code: "MIXED_CONTENT",
    detail: {
      ru: "На https-странице грузятся ресурсы по http://: браузер блокирует их, в консоли - предупреждения, часть контента не работает.",
      en: "An https page loads http:// resources: browsers block them, the console shows warnings, some content breaks.",
    },
    evidence: mixed,
  } : undefined, Date.now() - t0));

  return out;
}

/* ------------------------------------------------------------------ */
/* Third-party script hygiene (SRI, old jQuery)                        */
/* ------------------------------------------------------------------ */

export async function checkScriptHygiene(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  const out: CheckResult[] = [];

  const scriptTags = ctx.homeBody.match(/<script\b[^>]+src=["'][^"']+["'][^>]*>/gi) ?? [];
  const originHost = (() => {
    try {
      return new URL(ctx.origin).host;
    } catch {
      return "";
    }
  })();
  const crossOriginScripts = scriptTags
    .map((tag) => {
      const src = tag.match(/src=["']([^"']+)["']/i)?.[1] ?? "";
      let host = "";
      try {
        host = new URL(src, ctx.origin).host;
      } catch {
        host = "";
      }
      return { tag, src, host };
    })
    .filter((s) => s.host && s.host !== originHost);
  const noSri = crossOriginScripts.filter((s) => !/\bintegrity=/i.test(s.tag));
  if (crossOriginScripts.length) {
    out.push(done("sri_missing", noSri.length ? "warn" : "pass", "low", noSri.length ? 3 : 0, {
      ru: noSri.length ? "Сторонние скрипты без SRI" : "Сторонние скрипты подписаны (SRI)",
      en: noSri.length ? "Third-party scripts without SRI" : "Third-party scripts have SRI",
    }, noSri.length ? {
      code: "SRI_MISSING",
      detail: {
        ru: "Внешние скрипты загружаются без атрибута integrity: если CDN скомпрометируют, на странице исполнится чужой код. Добавьте SRI-хэши или переносите скрипты на свой домен.",
        en: "External scripts load without an integrity attribute: a compromised CDN means arbitrary code on your page. Add SRI hashes or self-host the scripts.",
      },
      evidence: noSri.slice(0, 3).map((s) => s.src.slice(0, 80)),
    } : undefined, Date.now() - t0));
  } else {
    out.push(done("sri_missing", "pass", "low", 0, {
      ru: "Сторонних <script src> не обнаружено",
      en: "No third-party <script src> found",
    }, undefined, Date.now() - t0));
  }

  const jq = ctx.homeBody.match(/jquery[.-](?:1\.|2\.|3\.[0-4]\.)/i);
  out.push(done("jquery_outdated", jq ? "warn" : "pass", "low", jq ? 3 : 0, {
    ru: jq ? "Устаревшая версия jQuery (1.x/2.x/3.0-3.4)" : "jQuery не найден или актуален",
    en: jq ? "Outdated jQuery (1.x/2.x/3.0-3.4)" : "jQuery not found or up to date",
  }, jq ? {
    code: "JQUERY_OUTDATED",
    detail: {
      ru: "Старые ветки jQuery содержат известные XSS (например, $.html() и $.ajax с переданной строкой). Обновитесь до 3.5+.",
      en: "Old jQuery branches carry known XSS (e.g. $.html() and string-based $.ajax). Upgrade to 3.5+.",
    },
    evidence: [jq[0]],
  } : undefined, Date.now() - t0));

  return out;
}

/* ------------------------------------------------------------------ */
/* Image accessibility (alt coverage)                                  */
/* ------------------------------------------------------------------ */

export async function checkImgAlt(ctx: Ctx): Promise<CheckResult[]> {
  const t0 = Date.now();
  if (ctx.csr) {
    return [csrSkip("img_alt", "альтернативные тексты не оценивались", "image alt texts were not evaluated", t0)];
  }
  const imgs = ctx.homeBody.match(/<img\b[^>]*>/gi) ?? [];
  const total = imgs.length;
  if (total === 0) {
    return [done("img_alt", "pass", "low", 0, {
      ru: "Изображений на странице нет - проверка не применима",
      en: "No images on the page - check not applicable",
    }, undefined, Date.now() - t0)];
  }
  const withAlt = imgs.filter((m) => /\balt=/i.test(m)).length;
  const missing = total - withAlt;
  const ratio = missing / total;
  if (ratio > 0.3) {
    return [done("img_alt", "warn", "low", 2, {
      ru: `У ${missing} из ${total} изображений нет alt`,
      en: `${missing} of ${total} images have no alt`,
    }, {
      code: "IMG_ALT_MISSING",
      detail: {
        ru: "Картинки без alt: скринридеры читают путь файла, поисковики не индексируют содержимое. Добавьте осмысленные alt-тексты.",
        en: "Images without alt: screen readers read file paths, search engines cannot index the content. Add meaningful alt texts.",
      },
      evidence: [`alt coverage: ${withAlt}/${total}`],
    }, Date.now() - t0)];
  }
  return [done("img_alt", "pass", "low", 0, {
    ru: `alt-тексты у большинства изображений (${withAlt}/${total})`,
    en: `Most images have alt texts (${withAlt}/${total})`,
  }, undefined, Date.now() - t0)];
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

/* ------------------------------------------------------------------ */
/* Tech passport detection (unscored metadata)                         */
/* ------------------------------------------------------------------ */

export function detectTechPassport(
  body: string,
  headers: Record<string, string>,
  host: string,
  bodyBytes: number,
  ttfbMs: number,
): TechPassport {
  let stack = "Static HTML / CSR";
  if (/__next/i.test(body) || /_next\/static/i.test(body)) {
    stack = "Next.js (App Router / SSR)";
  } else if (/data-astro|astro-/i.test(body)) {
    stack = "Astro";
  } else if (/__nuxt/i.test(body) || /_nuxt\//i.test(body)) {
    stack = "Nuxt.js";
  } else if (/@vite|vite\//i.test(body) || /id="root"/i.test(body)) {
    stack = "React / Vite (CSR)";
  } else if (/svelte/i.test(body)) {
    stack = "SvelteKit";
  } else if (/framer/i.test(body)) {
    stack = "Framer";
  }

  let cdnWaf = "Direct Server";
  const server = (headers["server"] ?? "").toLowerCase();
  if (headers["cf-ray"] || server.includes("cloudflare")) {
    cdnWaf = "Cloudflare WAF / CDN";
  } else if (headers["x-vercel-id"] || headers["x-vercel-cache"]) {
    cdnWaf = "Vercel Edge Network";
  } else if (headers["x-amz-cf-id"]) {
    cdnWaf = "AWS CloudFront";
  } else if (headers["x-nf-request-id"] || server.includes("netlify")) {
    cdnWaf = "Netlify Edge";
  } else if (server.includes("nginx")) {
    cdnWaf = "Nginx Proxy";
  } else if (server.includes("caddy")) {
    cdnWaf = "Caddy Server";
  } else if (headers["ddos-guard"] || server.includes("ddos-guard")) {
    cdnWaf = "DDoS-Guard";
  }

  const pageSizeKb = Math.round(((bodyBytes || body.length) / 1024) * 10) / 10;

  return {
    stack,
    cdnWaf,
    pageSizeKb: Math.max(0.1, pageSizeKb),
    ttfbMs: Math.max(1, Math.round(ttfbMs)),
  };
}
