"use client";

import Link from "next/link";
import { CopyCode } from "../fixes/copy-code";
import { useLang } from "@/lib/use-lang";

const CURL = `curl "https://appseal.online/api/verify?host=appseal.online"`;

const RESPONSE = `{
  "host": "appseal.online",
  "grade": "A+",
  "score": 97,
  "checkedAt": "2026-11-16T19:24:53.989Z",
  "profile": "https://appseal.online/verified/appseal.online",
  "badge": "https://appseal.online/api/badge?host=appseal.online",
  "seal": "AppSeal Security Verified"
}`;

const FETCH_JS = `const res = await fetch(
  "https://appseal.online/api/verify?host=" + encodeURIComponent(host),
);
if (res.ok) {
  const { grade, score, profile } = await res.json();
  console.log(\`\${host}: \${grade} (\${score}/100) - \${profile}\`);
}`;

const TOKEN_CURL = `curl -X POST https://appseal.online/api/scan \\
  -H 'content-type: application/json' \\
  -H 'authorization: Bearer as_YOUR_TOKEN' \\
  -d '{"url":"https://your-domain.com"}'`;

const BADGE_IMG = `<a href="https://appseal.online/verified/your-domain.com">
  <img src="https://appseal.online/api/badge?host=your-domain.com" width="228" height="44" alt="AppSeal Security Verified">
</a>`;

const BADGE_TROPHY = `<!-- 512x512 trophy instead of the stripe, dark theme by default -->
<img src="https://appseal.online/api/badge?host=your-domain.com&style=trophy" width="80" height="80" alt="AppSeal Trophy">

<!-- light theme for white pages -->
<img src="https://appseal.online/api/badge?host=your-domain.com&theme=light" width="228" height="44" alt="AppSeal Security Verified">`;

const D = {
  h1: { ru: "Живой класс домена в JSON", en: "A domain's live grade in JSON" },
  intro: {
    ru: "Публичный API без ключей и регистрации: оценка A+-E любого домена из открытого реестра, свежая не старше последнего скана. Два эндпоинта - JSON для дашбордов, ботов и статей, и SVG-бейдж для сайта и README. Отдаются только агрегаты: класс и дата проверки, без находок сканера.",
    en: "A public API with no keys or signup: the A+-E grade of any domain from the open registry, as fresh as the latest scan. Two endpoints - JSON for dashboards, bots and articles, and an SVG badge for sites and READMEs. Aggregates only: the grade and check date, never scanner findings.",
  },
  verifyTitle: { ru: "GET /api/verify", en: "GET /api/verify" },
  hostParam: { ru: "обязательно - домен в любом регистре, можно без протокола", en: "required - the domain, any case, protocol optional" },
  request: { ru: "запрос", en: "request" },
  copyCurl: { ru: "Скопировать curl", en: "Copy curl" },
  response: { ru: "ответ 200", en: "response 200" },
  copyResponse: { ru: "Скопировать ответ", en: "Copy response" },
  err400: {
    ru: "Домен не подходит под формат. Ответ: ",
    en: "The domain does not match the format. Response: ",
  },
  err404: {
    ru: "Домен ещё не сканился. В ответе подсказка со ссылкой на бесплатный скан.",
    en: "The domain has never been scanned. The response includes a hint linking to the free scan.",
  },
  cacheNote: {
    ru: "Ответ кешируется на 5 минут (Cache-Control: public, max-age=300) - можно опрашивать спокойно, лимит практично не встречается.",
    en: "The response is cached for 5 minutes (Cache-Control: public, max-age=300) - polling is fine, the rate limit is practically never hit.",
  },
  jsTitle: { ru: "Пример на JS", en: "A JS example" },
  copyCode: { ru: "Скопировать код", en: "Copy code" },
  tokenTitle: { ru: "Bearer-токен (Pro)", en: "Bearer token (Pro)" },
  tokenIntro: {
    ru: "API-токен снимает дневной лимит POST /api/scan - удобно для CI и регулярных проверок. Выдаётся командой /token в Telegram-боте и входит в Pro Pass. Передавайте его заголовком authorization: Bearer as_... или x-api-token.",
    en: "An API token lifts the daily limit of POST /api/scan - handy for CI and recurring checks. Issued by the /token command in the Telegram bot and included in the Pro Pass. Send it as the authorization: Bearer as_... header or x-api-token.",
  },
  tokenScanTitle: { ru: "POST /api/scan с токеном", en: "POST /api/scan with the token" },
  tokenNote: {
    ru: "Без токена /api/scan работает в рамках дневного лимита - токен только снимает его.",
    en: "Without a token, /api/scan works within the daily limit - the token only removes it.",
  },
  badgeTitle: { ru: "GET /api/badge - бейдж для сайта и README", en: "GET /api/badge - a badge for your site and README" },
  badgeIntro: {
    ru: "SVG-картинка, привязанная к домену: класс на ней обновляется сам после каждого скана. В HTML:",
    en: "An SVG image bound to the domain: the grade on it refreshes itself after every scan. In HTML:",
  },
  copyHtml: { ru: "Скопировать HTML", en: "Copy HTML" },
  badgeVariantsA: {
    ru: "Варианты: ",
    en: "Variants: ",
  },
  badgeVariantsA2: { ru: " - кубок 512x512 вместо полоски, ", en: " - a 512x512 trophy instead of the stripe, " },
  badgeVariantsA3: { ru: " - светлая тема. Для README есть готовый Markdown на ", en: " - the light theme. For READMEs there is a ready Markdown on the " },
  badgeVariantsCta: { ru: "странице CI-гейта →", en: "CI gate page →" },
  badgeVariantsB: { ru: "варианты бейджа", en: "badge variants" },
  copyPlain: { ru: "Скопировать", en: "Copy" },
  ctaA: {
    ru: "Домена нет в ответе? ",
    en: "The domain is not in the response? ",
  },
  ctaScan: { ru: "Запустите бесплатный скан →", en: "Run a free scan →" },
  ctaB: {
    ru: " Он попадёт в реестр, и API сразу начнёт отвечать за него. Гонять сканы на каждый пуш удобнее через ",
    en: " It enters the registry and the API starts answering for it right away. Running scans on every push is easiest via the ",
  },
  ctaCi: { ru: "GitHub Action →", en: "GitHub Action →" },
  fCi: { ru: "CI-гейт", en: "CI gate" },
  fFixes: { ru: "гайды", en: "guides" },
  fStats: { ru: "статистика", en: "stats" },
} as const;

export function ApiView() {
  const lang = useLang();
  const t = (k: keyof typeof D) => D[k][lang];

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-400">AppSeal API</p>
      <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight sm:text-4xl">
        {t("h1")}
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
        {t("intro")}
      </p>

      <section className="mt-10">
        <h2 className="font-display text-xl font-extrabold">{t("verifyTitle")}</h2>
        <div className="mt-3 overflow-hidden rounded-2xl appseal-glass-card">
          <div className="flex items-center gap-4 border-b border-slate-800/60 px-5 py-3 text-sm">
            <span className="w-40 shrink-0 font-mono text-xs font-bold text-sky-400">host</span>
            <span className="flex-1 text-xs text-slate-400">{t("hostParam")}</span>
          </div>
        </div>

        <div className="mt-4 rounded-2xl appseal-glass-card p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-xs font-bold text-slate-400">{t("request")}</span>
            <CopyCode code={CURL} label={t("copyCurl")} />
          </div>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-slate-800 bg-[#090d16] p-4 font-mono text-[11px] leading-relaxed text-slate-300">
            {CURL}
          </pre>
        </div>

        <div className="mt-4 rounded-2xl appseal-glass-card p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-xs font-bold text-slate-400">{t("response")}</span>
            <CopyCode code={RESPONSE} label={t("copyResponse")} />
          </div>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-slate-800 bg-[#090d16] p-4 font-mono text-[11px] leading-relaxed text-slate-300">
            {RESPONSE}
          </pre>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl appseal-glass-card p-5">
            <p className="font-mono text-xs font-bold text-amber-400">400 invalid_host</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              {t("err400")}
              <span className="font-mono text-slate-300">{`{"error":"invalid_host"}`}</span>
            </p>
          </div>
          <div className="rounded-2xl appseal-glass-card p-5">
            <p className="font-mono text-xs font-bold text-red-400">404 not_scanned</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              {t("err404")}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          {t("cacheNote")}
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-extrabold">{t("jsTitle")}</h2>
        <div className="mt-3 rounded-2xl appseal-glass-card p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-xs font-bold text-slate-400">fetch</span>
            <CopyCode code={FETCH_JS} label={t("copyCode")} />
          </div>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-slate-800 bg-[#090d16] p-4 font-mono text-[11px] leading-relaxed text-slate-300">
            {FETCH_JS}
          </pre>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-extrabold">{t("tokenTitle")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          {t("tokenIntro")}
        </p>
        <div className="mt-3 rounded-2xl appseal-glass-card p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-xs font-bold text-slate-400">{t("tokenScanTitle")}</span>
            <CopyCode code={TOKEN_CURL} label={t("copyCurl")} />
          </div>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-slate-800 bg-[#090d16] p-4 font-mono text-[11px] leading-relaxed text-slate-300">
            {TOKEN_CURL}
          </pre>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          {t("tokenNote")}
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-extrabold">{t("badgeTitle")}</h2>
        <p className="mt-2 text-sm text-slate-400">
          {t("badgeIntro")}
        </p>
        <div className="mt-3 rounded-2xl appseal-glass-card p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-xs font-bold text-slate-400">HTML</span>
            <CopyCode code={BADGE_IMG} label={t("copyHtml")} />
          </div>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-slate-800 bg-[#090d16] p-4 font-mono text-[11px] leading-relaxed text-slate-300">
            {BADGE_IMG}
          </pre>
        </div>
        <p className="mt-4 text-sm text-slate-400">
          {t("badgeVariantsA")}
          <span className="font-mono text-xs text-slate-300">style=trophy</span>
          {t("badgeVariantsA2")}
          <span className="font-mono text-xs text-slate-300">theme=light</span>
          {t("badgeVariantsA3")}
          <Link href="/ci" className="font-bold text-sky-400 hover:underline">
            {t("badgeVariantsCta")}
          </Link>
        </p>
        <div className="mt-3 rounded-2xl appseal-glass-card p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-xs font-bold text-slate-400">{t("badgeVariantsB")}</span>
            <CopyCode code={BADGE_TROPHY} label={t("copyPlain")} />
          </div>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-slate-800 bg-[#090d16] p-4 font-mono text-[11px] leading-relaxed text-slate-300">
            {BADGE_TROPHY}
          </pre>
        </div>
      </section>

      <div className="appseal-glass-card mt-10 rounded-2xl border-sky-500/30 p-6">
        <p className="text-sm text-slate-300">
          {t("ctaA")}
          <Link href="/" className="font-bold text-sky-400 hover:underline">
            {t("ctaScan")}
          </Link>
          {t("ctaB")}
          <Link href="/ci" className="font-bold text-sky-400 hover:underline">
            {t("ctaCi")}
          </Link>
        </p>
      </div>
    </main>
  );
}

export function ApiFooterLinks() {
  const lang = useLang();
  const t = (k: keyof typeof D) => D[k][lang];
  return (
    <span className="inline-flex items-center gap-3">
      <Link href="/ci" className="transition hover:text-slate-400">{t("fCi")}</Link>
      <Link href="/fixes" className="transition hover:text-slate-400">{t("fFixes")}</Link>
      <Link href="/stats" className="transition hover:text-slate-400">{t("fStats")}</Link>
    </span>
  );
}
