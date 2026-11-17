"use client";

import Link from "next/link";
import { getTrophyPath, GRADE_META } from "@/lib/scanner/grade";
import { isDofollow, type RegistryEntry } from "@/lib/registry";
import { useLang } from "@/lib/use-lang";

const D = {
  eyebrow: { ru: "Публичный профиль безопасности", en: "Public security profile" },
  grade: { ru: "Класс", en: "Grade" },
  autoNote: {
    ru: "Оценка присваивается автоматически внешним движком AppSeal по 125 проверкам безопасности. Проверка была безрезультатной? ",
    en: "The grade is assigned automatically by the external AppSeal engine across 125 security checks. Scan a mistake? ",
  },
  optout: { ru: "Владелец может запросить исключение", en: "The owner can request removal" },
  dynTitle: { ru: "Динамика балла", en: "Score dynamics" },
  liftTitle: {
    ru: "Хотите поднять класс? Самые частые провалы - защитные заголовки, чинятся одним конфигом: ",
    en: "Want a higher grade? The most common gaps are protection headers - fixable with one config: ",
  },
  liftFixes: { ru: "готовые конфиги под ваш хостинг →", en: "ready-made configs for your hosting →" },
  liftVs: { ru: " Или посмотрите, как домен выглядит на фоне другого: ", en: " Or see how the domain looks against another one: " },
  liftVsCta: { ru: "сравнить сайты →", en: "compare sites →" },
  histTitle: { ru: "История проверок", en: "Scan history" },
  firstScan: { ru: "Первичный скан →", en: "First scan →" },
  verifyLast: { ru: "Подтвердить подлинность →", en: "Verify authenticity →" },
  verifyMid: { ru: "Верифицировать →", en: "Verify →" },
  privacyNoteA: {
    ru: "Профиль показывает только класс, балл и дату - перечень находок всегда остаётся у инициатора скана. Подробности модели: ",
    en: "The profile shows only the grade, score and date - the findings list always stays with the scan initiator. Model details: ",
  },
  privacyLink: { ru: "правила и приватность", en: "terms & privacy" },
  privacyNoteB: { ru: " · живые цифры по всем проектам: ", en: " · live numbers for all projects: " },
  privacyStats: { ru: "статистика", en: "stats" },
  notScanned: {
    ru: "Этот сайт ещё не проходил техосмотр AppSeal. Проверка бесплатная: внешний движок оценит безопасность и выдаст класс A+-E за минуту.",
    en: "This site hasn't been through the AppSeal checkup yet. The scan is free: the external engine rates security and returns an A+-E grade in a minute.",
  },
  scanCta: { ru: "Проверить этот сайт", en: "Check this site" },
  footerProfile: { ru: "профиль домена · ", en: "domain profile · " },
  footerRegistry: { ru: "реестр", en: "registry" },
} as const;

// UTC on both sides: the calendar day never depends on the visitor's timezone,
// so SSR markup and client hydration always agree
const dateFmt = {
  ru: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
};

export function HostView({ host, history, latest }: { host: string; history: RegistryEntry[]; latest: RegistryEntry | null }) {
  const lang = useLang();
  const t = (k: keyof typeof D) => D[k][lang];
  const dofollow = latest ? isDofollow(latest) : false;
  const gm = latest ? GRADE_META[latest.grade as keyof typeof GRADE_META] : null;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
      {latest && gm ? (
        <>
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-400">
              {t("eyebrow")}
            </p>
            {dofollow && (
              <span className="rounded border border-[#34D399]/30 bg-[#34D399]/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#34D399]">
                dofollow
              </span>
            )}
          </div>
          <div className="mt-4 flex flex-col items-start gap-6 rounded-2xl border border-slate-800 bg-[#111827] p-6 sm:flex-row sm:items-center sm:p-8">
            <img
              src={getTrophyPath(latest.grade)}
              alt={`AppSeal ${latest.grade}`}
              width={112}
              height={112}
              className="h-28 w-28 shrink-0 object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.7)]"
            />
            <div className="min-w-0 flex-1">
              <h1 className="font-display truncate text-2xl font-extrabold text-slate-50 sm:text-3xl">
                {host}
              </h1>
              <p className="mt-1.5 font-bold" style={{ color: gm.color }}>
                {t("grade")} {latest.grade} · {latest.score}/100 · {gm.label[lang]}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                {gm.description[lang]}
              </p>
              <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                {t("autoNote")}
                <Link href="/legal" className="underline decoration-slate-600 hover:text-slate-300">
                  {t("optout")}
                </Link>
                .
              </p>
            </div>
          </div>

          {history.length >= 2 ? (
            <div className="mt-8 rounded-2xl border border-slate-800 bg-[#111827] p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{t("dynTitle")}</p>
              <div className="mt-3 flex h-24 items-end gap-1.5">
                {history.map((e) => {
                  const em = GRADE_META[e.grade as keyof typeof GRADE_META];
                  return (
                    <div
                      key={e.id}
                      className="flex-1 rounded-t transition-all hover:opacity-80"
                      style={{
                        height: `${Math.max(e.score, 3)}%`,
                        backgroundColor: em?.color ?? "#64748B",
                        opacity: 0.75,
                      }}
                      title={`${dateFmt[lang].format(new Date(e.ts))}: ${e.grade} · ${e.score}/100`}
                    />
                  );
                })}
              </div>
              <div className="mt-1.5 flex justify-between font-mono text-[9px] text-slate-600">
                <span>{dateFmt[lang].format(new Date(history[0].ts))}</span>
                <span>{dateFmt[lang].format(new Date(latest.ts))}</span>
              </div>
            </div>
          ) : null}

          <div className="mt-6 rounded-2xl border border-sky-500/30 bg-[#0d1220] p-5">
            <p className="text-sm text-slate-300">
              {t("liftTitle")}
              <Link href="/fixes" className="font-bold text-sky-400 hover:underline">
                {t("liftFixes")}
              </Link>
              {t("liftVs")}
              <Link href={`/versus?a=${encodeURIComponent(host)}`} className="font-bold text-sky-400 hover:underline">
                {t("liftVsCta")}
              </Link>
            </p>
          </div>

          <h2 className="font-display mt-10 text-xl font-extrabold">{t("histTitle")}</h2>
          <ul className="mt-4 divide-y divide-slate-800/70 overflow-hidden rounded-2xl border border-slate-800 bg-[#111827]">
            {history.map((e) => {
              const em = GRADE_META[e.grade as keyof typeof GRADE_META];
              const first = e.id === history[0].id;
              const last = e.id === latest.id;
              return (
                <li key={e.id} className="flex items-center gap-4 px-5 py-3.5">
                  <img
                    src={getTrophyPath(e.grade)}
                    alt={`AppSeal ${e.grade}`}
                    width={36}
                    height={36}
                    className="h-9 w-9 object-contain"
                  />
                  <span
                    className="inline-flex h-7 min-w-8 items-center justify-center rounded-md border px-2 font-display text-sm font-extrabold"
                    style={{ color: em?.color, borderColor: `${em?.color}66`, backgroundColor: `${em?.color}1a` }}
                  >
                    {e.grade}
                  </span>
                  <span className="font-mono text-sm font-bold text-slate-200">{e.score}/100</span>
                  <span className="flex-1 text-sm text-slate-400">{dateFmt[lang].format(new Date(e.ts))}</span>
                  <Link
                    href={`/report/${e.id}`}
                    className="text-xs font-semibold text-sky-400 transition hover:text-sky-300"
                  >
                    {first ? t("firstScan") : last ? t("verifyLast") : t("verifyMid")}
                  </Link>
                </li>
              );
            })}
          </ul>

          <p className="mt-6 text-xs leading-relaxed text-slate-500">
            {t("privacyNoteA")}
            <Link href="/legal" className="underline decoration-slate-600 hover:text-slate-300">{t("privacyLink")}</Link>
            {t("privacyNoteB")}
            <Link href="/stats" className="underline decoration-slate-600 hover:text-slate-300">{t("privacyStats")}</Link>.
          </p>
        </>
      ) : (
        <div className="mt-6 rounded-2xl border border-slate-800 bg-[#111827] p-10 text-center">
          <h1 className="font-display text-2xl font-extrabold text-slate-50">{host}</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-400">
            {t("notScanned")}
          </p>
          <Link
            href={`/?domain=${encodeURIComponent(host)}`}
            className="mt-5 inline-block rounded-md bg-sky-400 px-5 py-2.5 text-sm font-bold text-[#090d16] transition hover:bg-sky-300"
          >
            {t("scanCta")}
          </Link>
        </div>
      )}

      <footer className="mt-auto border-t border-slate-800/70 bg-[#070b13]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-slate-500 sm:px-6">
          <span>AppSeal Engine · External Black-Box Security Scanner</span>
          <span className="inline-flex items-center gap-1.5">
            {D.footerProfile[lang]}
            <Link href="/registry" className="transition hover:text-slate-400">{D.footerRegistry[lang]}</Link>
          </span>
        </div>
      </footer>
    </main>
  );
}
