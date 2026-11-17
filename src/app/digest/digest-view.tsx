"use client";

import Link from "next/link";
import { getTrophyPath, GRADE_META } from "@/lib/scanner/grade";
import type { buildDigest } from "@/lib/digest";
import { useLang } from "@/lib/use-lang";

type DigestData = ReturnType<typeof buildDigest>;

const D = {
  eyebrow: { ru: "Недельный дайджест", en: "Weekly digest" },
  h1: { ru: "Кто поднял безопасность за 7 дней", en: "Who lifted their security this week" },
  intro: {
    ru: "Считается автоматически из живого реестра: проекты, чей класс вырос между сканами недели, и сайты, вошедшие в клуб A/A+ с первого скана. Обновляется каждый час.",
    en: "Computed automatically from the live registry: projects whose grade grew between this week's scans, and sites that joined the A/A+ club on their first scan. Refreshed every hour.",
  },
  weekScans: { ru: "проверок за последние 7 дней", en: "checks in the last 7 days" },
  upTitle: { ru: "🟢 Подняли класс", en: "🟢 Moved up a grade" },
  upEmptyA: {
    ru: "На этой неделе пока никто не вырос. Почините заголовки по ",
    en: "Nobody moved up this week yet. Fix your headers with the ",
  },
  guides: { ru: "гайдам", en: "guides" },
  upEmptyB: {
    ru: " - и перепройдите скан: ваш проект может оказаться здесь первым.",
    en: " - and re-run the scan: your project could be the first one here.",
  },
  moreImprovedA: { ru: "+ ещё ", en: "+ " },
  moreImprovedB: { ru: " проект(ов) улучшили класс - ", en: " more project(s) improved their grade - " },
  moreImprovedC: { ru: "имена открываются вместе с классом A", en: "names unlock together with grade A" },
  clubTitle: { ru: "🆕 Вошли в клуб A/A+ с первого скана", en: "🆕 Joined the A/A+ club on their first scan" },
  clubEmpty: { ru: "Пока никто. 125 проверок строгие - но это чинится.", en: "Nobody yet. The 125 checks are strict - but fixable." },
  telegram: {
    ru: "Каждую неделю этот дайджест уходит в Telegram-канал. Хотите получить свой класс до следующего выпуска? Скан бесплатный.",
    en: "Every week this digest goes out to the Telegram channel. Want your grade in before the next issue? The scan is free.",
  },
  runCta: { ru: "Запустить техосмотр", en: "Run the checkup" },
  fStats: { ru: "статистика", en: "stats" },
  fRegistry: { ru: "реестр", en: "registry" },
  fFixes: { ru: "гайды", en: "guides" },
} as const;

// UTC on both sides: the calendar day never depends on the visitor's timezone,
// so SSR markup and client hydration always agree
const dateFmt = {
  ru: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
};

export function DigestView({ d }: { d: DigestData }) {
  const lang = useLang();
  const t = (k: keyof typeof D) => D[k][lang];

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-400">{t("eyebrow")}</p>
      <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight sm:text-4xl">
        {t("h1")}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-400">
        {t("intro")}
      </p>

      <div className="mt-6 rounded-2xl border border-slate-800 bg-[#111827] p-5">
        <div className="font-display text-3xl font-extrabold text-sky-400">{d.weekScans}</div>
        <div className="mt-1 text-xs text-slate-500">{t("weekScans")}</div>
      </div>

      <section className="mt-10">
        <h2 className="font-display text-xl font-extrabold">{t("upTitle")}</h2>
        {d.namedImprovers.length === 0 && d.anonymousImproved === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            {t("upEmptyA")}
            <Link href="/fixes" className="text-sky-400 hover:underline">{t("guides")}</Link>
            {t("upEmptyB")}
          </p>
        ) : (
          <ul className="mt-4 space-y-2.5">
            {d.namedImprovers.map((i) => {
              const em = GRADE_META[i.to as keyof typeof GRADE_META];
              return (
                <li key={i.host} className="flex items-center gap-4 rounded-xl border border-slate-800 bg-[#111827] px-4 py-3">
                  <img src={getTrophyPath(i.to)} alt={`AppSeal ${i.to}`} width={36} height={36} className="h-9 w-9 object-contain" />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/verified/${encodeURIComponent(i.host)}`}
                      className="truncate text-sm font-semibold text-slate-100 transition hover:text-sky-400"
                    >
                      {i.host}
                    </Link>
                    <div className="text-xs text-slate-500">{dateFmt[lang].format(new Date(i.ts))}</div>
                  </div>
                  <span className="font-mono text-xs text-slate-400">
                    {i.from} → <span style={{ color: em?.color }} className="font-bold">{i.to}</span>
                  </span>
                  <span className="font-mono text-xs text-slate-500">{i.score}/100</span>
                </li>
              );
            })}
            {d.anonymousImproved > 0 ? (
              <li className="rounded-xl border border-slate-800 bg-[#111827] px-4 py-3 text-sm text-slate-400">
                {t("moreImprovedA")}{d.anonymousImproved}{t("moreImprovedB")}
                <Link href="/registry" className="text-sky-400 hover:underline">{t("moreImprovedC")}</Link>
              </li>
            ) : null}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-extrabold">{t("clubTitle")}</h2>
        {d.newA.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{t("clubEmpty")}</p>
        ) : (
          <ul className="mt-4 space-y-2.5">
            {d.newA.map((n) => {
              const em = GRADE_META[n.grade as keyof typeof GRADE_META];
              return (
                <li key={n.host} className="flex items-center gap-4 rounded-xl border border-slate-800 bg-[#111827] px-4 py-3">
                  <img src={getTrophyPath(n.grade)} alt={`AppSeal ${n.grade}`} width={36} height={36} className="h-9 w-9 object-contain" />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/verified/${encodeURIComponent(n.host)}`}
                      className="truncate text-sm font-semibold text-slate-100 transition hover:text-sky-400"
                    >
                      {n.host}
                    </Link>
                    <div className="text-xs text-slate-500">{dateFmt[lang].format(new Date(n.ts))}</div>
                  </div>
                  <span className="font-bold" style={{ color: em?.color }}>{n.grade}</span>
                  <span className="font-mono text-xs text-slate-500">{n.score}/100</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="mt-10 rounded-2xl border border-sky-500/30 bg-[#0d1220] p-6">
        <p className="text-sm text-slate-300">
          {t("telegram")}
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

export function DigestFooterLinks() {
  const lang = useLang();
  const t = (k: keyof typeof D) => D[k][lang];
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <Link href="/stats" className="transition hover:text-slate-400">{t("fStats")}</Link>
      <Link href="/registry" className="transition hover:text-slate-400">{t("fRegistry")}</Link>
      <Link href="/fixes" className="transition hover:text-slate-400">{t("fFixes")}</Link>
      <Link href="/versus" className="transition hover:text-slate-400">versus</Link>
    </span>
  );
}
