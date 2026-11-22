import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { HtmlLangSync } from "@/components/html-lang-sync";
import { ShieldCheck, Lock, Activity, KeyRound } from "@/components/icons/appseal-icons";
import { pageLang } from "@/lib/lang-server";
import type { Lang } from "@/lib/scanner/types";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await pageLang();
  return lang === "en"
    ? {
        title: "AppSeal Scanner Bot - Scan Policy & Opt-out",
        description:
          "About the AppSeal-Scanner crawler: request rate, passive security-check mode and exclusion rules via robots.txt.",
        alternates: { canonical: "/bot" },
      }
    : {
        title: "AppSeal Scanner Bot - Политика сканирования и Opt-out",
        description:
          "Информация о краулере AppSeal-Scanner: частота запросов, пассивный режим проверки безопасности и правила исключения через robots.txt.",
        alternates: { canonical: "/bot" },
      };
}

const D = {
  whatTitle: { ru: "Что это за робот?", en: "What is this bot?" },
  whatBody: {
    ru: " - это автоматизированный сканер внешней гигиены веб-приложений. Он запускается разработчиками или владельцами ресурсов для аудита базовой конфигурации безопасности перед релизом (наличие HTTPS, заголовки защиты, отсутствие открытых служебных файлов, утечек ключей и битых страниц).",
    en: " is an automated external web-app hygiene scanner. Developers and site owners run it to audit the basic security configuration before a release (HTTPS, protection headers, no exposed service files, leaked keys or broken pages).",
  },
  passiveTitle: { ru: "Принципы пассивного аудита", en: "Passive audit principles" },
  p1Lead: { ru: "Исключительно пассивный black-box анализ:", en: "Strictly passive black-box analysis:" },
  p1Body: {
    ru: "сканер делает только стандартные HTTP ",
    en: "the scanner only issues standard HTTP ",
  },
  p1Tail: { ru: " запросы.", en: " requests." },
  p2Lead: { ru: "Никаких деструктивных действий:", en: "No destructive actions:" },
  p2Body: {
    ru: "сканер не производит попыток авторизации, брутфорса, SQL-инъекций, отправки форм или перегрузки каналов связи (DoS).",
    en: "the scanner never attempts authentication, brute force, SQL injection, form submission or channel flooding (DoS).",
  },
  p3Lead: { ru: "Ограничение частоты (Rate Limiting):", en: "Rate limiting:" },
  p3Body: {
    ru: "краулер выполняет параллельно не более 4 лёгких потоков (GET/HEAD/OPTIONS). Полный цикл v0.6 состоит из ~140 точечных запросов и завершается за 20-45 секунд.",
    en: "the crawler runs at most 4 lightweight parallel threads (GET/HEAD/OPTIONS). A full v0.6 cycle is ~140 targeted requests and completes in 20-45 seconds.",
  },
  p4Lead: { ru: "Маскирование секретов (Privacy):", en: "Secret masking (privacy):" },
  p4Body: {
    ru: "сканер никогда не сохраняет и не отображает содержимое обнаруженных файлов конфигурации или приватных ключей. Любые найденные токены принудительно маскируются звездочками.",
    en: "the scanner never stores or displays the contents of discovered configuration files or private keys. Any found tokens are force-masked with asterisks.",
  },
  p5Lead: { ru: "Повторные сканы платных доменов:", en: "Paid-domain rescans:" },
  p5Body: {
    ru: "домены с активным Launch Pass проходят фоновую перепроверку не чаще одного раза в 6 часов (тот же пассивный цикл ~140 запросов). Владелец ресурса может исключить домен из перепроверки директивой AppSeal-Scanner в robots.txt - она действует и для фоновых сканов.",
    en: "domains with an active Launch Pass get a background re-check at most once every 6 hours (the same passive ~140-request cycle). A site owner can exclude the domain from rescans with an AppSeal-Scanner directive in robots.txt - it applies to background scans too.",
  },
  optoutTitle: { ru: "Мгновенный запрет сканирования (Opt-out)", en: "Instant opt-out" },
  optoutA: {
    ru: "Сканер AppSeal строго следует правилам ",
    en: "AppSeal strictly follows ",
  },
  optoutB: {
    ru: ". Перед началом любой проверки робот запрашивает ",
    en: ". Before any scan the bot fetches ",
  },
  optoutC: {
    ru: ". Если вы хотите запретить сканирование вашего ресурса, добавьте директиву:",
    en: ". To disallow scanning of your site, add the directive:",
  },
  optoutNote: {
    ru: "При обнаружении этого правила в ",
    en: "When this rule is found in ",
  },
  optoutNoteB: {
    ru: " скан немедленно останавливается с уведомлением пользователю о запрете со стороны администратора.",
    en: ", the scan stops immediately and the user is told the site administrator has disallowed it.",
  },
  buyTitle: {
    ru: "Покупка пропусков и мониторинг - в Telegram-боте",
    en: "Pass purchases and monitoring live in the Telegram bot",
  },
  buyBody: {
    ru: "Эта страница описывает краулер. Пропуски Launch и Pro, Agency Pack, /scan и /myscans - у бота @AppSeal_Monitor_Bot:",
    en: "This page is about the crawler. Launch/Pro passes, the Agency Pack, /scan and /myscans live in the bot @AppSeal_Monitor_Bot:",
  },
  buyBtn: { ru: "Открыть бот в Telegram", en: "Open the bot in Telegram" },
  fHome: { ru: "главная", en: "home" },
  fRegistry: { ru: "реестр", en: "registry" },
  fStats: { ru: "статистика", en: "stats" },
  fFixes: { ru: "гайды", en: "guides" },
  fLegal: { ru: "правила", en: "legal" },
} as const;

export default async function BotPage() {
  const lang: Lang = await pageLang();
  const t = (k: keyof typeof D) => D[k][lang];

  return (
    <div className="flex min-h-screen flex-col text-slate-100">
      <HtmlLangSync lang={lang} />
      <SiteHeader lang={lang} />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
        <div className="rounded-2xl appseal-glass-card p-6 sm:p-10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/30">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-sky-400">
                Crawler & Security Policy
              </p>
              <h1 className="font-display text-2xl font-extrabold text-slate-50 sm:text-3xl">
                AppSeal-Scanner
              </h1>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-slate-800 bg-[#090d16] p-4 font-mono text-xs text-sky-300">
            User-Agent: <span className="text-emerald-400">AppSeal-Scanner/0.3 (+https://appseal.online/bot)</span>
          </div>

          <div className="mt-8 space-y-6 text-sm leading-relaxed text-slate-300">
            <section>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Activity className="h-4 w-4 text-sky-400" />
                {t("whatTitle")}
              </h2>
              <p className="mt-2 text-slate-300">
                <strong className="text-slate-100">AppSeal-Scanner</strong>{t("whatBody")}
              </p>
            </section>

            <section className="pt-2">
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Lock className="h-4 w-4 text-sky-400" />
                {t("passiveTitle")}
              </h2>
              <ul className="mt-3 list-inside list-disc space-y-2 text-slate-300 pl-1">
                <li>
                  <strong className="text-slate-100">{t("p1Lead")}</strong>{" "}
                  {t("p1Body")}
                  <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">GET</code>,{" "}
                  <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">HEAD</code>{" "}
                  {lang === "en" ? "and" : "и"}{" "}
                  <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">OPTIONS</code>
                  {t("p1Tail")}
                </li>
                <li>
                  <strong className="text-slate-100">{t("p2Lead")}</strong> {t("p2Body")}
                </li>
                <li>
                  <strong className="text-slate-100">{t("p3Lead")}</strong> {t("p3Body")}
                </li>
                <li>
                  <strong className="text-slate-100">{t("p4Lead")}</strong> {t("p4Body")}
                </li>
                <li>
                  <strong className="text-slate-100">{t("p5Lead")}</strong> {t("p5Body")}
                </li>
              </ul>
            </section>

            <section className="pt-4 border-t border-slate-800">
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-sky-400" />
                {t("optoutTitle")}
              </h2>
              <p className="mt-2 text-slate-300">
                {t("optoutA")}
                <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">robots.txt</code>
                {t("optoutB")}
                <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">/robots.txt</code>
                {t("optoutC")}
              </p>
              <div className="mt-3 rounded-lg border border-slate-800 bg-[#090d16] p-4 font-mono text-xs text-slate-200">
                User-agent: AppSeal-Scanner<br />
                Disallow: /
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {t("optoutNote")}
                <code className="text-slate-300">robots.txt</code>
                {t("optoutNoteB")}
              </p>
            </section>

            <section className="pt-4 border-t border-slate-800">
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                {t("buyTitle")}
              </h2>
              <p className="mt-2 text-slate-300">{t("buyBody")}</p>
              <a
                href="https://t.me/AppSeal_Monitor_Bot"
                target="_blank"
                rel="noopener"
                className="mt-3 inline-flex items-center gap-2 rounded-md bg-sky-400 px-5 py-2.5 text-sm font-bold text-[#090d16] transition hover:bg-sky-300"
              >
                {t("buyBtn")}
              </a>
            </section>
          </div>
        </div>
      </main>

      <footer className="mt-auto border-t border-slate-800/70 bg-[#070b13]">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-4 py-8 text-center sm:flex-row sm:px-6 sm:text-left">
          <div className="space-y-1">
            <p className="text-xs text-slate-500">
              © {new Date().getFullYear()} AppSeal · Crawler & Scanner Documentation
            </p>
            <p className="font-mono text-[11px] text-slate-700">
              <Link href="/" className="transition hover:text-slate-500">{t("fHome")}</Link> · <Link href="/registry" className="transition hover:text-slate-500">{t("fRegistry")}</Link> · <Link href="/stats" className="transition hover:text-slate-500">{t("fStats")}</Link> · <Link href="/fixes" className="transition hover:text-slate-500">{t("fFixes")}</Link> · <Link href="/legal" className="transition hover:text-slate-500">{t("fLegal")}</Link>
            </p>
          </div>
          <div className="shrink-0 transition-transform hover:scale-[1.02]">
            <a
              href="/verified/appseal.online"
              target="_blank"
              rel="noopener"
              title="AppSeal Security Verified - live grade"
              className="inline-block"
            >
              <img
                src="/api/badge?host=appseal.online"
                alt="AppSeal Verified"
                width={228}
                height={44}
                className="h-[44px] w-[228px] drop-shadow-[0_4px_16px_rgba(192,132,252,0.18)]"
              />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
