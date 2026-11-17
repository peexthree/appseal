"use client";

import Link from "next/link";
import { FIX_GUIDES, HEADER_WHY } from "@/lib/fixes-content";
import { useLang } from "@/lib/use-lang";

const D = {
  eyebrow: { ru: "Центр исправлений", en: "Fix center" },
  h1: { ru: "Готовые конфиги защитных заголовков под ваш хостинг", en: "Ready-made security-header configs for your hosting" },
  introA: {
    ru: "Массовый техосмотр AppSeal показал: ",
    en: "The AppSeal mass checkup showed: ",
  },
  introBold: {
    ru: "9 из 10 AI-собранных сайтов не имеют базовых защитных заголовков",
    en: "9 out of 10 AI-built sites have no basic security headers",
  },
  introB: {
    ru: " - при этом исправление занимает один файл и пять минут. Выберите платформу, скопируйте конфиг, задеплойте - и перепроверьте сайт.",
    en: " - yet the fix is one file and five minutes. Pick your platform, copy the config, deploy - and re-scan the site.",
  },
  cardTail: { ru: "CSP · HSTS · COOP · XFO · Permissions-Policy - одним блоком.", en: "CSP · HSTS · COOP · XFO · Permissions-Policy - in one block." },
  openGuide: { ru: "Открыть гайд →", en: "Open the guide →" },
  whyTitle: { ru: "Что именно закрывают эти заголовки", en: "What exactly these headers protect" },
  cta: {
    ru: "Настроили? Проверьте результат: внешний движок AppSeal прогоняет 125 проверок и ставит класс A+-E за минуту - бесплатно.",
    en: "Configured? Check the result: the external AppSeal engine runs 125 checks and returns an A+-E grade in a minute - free.",
  },
  runCta: { ru: "Запустить техосмотр", en: "Run the checkup" },
  fStats: { ru: "статистика", en: "stats" },
  fRegistry: { ru: "реестр", en: "registry" },
  fCi: { ru: "ci-гейт", en: "ci gate" },
} as const;

export function FixesView() {
  const lang = useLang();
  const t = (k: keyof typeof D) => D[k][lang];

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-400">{t("eyebrow")}</p>
      <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight sm:text-4xl">
        {t("h1")}
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
        {t("introA")}
        <span className="font-bold text-slate-200">{t("introBold")}</span>
        {t("introB")}
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FIX_GUIDES.map((g) => (
          <Link
            key={g.slug}
            href={`/fixes/${g.slug}`}
            className="appseal-card group rounded-2xl p-5"
          >
            <div className="font-display text-lg font-extrabold text-slate-100 group-hover:text-sky-400">
              {lang === "en" ? g.labelEn : g.label}
            </div>
            <div className="mt-1 font-mono text-xs text-sky-400/80">{lang === "en" ? g.fileEn : g.file}</div>
            <div className="mt-3 text-xs leading-relaxed text-slate-500">
              {t("cardTail")}
            </div>
            <div className="mt-3 text-xs font-bold text-sky-400">{t("openGuide")}</div>
          </Link>
        ))}
      </div>

      <section className="mt-12">
        <h2 className="font-display text-xl font-extrabold">{t("whyTitle")}</h2>
        <div className="appseal-glass-card mt-4 overflow-hidden rounded-2xl">
          {HEADER_WHY.map((h, i) => (
            <div
              key={h.name}
              className={`flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:gap-4 ${
                i < HEADER_WHY.length - 1 ? "border-b border-slate-800/60" : ""
              }`}
            >
              <span className="w-64 shrink-0 font-mono text-xs font-bold text-sky-400">{h.name}</span>
              <span className="flex-1 text-sm text-slate-300">{lang === "en" ? h.whyEn : h.why}</span>
              <span className="w-56 shrink-0 text-xs text-slate-500">{lang === "en" ? h.missEn : h.miss}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="appseal-glass-card mt-10 rounded-2xl border-sky-500/30 p-6">
        <p className="text-sm text-slate-300">
          {t("cta")}
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-md bg-sky-400 px-5 py-2.5 text-sm font-bold text-[#090d16] transition hover:bg-sky-300"
        >
          {t("runCta")}
        </Link>
      </div>
    </main>
  );
}

export function FixesFooterLinks() {
  const lang = useLang();
  const t = (k: keyof typeof D) => D[k][lang];
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <Link href="/stats" className="transition hover:text-slate-400">{t("fStats")}</Link>
      <Link href="/registry" className="transition hover:text-slate-400">{t("fRegistry")}</Link>
      <Link href="/versus" className="transition hover:text-slate-400">versus</Link>
      <Link href="/ci" className="transition hover:text-slate-400">{t("fCi")}</Link>
      <Link href="/api" className="transition hover:text-slate-400">api</Link>
    </span>
  );
}
