"use client";

import Link from "next/link";
import { HEADER_WHY, type FixGuide } from "@/lib/fixes-content";
import { CopyCode } from "./copy-code";
import { useLang } from "@/lib/use-lang";

const D = {
  crumb: { ru: "Центр исправлений", en: "Fix center" },
  h1a: { ru: "Защитные заголовки для ", en: "Security headers for " },
  introA: {
    ru: "Создайте или дополните файл ",
    en: "Create or extend the file ",
  },
  introB: {
    ru: " и задеплойте. Заголовки те же, что AppSeal использует в продакшене - конфиг сам проходит техосмотр на класс A+.",
    en: " and deploy. The headers are the same ones AppSeal runs in production - the config itself passes the checkup at grade A+.",
  },
  whyTitle: { ru: "Что закрывает этот конфиг", en: "What this config protects" },
  cta: {
    ru: "Задеплоили? Перепроверьте сайт - класс на карточке AppSeal обновится сам после нового скана.",
    en: "Deployed? Re-scan the site - the grade on the AppSeal card updates itself after the new scan.",
  },
  runCta: { ru: "Запустить техосмотр", en: "Run the checkup" },
  otherHost: { ru: "Другой хостинг", en: "Other hosting" },
  fStats: { ru: "статистика", en: "stats" },
  fAllGuides: { ru: "все гайды", en: "all guides" },
} as const;

export function FixGuideView({ guide }: { guide: FixGuide }) {
  const lang = useLang();
  const t = (k: keyof typeof D) => D[k][lang];
  const label = lang === "en" ? guide.labelEn : guide.label;
  const file = lang === "en" ? guide.fileEn : guide.file;
  const place = lang === "en" ? guide.placeEn : guide.place;
  const note = lang === "en" ? guide.noteEn : guide.note;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <nav className="text-xs text-slate-500">
        <Link href="/fixes" className="transition hover:text-slate-300">{t("crumb")}</Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-400">{label}</span>
      </nav>
      <h1 className="mt-3 font-display text-2xl font-extrabold leading-tight sm:text-3xl">
        {t("h1a")}{label}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-400">
        {t("introA")}
        <span className="font-mono text-sm font-bold text-sky-400">{file}</span>{" "}
        ({place}){t("introB")}
      </p>

      <div className="mt-6 rounded-2xl appseal-glass-card p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-xs font-bold text-slate-400">{guide.file}</span>
          <CopyCode code={guide.code} />
        </div>
        <pre className="mt-3 overflow-x-auto rounded-xl border border-slate-800 bg-[#090d16] p-4 font-mono text-[11px] leading-relaxed text-slate-300">
          {guide.code}
        </pre>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">{note}</p>
      </div>

      <section className="mt-10">
        <h2 className="font-display text-xl font-extrabold">{t("whyTitle")}</h2>
        <ul className="mt-4 space-y-2.5">
          {HEADER_WHY.map((h) => (
            <li key={h.name} className="rounded-xl appseal-glass-card px-4 py-3">
              <span className="font-mono text-xs font-bold text-sky-400">{h.name}</span>
              <span className="mt-0.5 block text-sm text-slate-300">{lang === "en" ? h.whyEn : h.why}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="appseal-glass-card mt-10 rounded-2xl border-sky-500/30 p-6">
        <p className="text-sm text-slate-300">
          {t("cta")}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-md bg-sky-400 px-5 py-2.5 text-sm font-bold text-[#090d16] transition hover:bg-sky-300"
          >
            {t("runCta")}
          </Link>
          <Link
            href="/fixes"
            className="rounded-md border border-slate-700 px-5 py-2.5 text-sm font-bold text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
          >
            {t("otherHost")}
          </Link>
        </div>
      </div>
    </main>
  );
}

export function GuideFooterLinks() {
  const lang = useLang();
  const t = (k: keyof typeof D) => D[k][lang];
  return (
    <span className="inline-flex items-center gap-3">
      <Link href="/stats" className="transition hover:text-slate-400">{t("fStats")}</Link>
      <Link href="/fixes" className="transition hover:text-slate-400">{t("fAllGuides")}</Link>
    </span>
  );
}
