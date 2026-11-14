"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { isDofollow, type RegistryEntry } from "@/lib/registry";
import { getTrophyPath, GRADE_META } from "@/lib/scanner/grade";
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

// UTC on both sides: the calendar day never depends on the visitor's timezone,
// so SSR markup and client hydration always agree
const dateFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function pluralApps(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "приложение";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "приложения";
  return "приложений";
}

/** platform buckets for the quick-filter chips (suffix = hosting subdomain) */
type PlatformKey = "custom" | "lovable" | "github" | "vercel" | "other";

function platformOf(host: string): PlatformKey {
  const h = host.toLowerCase();
  if (h.endsWith(".lovable.app")) return "lovable";
  if (h.endsWith(".vercel.app")) return "vercel";
  if (h.endsWith(".github.io")) return "github";
  const otherPlatform = [
    ".replit.app", ".replit.dev", ".repl.co", ".railway.app", ".pages.dev",
    ".netlify.app", ".onrender.com", ".bolt.host", ".workers.dev", ".fly.dev",
  ].some((s) => h.endsWith(s));
  return otherPlatform ? "other" : "custom";
}

const PLATFORM_LABELS: Record<PlatformKey, string> = {
  custom: "Свой домен",
  lovable: "Lovable",
  github: "GitHub Pages",
  vercel: "Vercel",
  other: "Другие платформы",
};

type ChipKey = PlatformKey | "all" | "top";

function GradeChip({ grade }: { grade: string }) {
  const cls = GRADE_STYLES[grade] ?? "bg-slate-800 text-slate-300 border-slate-700";
  return (
    <span className={`inline-flex h-7 min-w-8 items-center justify-center rounded-md border px-2 font-display text-sm font-extrabold ${cls}`}>
      {grade}
    </span>
  );
}

function RegistryRow({ entry }: { entry: RegistryEntry }) {
  const dofollow = isDofollow(entry);
  const trophyPath = getTrophyPath(entry.grade);
  const meta = GRADE_META[entry.grade as keyof typeof GRADE_META];
  const statusLabel = meta?.label.ru ?? "";

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
              title="Ссылка и описание открыты для классов A и A+"
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
            Описание и ссылка откроются вместе с классом A
          </p>
        )}
      </div>
      {dofollow ? (
        <span className={`hidden rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider sm:inline ${
          entry.grade === "A+"
            ? "border-[#C084FC]/40 text-[#C084FC] bg-[#C084FC]/10"
            : "border-[#34D399]/30 text-[#34D399] bg-[#34D399]/10"
        }`}>
          dofollow
        </span>
      ) : (
        /* action CTA: the owner who found their site one click away from the
           fix flow - the scanner opens with the domain already prefilled */
        <a
          href={`/?domain=${encodeURIComponent(entry.host)}`}
          className="inline-flex items-center gap-1 rounded-md border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-[11px] font-bold text-sky-400 transition hover:bg-sky-500/20 hover:text-sky-300"
          title="Открыть сканер с этим доменом и поднять класс"
        >
          Исправить →
        </a>
      )}
      <span className="font-mono text-xs text-slate-400">{entry.score}/100</span>
      <span className="font-mono text-xs text-slate-500">{dateFmt.format(new Date(entry.ts))}</span>
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
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<ChipKey>("all");
  const [page, setPage] = useState(1);
  const listTopRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);

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
            {k === "all" ? "Все" : k === "top" ? "Только A/A+" : PLATFORM_LABELS[k]}
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
          placeholder="Найти сайт - домен или название"
          aria-label="Поиск по реестру"
          className="w-full rounded-xl border border-slate-800 bg-white/[0.04] py-2.5 pl-10 pr-10 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-400/60 focus:bg-white/[0.06]"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setPage(1);
            }}
            aria-label="Очистить поиск"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 transition hover:text-slate-200"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div ref={listTopRef} className="mt-5 flex scroll-mt-20 flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {filtered.length} {pluralApps(filtered.length)}
          {query.trim() ? (
            <> · найдено по запросу «{query.trim()}»</>
          ) : (
            <> · классы A+-E · описания открыты у A/A+ · сканы хранятся 7 дней</>
          )}
          {tickCount > 0 && (
            <> · <span className="text-emerald-400">за 24 часа авто-проверок: {tickCount}</span></>
          )}
        </p>
        {pages > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(Math.max(1, current - 1))}
              disabled={current <= 1}
              aria-label="Предыдущая страница"
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
              aria-label="Следующая страница"
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
            Ничего не найдено по «{query.trim() || PLATFORM_LABELS[chip as PlatformKey] || ""}». Введите домен без https:// и www.
          </p>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-slate-800/70 overflow-hidden rounded-2xl border border-slate-800 bg-[#111827]">
          {items.map((e) => (
            <RegistryRow key={e.id} entry={e} />
          ))}
        </ul>
      )}
    </>
  );
}
