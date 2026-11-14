import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "@/components/icons/appseal-icons";
import statsData from "@/data/stats-harvest.json";

export const metadata: Metadata = {
  title: "AppSeal - статистика AI-собранных приложений",
  description:
    "Анонимный агрегат массового техосмотра: распределение классов A+-E, самые частые проваленные проверки, средний балл по источникам. Имена публикуются только в реестре - для класса A/A+ или с согласия владельца.",
  alternates: { canonical: "/stats" },
};

const GRADE_STYLES: Record<string, string> = {
  "A+": "bg-[#C084FC]",
  A: "bg-[#34D399]",
  B: "bg-[#38BDF8]",
  C: "bg-[#FBBF24]",
  D: "bg-[#FB923C]",
  E: "bg-[#F87171]",
};

const SOURCE_LABELS: Record<string, string> = {
  hn: "Hacker News (Show HN)",
  github: "GitHub",
  reddit: "Reddit",
  unknown: "Другие источники",
};

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
const numFmt = new Intl.NumberFormat("ru-RU");

interface TopFail {
  id: string;
  title: string;
  failPct: number;
  warnPct: number;
}

export default function StatsPage() {
  const s = statsData;
  const hasData = Boolean(s.generatedAt) && s.panel.done > 0;
  const done = s.panel.done;
  const gradeRows = Object.entries(s.grades).map(([grade, count]) => ({
    grade,
    count: Number(count),
    pct: done ? Math.round((Number(count) * 100) / done) : 0,
  }));
  const sources = Object.entries(s.sources).map(([k, n]) => ({
    key: k,
    label: SOURCE_LABELS[k] ?? k,
    count: Number(n),
    avg: (s.avgScoreBySource as Record<string, number>)[k],
  }));

  return (
    <div className="flex min-h-screen flex-col bg-[#090d16] text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-800/70 bg-[#090d16]/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5" aria-label="AppSeal home">
            <img
              src="/ico.png"
              alt="AppSeal"
              width={28}
              height={28}
              className="h-7 w-7 object-contain drop-shadow-[0_2px_8px_rgba(56,189,248,0.4)] transition-transform hover:scale-105"
            />
            <span className="font-display text-lg font-extrabold tracking-tight">AppSeal</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/registry" className="text-sm font-semibold text-slate-300 transition hover:text-sky-400">
              Реестр
            </Link>
            <Link
              href="/"
              className="rounded-md bg-sky-400 px-4 py-1.5 text-sm font-bold text-[#090d16] transition hover:bg-sky-300"
            >
              Проверить свой
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-400">Анонимная статистика</p>
        <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight sm:text-4xl">
          Техосмотр {numFmt.format(s.panel.total)} AI-собранных приложений
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
          Мы прогнали внешний чёрный ящик по публичным проектам, которыми авторы делились
          на Hacker News и GitHub. Ниже только агрегаты: никаких доменов и деталей отчётов.
          Имена появляются в <Link href="/registry" className="text-sky-400 hover:underline">реестре</Link> -
          и только для класса A/A+ или с согласия владельца.
        </p>

        {!hasData ? (
          <div className="mt-10 rounded-2xl border border-slate-800 bg-[#111827] p-8 text-center text-sm text-slate-400">
            Первый массовый прогон ещё идёт - цифры появятся здесь сразу после его завершения.
          </div>
        ) : (
          <>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { v: numFmt.format(done), l: "прошли скан целиком" },
                { v: `${s.avgScore}`, l: "средний балл из 100" },
                { v: `${s.medianScore}`, l: "медианный балл" },
                { v: `${s.gradeACount}`, l: "получили класс A/A+" },
              ].map((c) => (
                <div key={c.l} className="rounded-2xl border border-slate-800 bg-[#111827] p-5">
                  <div className="font-display text-3xl font-extrabold text-slate-100">{c.v}</div>
                  <div className="mt-1 text-xs leading-snug text-slate-500">{c.l}</div>
                </div>
              ))}
            </div>

            <section className="mt-10">
              <h2 className="font-display text-xl font-extrabold">Распределение классов</h2>
              <div className="mt-4 space-y-2.5">
                {gradeRows.map((r) => (
                  <div key={r.grade} className="flex items-center gap-3">
                    <span className="w-8 font-display text-sm font-extrabold text-slate-300">{r.grade}</span>
                    <div className="h-6 flex-1 overflow-hidden rounded-md bg-[#111827]">
                      <div
                        className={`h-full rounded-md ${GRADE_STYLES[r.grade] ?? "bg-slate-600"}`}
                        style={{ width: `${Math.max(r.pct, r.count ? 2 : 0)}%` }}
                      />
                    </div>
                    <span className="w-24 text-right font-mono text-xs text-slate-400">
                      {numFmt.format(r.count)} · {r.pct}%
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-600">
                Шкала A+-E: класс A требуют 90+ баллов из 100 по 97 проверкам.
              </p>
            </section>

            <section className="mt-10">
              <h2 className="font-display text-xl font-extrabold">Чего чаще всего не хватает</h2>
              <p className="mt-1 text-sm text-slate-500">
                Доля приложений, где проверка провалена (красный) или под вопросом (оранжевый).
              </p>
              <ul className="mt-4 space-y-2.5">
                {(s.topFails as TopFail[]).map((f) => {
                  const miss = f.failPct + f.warnPct;
                  return (
                    <li key={f.id} className="flex items-center gap-3">
                      <span className="w-56 shrink-0 truncate text-sm text-slate-300 sm:w-72" title={f.title}>
                        {f.title}
                      </span>
                      <div className="flex h-5 flex-1 gap-px">
                        {miss > 0 ? (
                          <>
                            <div className="rounded-l-md bg-[#F87171]" style={{ width: `${f.failPct}%` }} />
                            <div className={`bg-[#FB923C] ${f.failPct ? "" : "rounded-l-md"} ${f.warnPct ? "rounded-r-md" : ""}`} style={{ width: `${f.warnPct}%` }} />
                          </>
                        ) : null}
                      </div>
                      <span className="w-12 text-right font-mono text-xs font-bold text-[#FB923C]">{miss}%</span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="mt-10">
              <h2 className="font-display text-xl font-extrabold">Откуда приложения</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {sources.map((src) => (
                  <div key={src.key} className="rounded-2xl border border-slate-800 bg-[#111827] p-5">
                    <div className="text-sm font-bold text-slate-200">{src.label}</div>
                    <div className="mt-2 font-display text-2xl font-extrabold text-slate-100">
                      {numFmt.format(src.count)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {typeof src.avg === "number" ? `средний балл ${src.avg}` : "мало данных для среднего"}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <p className="mt-10 text-xs leading-relaxed text-slate-600">
              Прогон от {dateFmt.format(new Date(s.generatedAt))}. Сканер ходит с пометкой
              AppSeal-Scanner, делает ~100 вежливых GET-запросов на сайт и ничего не эксплуатирует;
              правила для ботов - на странице <Link href="/bot" className="underline hover:text-slate-400">/bot</Link>.
              Владелец домена может запросить исключение из любых публикаций: linedrop@yandex.ru (3 рабочих дня).
            </p>
          </>
        )}
      </main>

      <footer className="border-t border-slate-800/70 bg-[#070B13]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-slate-500 sm:px-6">
          <span>AppSeal Engine v1.0 · External Black-Box Security Scanner</span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-400" /> Aggregate-only статистика
          </span>
        </div>
      </footer>
    </div>
  );
}
