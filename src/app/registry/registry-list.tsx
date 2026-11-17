"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { isDofollow, platformOf, PLATFORM_LABELS, type PlatformKey, type RegistryEntry } from "@/lib/registry";
import { getTrophyPath, GRADE_META } from "@/lib/scanner/grade";
import type { Lang } from "@/lib/scanner/types";
import { useLang } from "@/lib/use-lang";
import { Search, X, ArrowRight } from "@/components/icons/appseal-icons";

const PAGE_SIZE = 24;

const GRADE_STYLES: Record<string, string> = {
  "A+": "bg-[#C084FC]/15 text-[#C084FC] border-[#C084FC]/40 shadow-[0_0_12px_rgba(192,132,252,0.25)]",
  A: "bg-[#34D399]/15 text-[#34D399] border-[#34D399]/40",
  B: "bg-[#38BDF8]/15 text-[#38BDF8] border-[#38BDF8]/40",
  C: "bg-[#FBBF24]/15 text-[#FBBF24] border-[#FBBF24]/40",
  D: "bg-[#FB923C]/15 text-[#FB923C] border-[#FB923C]/40",
  E: "bg-[#F87171]/15 text-[#F87171] border-[#F87171]/40",
};

const D = {
  h1: { ru: "Реестр техосмотра", en: "Inspection registry" },
  introA: {
    ru: "Публичные приложения, прошедшие техосмотр AppSeal, - все классы от A+ до E. Классы A+ и A получают индексируемую ссылку и открытое описание, у остальных ссылка и описание скрыты - ",
    en: "Public apps that passed the AppSeal checkup - all grades from A+ to E. A+ and A earn an indexable link and an open description; for everyone else the link and description stay hidden - ",
  },
  scanCta: { ru: "просканируйте свой проект", en: "scan your project" },
  introB: { ru: " бесплатно.", en: " for free." },
  emptyTitle: { ru: "Реестр пока пуст. Первый A+ или A - за вами.", en: "The registry is empty for now. The first A+ or A is yours to take." },
  emptyCta: { ru: "Просканировать свой проект", en: "Scan your project" },
  explainer: {
    ru: "Реестр строится из публичных сканов и показывает оценку и дату - никаких приватных данных из отчётов. Ссылка на сайт и его описание открыты только у классов A/A+: каталог рекламирует приложения, заработавшие бейдж, а авторы остальных находят свой домен поиском и видят свой грейд. Владелец сайта может запросить исключение домена из реестра. Классы A+ и A присваиваются автоматически по результатам 125 проверок.",
    en: "The registry is built from public scans and shows a grade and a date - none of the private report data. The site link and description open only for grades A/A+: the catalog promotes apps that earned the badge, while other authors find their domain by search and see their grade. A site owner can request exclusion from the registry. Grades A+ and A are assigned automatically from the 125-check results.",
  },
  chipsAll: { ru: "Все", en: "All" },
  chipsTop: { ru: "Только A/A+", en: "A/A+ only" },
  searchPh: { ru: "Найти сайт - домен или название", en: "Find a site - domain or name" },
  searchAria: { ru: "Поиск по реестру", en: "Search the registry" },
  clearAria: { ru: "Очистить поиск", en: "Clear search" },
  foundBy: { ru: " · найдено по запросу «", en: " · matches for \"" },
  foundByEnd: { ru: "»", en: "\"" },
  metaLine: { ru: " · классы A+-E · описания открыты у A/A+ · сканы хранятся 7 дней", en: " · grades A+-E · descriptions open at A/A+ · scans are kept for 7 days" },
  tickLine: { ru: "за 24 часа авто-проверок: ", en: "auto-checks in the last 24 hours: " },
  apps1: { ru: "приложение", en: "app" },
  apps2: { ru: "приложения", en: "apps" },
  appsMany: { ru: "приложений", en: "apps" },
  pagePrev: { ru: "Предыдущая страница", en: "Previous page" },
  pageNext: { ru: "Следующая страница", en: "Next page" },
  noResults: { ru: "Ничего не найдено по «", en: "Nothing found for \"" },
  noResultsEnd: { ru: "». Введите домен без https:// и www.", en: "\". Type the domain without https:// and www." },
  blurTitle: { ru: "Ссылка и описание открыты для классов A и A+", en: "The link and description open for grades A and A+" },
  lockedDesc: { ru: "Описание и ссылка откроются вместе с классом A", en: "The description and link unlock together with grade A" },
  profile: { ru: "профиль", en: "profile" },
  profileTitle: { ru: "Публичный профиль домена с историей проверок", en: "Public domain profile with scan history" },
  fixCta: { ru: "Исправить →", en: "Fix it →" },
  fixTitle: { ru: "Проверь свой сайт в сканере - класс A откроет ссылку и описание", en: "Check your site in the scanner - grade A unlocks the link and description" },
  footerTrust: { ru: "независимый слой доверия для приложений, собранных с ИИ", en: "an independent trust layer for AI-built apps" },
  fHome: { ru: "главная", en: "home" },
  fStats: { ru: "статистика", en: "stats" },
  fFixes: { ru: "гайды", en: "guides" },
  fBot: { ru: "робот", en: "bot" },
  fLegal: { ru: "правила", en: "legal" },
} as const;

// UTC on both sides: the calendar day never depends on the visitor's timezone,
// so SSR markup and client hydration always agree
const dateFmt = {
  ru: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
};

function pluralApps(lang: Lang, n: number): string {
  if (lang === "en") return n === 1 ? D.apps1.en : D.appsMany.en;
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return D.apps1.ru;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return D.apps2.ru;
  return D.appsMany.ru;
}

/** platform buckets live in lib/registry (shared with the /stats leaderboard) */
type ChipKey = PlatformKey | "all" | "top";

function GradeChip({ grade }: { grade: string }) {
  const cls = GRADE_STYLES[grade] ?? "bg-slate-800 text-slate-300 border-slate-700";
  return (
    <span className={`inline-flex h-7 min-w-8 items-center justify-center rounded-md border px-2 font-display text-sm font-extrabold ${cls}`}>
      {grade}
    </span>
  );
}

function RegistryRow({ entry, lang }: { entry: RegistryEntry; lang: Lang }) {
  const dofollow = isDofollow(entry);
  const trophyPath = getTrophyPath(entry.grade);
  const meta = GRADE_META[entry.grade as keyof typeof GRADE_META];
  const statusLabel = meta?.label[lang] ?? "";

  return (
    <li className="group flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 transition hover:bg-slate-850/60">
      {/* 3D trophy icon */}
      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
        <img
          src={trophyPath}
          alt={`AppSeal ${entry.grade}`}
          width={44}
          height={44}
          className="h-11 w-11 object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)] transition-transform duration-200 group-hover:scale-110"
        />
      </div>
      <GradeChip grade={entry.grade} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {dofollow ? (
            <a
              href={`https://${entry.host}`}
              rel="noopener"
              className="truncate text-sm font-semibold text-slate-100 transition hover:text-sky-400"
            >
              {entry.host}
            </a>
          ) : (
            /* below A the host is blurred and not linked: registry traffic is
               the reward for earning the badge, search still matches the name */
            <span
              aria-hidden="true"
              title={D.blurTitle[lang]}
              className="truncate select-none blur-[3px] text-sm font-semibold text-slate-100"
            >
              {entry.host}
            </span>
          )}
          {statusLabel && (
            <span className="hidden text-xs text-slate-500 md:inline">
              · {statusLabel}
            </span>
          )}
        </div>
        {dofollow ? (
          entry.desc && (
            <p className="mt-0.5 truncate text-xs text-slate-500">{entry.desc}</p>
          )
        ) : (
          /* the description text itself never leaves the server for sub-A
             hosts (stripped in registry/page.tsx) - render the incentive */
          <p className="mt-0.5 truncate text-xs text-slate-600 italic">
            {D.lockedDesc[lang]}
          </p>
        )}
      </div>
      {dofollow ? (
        <>
          <span className={`hidden rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider sm:inline ${
            entry.grade === "A+"
              ? "border-[#C084FC]/40 text-[#C084FC] bg-[#C084FC]/10"
              : "border-[#34D399]/30 text-[#34D399] bg-[#34D399]/10"
          }`}>
            dofollow
          </span>
          <a
            href={`/verified/${entry.host}`}
            title={D.profileTitle[lang]}
            className="hidden text-[11px] font-semibold text-slate-500 transition hover:text-sky-400 md:inline"
          >
            {D.profile[lang]}
          </a>
        </>
      ) : (
        /* action CTA without leaking the blurred host: the scanner opens
           clean, the owner (who found the row by searching their domain)
           types it themselves - the blur stays meaningful */
        <a
          href="/"
          className="inline-flex items-center gap-1 rounded-md border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-[11px] font-bold text-sky-400 transition hover:bg-sky-500/20 hover:text-sky-300"
          title={D.fixTitle[lang]}
        >
          {D.fixCta[lang]}
        </a>
      )}
      <span className="font-mono text-xs text-slate-400">{entry.score}/100</span>
      <span className="font-mono text-xs text-slate-500">{dateFmt[lang].format(new Date(entry.ts))}</span>
    </li>
  );
}

export default function RegistryList({
  entries,
  tickCount,
}: {
  entries: RegistryEntry[];
  tickCount: number;
}) {
  const lang = useLang();
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<ChipKey>("all");
  const [page, setPage] = useState(1);
  const listTopRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);

  // deep link from the /stats platform battle: /registry?platform=vercel
  // preselects the matching chip (client-side, the page itself is static).
  // Deferred to a macrotask: the sync setState in the effect body triggers
  // a cascading render and would fight the hydration pass
  useEffect(() => {
    const id = window.setTimeout(() => {
      const p = new URLSearchParams(window.location.search).get("platform");
      if (p === "custom" || p === "lovable" || p === "github" || p === "vercel" || p === "other") {
        setChip(p);
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  // domain match ignores the www. prefix on both sides; the query also
  // matches the site description
  const filtered = useMemo(() => {
    let list = entries;
    if (chip === "top") list = list.filter((e) => isDofollow(e));
    else if (chip !== "all") list = list.filter((e) => platformOf(e.host) === chip);
    const q = query.trim().toLowerCase().replace(/^www\./, "");
    if (q) {
      list = list.filter(
        (e) =>
          e.host.toLowerCase().replace(/^www\./, "").includes(q) ||
          (e.desc ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [entries, query, chip]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const items = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  // jump back to the top of the list on page change (skip the first paint)
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [current]);

  const chipCounts = useMemo(() => {
    const counts: Record<ChipKey, number> = {
      all: entries.length,
      top: entries.filter((e) => isDofollow(e)).length,
      custom: 0,
      lovable: 0,
      github: 0,
      vercel: 0,
      other: 0,
    };
    for (const e of entries) counts[platformOf(e.host)] += 1;
    return counts;
  }, [entries]);

  const chipKeys: ChipKey[] = ["all", "top", "custom", "lovable", "github", "vercel", "other"];

  return (
    <>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          {D.h1[lang]}
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-slate-400">
          {D.introA[lang]}
          <Link href="/" className="text-sky-400 underline decoration-dotted underline-offset-4 hover:text-sky-300">
            {D.scanCta[lang]}
          </Link>
          {D.introB[lang]}
        </p>

        {entries.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-slate-800 bg-[#111827] p-10 text-center">
            <p className="text-slate-400">{D.emptyTitle[lang]}</p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-md bg-sky-400 px-5 py-2 text-sm font-bold text-[#090d16] transition hover:bg-sky-300"
            >
              {D.emptyCta[lang]}
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-6 flex flex-wrap gap-2">
              {chipKeys.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setChip(k);
                    setPage(1);
                  }}
                  aria-pressed={chip === k}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    chip === k
                      ? "border-sky-400/60 bg-sky-400/15 text-sky-300"
                      : "border-slate-800 bg-white/[0.03] text-slate-400 hover:border-slate-600 hover:text-slate-200"
                  }`}
                >
                  {k === "all" ? D.chipsAll[lang] : k === "top" ? D.chipsTop[lang] : PLATFORM_LABELS[k][lang]}
                  <span className="ml-1.5 font-mono text-[10px] opacity-70">{chipCounts[k]}</span>
                </button>
              ))}
            </div>

            <div className="relative mt-4">
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder={D.searchPh[lang]}
                aria-label={D.searchAria[lang]}
                className="w-full rounded-xl border border-slate-800 bg-white/[0.04] py-2.5 pl-10 pr-10 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-400/60 focus:bg-white/[0.06]"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setPage(1);
                  }}
                  aria-label={D.clearAria[lang]}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 transition hover:text-slate-200"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div ref={listTopRef} className="mt-5 flex scroll-mt-20 flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-500">
                {filtered.length} {pluralApps(lang, filtered.length)}
                {query.trim() ? (
                  <>{D.foundBy[lang]}{query.trim()}{D.foundByEnd[lang]}</>
                ) : (
                  <>{D.metaLine[lang]}</>
                )}
                {tickCount > 0 && (
                  <> · <span className="text-emerald-400">{D.tickLine[lang]}{tickCount}</span></>
                )}
              </p>
              {pages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage(Math.max(1, current - 1))}
                    disabled={current <= 1}
                    aria-label={D.pagePrev[lang]}
                    className="rounded-lg border border-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-slate-600 hover:text-slate-100 disabled:pointer-events-none disabled:opacity-40"
                  >
                    <ArrowRight size={14} className="rotate-180" />
                  </button>
                  <span className="font-mono text-xs text-slate-500">
                    {current} / {pages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage(Math.min(pages, current + 1))}
                    disabled={current >= pages}
                    aria-label={D.pageNext[lang]}
                    className="rounded-lg border border-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-slate-600 hover:text-slate-100 disabled:pointer-events-none disabled:opacity-40"
                  >
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </div>

            {items.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-slate-800 bg-[#111827] p-10 text-center">
                <p className="text-slate-400">
                  {D.noResults[lang]}{query.trim() || (chip !== "all" && chip !== "top" ? PLATFORM_LABELS[chip as PlatformKey]?.[lang] : "")}{D.noResultsEnd[lang]}
                </p>
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-slate-800/70 overflow-hidden rounded-2xl border border-slate-800 bg-[#111827]">
                {items.map((e) => (
                  <RegistryRow key={e.id} entry={e} lang={lang} />
                ))}
              </ul>
            )}
          </>
        )}

        <p className="mt-8 text-xs leading-relaxed text-slate-600">
          {D.explainer[lang]}
        </p>
      </main>

      <footer className="mt-auto border-t border-slate-800/70 bg-[#070b13]">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-4 py-8 text-center sm:flex-row sm:px-6 sm:text-left">
          <div className="space-y-1">
            <p className="text-xs text-slate-500">
              © {new Date().getFullYear()} AppSeal · {D.footerTrust[lang]}
            </p>
            <p className="font-mono text-[10px] text-slate-700">
              <a href="/" className="transition hover:text-slate-500">{D.fHome[lang]}</a> · <a href="/stats" className="transition hover:text-slate-500">{D.fStats[lang]}</a> · <a href="/versus" className="transition hover:text-slate-500">versus</a> · <a href="/fixes" className="transition hover:text-slate-500">{D.fFixes[lang]}</a> · <a href="/bot" className="transition hover:text-slate-500">{D.fBot[lang]}</a> · <a href="/legal" className="transition hover:text-slate-500">{D.fLegal[lang]}</a>
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
    </>
  );
}
