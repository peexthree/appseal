import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "@/components/icons/appseal-icons";
import statsData from "@/data/stats-harvest.json";
import { getRegistryEntries, redisConfig, redisPipeline, STATS_HOUR_PREFIX, STATS_DAY_PREFIX } from "@/lib/scanner/store";
import { dedupeRegistry, isReferenceSite, platformOf, PLATFORM_LABELS, type PlatformKey } from "@/lib/registry";
import { PulseChart } from "./pulse-chart";
import {
  avgMedianFromHistogram,
  bucketHistogram,
  buildTopFails,
  countsFromFlat,
  gradeDynamics,
  gradeRowsFromCounts,
  mapFromFlat,
  pairsFromFlat,
  platformGradeCounts,
  statsDayKeys,
  statsHourKeys,
  tldRows,
  type TopFail,
} from "@/lib/stats";

// the page reads live Redis counters: refresh at most every minute
export const revalidate = 60;

export const metadata: Metadata = {
  title: "AppSeal - статистика AI-собранных приложений",
  description:
    "Живая статистика техосмотра: распределение классов A+-E, самые частые проваленные проверки, средний балл по платформам. Обновляется автоматически - каждый скан, попавший в реестр, сдвигает цифры.",
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

interface LiveStats {
  scans: number;
  sites: number;
  gradeRows: { grade: string; count: number }[];
  gradeACount: number;
  avg: number;
  median: number;
  topFails: TopFail[];
  tick24h: number;
  hist: { from: number; to: number; count: number }[];
  hours: number[];
  days: number[];
  catRows: { cat: string; fail: number; warn: number; loss: number }[];
  failPairs: Map<string, number>;
}

/** RU labels for check categories (engine ids). */
const CATEGORY_LABELS: Record<string, string> = {
  secrets: "Секреты и утечки",
  headers: "Заголовки и TLS",
  admin: "Админки и авторизация",
  liveness: "Живость и контент",
  trust: "ИИ-доверие и гигиена",
};

/** Live Redis counters written by pushRegistryEntry/recordCheckStats. */
async function readLiveStats(): Promise<LiveStats | null> {
  const cfg = redisConfig();
  if (!cfg) return null;
  try {
    const hourKeys = statsHourKeys(STATS_HOUR_PREFIX, new Date(), 24);
    const dayKeys = statsDayKeys(STATS_DAY_PREFIX, new Date(), 7);
    const responses = await redisPipeline(cfg, [
      ["GET", "appmot:stats:scans"],
      ["SCARD", "appmot:stats:hosts"],
      ["HGETALL", "appmot:stats:grades"],
      ["ZRANGE", "appmot:stats:scores", "0", "-1", "WITHSCORES"],
      ["ZREVRANGE", "appmot:stats:checkfails", "0", "-1", "WITHSCORES"],
      ["ZREVRANGE", "appmot:stats:checkwarns", "0", "-1", "WITHSCORES"],
      ["HGETALL", "appmot:stats:titles"],
      ["GET", "appmot:pipeline:scans24h"],
      ["HGETALL", "appmot:stats:catfails"],
      ["HGETALL", "appmot:stats:catwarns"],
      ["HGETALL", "appmot:stats:catloss"],
      ...hourKeys.map((k) => ["GET", k] as unknown[]),
      ...dayKeys.map((k) => ["GET", k] as unknown[]),
    ]);
    const [scans, sites, gradesFlat, histFlat, failFlat, warnFlat, titlesFlat, tick, catFailFlat, catWarnFlat, catLossFlat] = responses;
    const scanCount = Number(scans) || 0;
    if (scanCount <= 0) return null;
    const gradeCounts = countsFromFlat(gradesFlat);
    const { avg, median } = avgMedianFromHistogram(histFlat);
    const failPairs = pairsFromFlat(failFlat);
    const warnPairs = pairsFromFlat(warnFlat);
    const catFails = countsFromFlat(catFailFlat);
    const catWarns = countsFromFlat(catWarnFlat);
    const catLoss = countsFromFlat(catLossFlat);
    const catRows = [...new Set([...catFails.keys(), ...catWarns.keys()])]
      .map((cat) => ({
        cat,
        fail: catFails.get(cat) ?? 0,
        warn: catWarns.get(cat) ?? 0,
        loss: catLoss.get(cat) ?? 0,
      }))
      .sort((a, b) => b.fail + b.warn - (a.fail + a.warn));
    return {
      scans: scanCount,
      sites: Number(sites) || 0,
      gradeRows: gradeRowsFromCounts(gradeCounts),
      gradeACount: (gradeCounts.get("A+") ?? 0) + (gradeCounts.get("A") ?? 0),
      avg,
      median,
      topFails: buildTopFails(failPairs, warnPairs, mapFromFlat(titlesFlat), scanCount, 10),
      tick24h: Number(tick) || 0,
      hist: bucketHistogram(histFlat),
      hours: hourKeys.map((k, i) => Number(responses[11 + i]) || 0),
      days: dayKeys.map((k, i) => Number(responses[11 + hourKeys.length + i]) || 0),
      catRows,
      failPairs,
    };
  } catch {
    return null;
  }
}

export default async function StatsPage() {
  const live = await readLiveStats();
  const s = statsData;
  // top-misses need the seeded check counters: without them fall back to the
  // static mass-run snapshot instead of an empty section
  const useLive = Boolean(live && live.topFails.length > 0);
  const hasStatic = Boolean(s.generatedAt) && s.panel.done > 0;

  // platform leaderboard: live registry hosts bucketed by hosting platform.
  // Reference mega-sites (never rendered anywhere) are excluded here too.
  const allEntries = await getRegistryEntries();
  const registryHosts = dedupeRegistry(allEntries).filter(
    (e) => !isReferenceSite(e.host),
  );
  const buckets = new Map<PlatformKey, { count: number; total: number }>();
  for (const e of registryHosts) {
    const key = platformOf(e.host);
    const b = buckets.get(key) ?? { count: 0, total: 0 };
    b.count += 1;
    b.total += e.score;
    buckets.set(key, b);
  }

  // registry-derived extras (live sections)
  const dynamics = gradeDynamics(allEntries.filter((e) => !isReferenceSite(e.host)));
  const tlds = tldRows(registryHosts).slice(0, 8);
  const platformGrades = platformGradeCounts(registryHosts);

  const leaderboard = [...buckets.entries()]
    .map(([key, b]) => ({
      key,
      label: PLATFORM_LABELS[key].ru,
      count: b.count,
      avg: Math.round(b.total / b.count),
      grades: gradeRowsFromCounts(platformGrades.get(key) ?? new Map())
        .map((g) => `${g.grade} ${g.count}`)
        .join(" · "),
    }))
    .sort((a, b) => b.avg - a.avg);

  // fact cards - only meaningful on live counters
  const facts =
    useLive && live
      ? [
          {
            big: `${Math.round(((live.failPairs.get("hdr_coop") ?? 0) * 100) / live.scans)}%`,
            text: "сайтов не ставят заголовок COOP (защита окон браузера)",
          },
          {
            big: `${Math.round((live.gradeACount * 100) / Math.max(1, live.sites))}%`,
            text: "проходят весь чек-лист на класс A/A+",
          },
          {
            big: `${dynamics.improved}`,
            text: "сайтов подняли класс между повторными проверками",
          },
          {
            big: `${Math.round(
              ([...live.failPairs.entries()]
                .filter(([id]) => id.startsWith("admin_") || id.startsWith("secrets_"))
                .reduce((s, [, c]) => s + c, 0) *
                100) /
                live.scans,
            )}%`,
            text: "имеют провал по секретам или служебным эндпоинтам",
          },
        ]
      : [];

  // unified view: live counters or the static mass-run snapshot
  const v = useLive && live
    ? {
        isLive: true,
        heroCount: live.sites,
        doneCount: live.scans,
        avg: live.avg,
        median: live.median,
        gradeACount: live.gradeACount,
        gradeRows: live.gradeRows.map((r) => ({
          grade: r.grade,
          count: r.count,
          pct: live.scans ? Math.round((r.count * 100) / live.scans) : 0,
        })),
        topFails: live.topFails,
        tick24h: live.tick24h,
      }
    : {
        isLive: false,
        heroCount: s.panel.total,
        doneCount: s.panel.done,
        avg: s.avgScore,
        median: s.medianScore,
        gradeACount: s.gradeACount,
        gradeRows: Object.entries(s.grades).map(([grade, count]) => ({
          grade,
          count: Number(count),
          pct: s.panel.done ? Math.round((Number(count) * 100) / s.panel.done) : 0,
        })),
        topFails: s.topFails as TopFail[],
        tick24h: 0,
      };

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
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-400">Анонимная статистика</p>
          {v.isLive ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-400">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              обновляется после каждого скана
            </span>
          ) : null}
        </div>
        <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight sm:text-4xl">
          Техосмотр {numFmt.format(v.heroCount)} AI-собранных приложений
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
          {v.isLive ? (
            <>
              Каждый скан, попавший в <Link href="/registry" className="text-sky-400 hover:underline">реестр</Link>,
              сдвигает цифры на этой странице - распределение классов, топ-провалы и битва платформ считаются
              автоматически. Ниже только агрегаты: никаких доменов и деталей отчётов.
            </>
          ) : (
            <>
              Мы прогнали внешний чёрный ящик по публичным проектам, которыми авторы делились
              на Hacker News и GitHub. Ниже только агрегаты: никаких доменов и деталей отчётов.
              Имена появляются в <Link href="/registry" className="text-sky-400 hover:underline">реестре</Link> -
              и только для класса A/A+ или с согласия владельца.
            </>
          )}
        </p>

        {useLive && live && live.topFails.length > 0 ? (
          <div className="mt-8 rounded-2xl border border-[#F87171]/30 bg-[#1a0f14] p-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#F87171]">Угроза недели</p>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="font-display text-4xl font-extrabold text-[#F87171]">
                {live.topFails[0].failPct + live.topFails[0].warnPct}%
              </span>
              <span className="font-display text-lg font-extrabold text-slate-100">
                {live.topFails[0].title}
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Самый частый провал на живых данных: доля проверок с красным или оранжевым статусом.
              Чинится одним конфигом -{" "}
              <Link href="/fixes" className="font-bold text-sky-400 hover:underline">
                готовые исправления под ваш хостинг →
              </Link>
            </p>
          </div>
        ) : null}

        {!hasStatic && !v.isLive ? (
          <div className="mt-10 rounded-2xl border border-slate-800 bg-[#111827] p-8 text-center text-sm text-slate-400">
            Первый массовый прогон ещё идёт - цифры появятся здесь сразу после его завершения.
          </div>
        ) : (
          <>
            {v.isLive && v.tick24h > 0 ? (
              <p className="mt-4 text-sm text-emerald-400">
                За 24 часа авто-проверок: {numFmt.format(v.tick24h)}
              </p>
            ) : null}

            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { v: numFmt.format(v.doneCount), l: "сканов посчитано" },
                { v: `${v.avg}`, l: "средний балл из 100" },
                { v: `${v.median}`, l: "медианный балл" },
                { v: `${v.gradeACount}`, l: "получили класс A/A+" },
              ].map((c) => (
                <div key={c.l} className="rounded-2xl border border-slate-800 bg-[#111827] p-5">
                  <div className="font-display text-3xl font-extrabold text-slate-100">{c.v}</div>
                  <div className="mt-1 text-xs leading-snug text-slate-500">{c.l}</div>
                </div>
              ))}
            </div>

            {facts.length > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {facts.map((f) => (
                  <div key={f.text} className="rounded-2xl border border-slate-800 bg-[#0d1220] p-4">
                    <div className="font-display text-2xl font-extrabold text-sky-400">{f.big}</div>
                    <div className="mt-1 text-xs leading-snug text-slate-500">{f.text}</div>
                  </div>
                ))}
              </div>
            ) : null}

            <section className="mt-10">
              <h2 className="font-display text-xl font-extrabold">Распределение классов</h2>
              <div className="mt-4 space-y-2.5">
                {v.gradeRows.map((r) => (
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
                Шкала A+-E: класс A требуют 90+ баллов из 100 по 125 проверкам.
              </p>
            </section>

            {v.isLive && live ? (
              <section className="mt-10">
                <h2 className="font-display text-xl font-extrabold">Гистограмма баллов</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Сколько проверок попало в каждый диапазон из 100 баллов - видно, где проходит основная масса.
                </p>
                <div className="mt-4 flex h-36 items-end gap-1.5">
                  {live.hist.map((b) => {
                    const max = Math.max(...live.hist.map((x) => x.count), 1);
                    const isLast = b.to >= 100;
                    return (
                      <div key={b.from} className="group flex h-full flex-1 flex-col justify-end" title={`${b.from}-${isLast ? 100 : b.to}: ${b.count}`}>
                        <div
                          className={`rounded-t-md transition-colors group-hover:bg-sky-300 ${b.from >= 90 ? "bg-[#34D399]/70" : "bg-sky-400/50"}`}
                          style={{ height: `${Math.max((b.count * 100) / max, b.count ? 3 : 0)}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="mt-1.5 flex gap-1.5 font-mono text-[9px] text-slate-600">
                  {live.hist.map((b) => (
                    <span key={b.from} className="flex-1 text-center">
                      {b.from}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="mt-10">
              <h2 className="font-display text-xl font-extrabold">Чего чаще всего не хватает</h2>
              <p className="mt-1 text-sm text-slate-500">
                Доля сканов, где проверка провалена (красный) или под вопросом (оранжевый).
              </p>
              <ul className="mt-4 space-y-2.5">
                {v.topFails.map((f) => {
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

            {v.isLive && live && live.catRows.length > 0 ? (
              <section className="mt-10">
                <h2 className="font-display text-xl font-extrabold">Где проваливают чаще всего</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Пять категорий чек-листа: провал (красный) и под вопросом (оранжевый), плюс суммарный вес
                  штрафов, который категория в среднем приносит одному скану.
                </p>
                <ul className="mt-4 space-y-3">
                  {live.catRows.map((c) => {
                    const failPct = Math.round((c.fail * 100) / live.scans);
                    const warnPct = Math.round((c.warn * 100) / live.scans);
                    const lossAvg = Math.round(c.loss / Math.max(1, live.scans));
                    return (
                      <li key={c.cat} className="flex items-center gap-3">
                        <span className="w-56 shrink-0 truncate text-sm text-slate-300 sm:w-72">
                          {CATEGORY_LABELS[c.cat] ?? c.cat}
                        </span>
                        <div className="flex h-5 flex-1 gap-px">
                          {failPct + warnPct > 0 ? (
                            <>
                              <div className={`rounded-l-md bg-[#F87171] ${warnPct ? "" : "rounded-r-md"}`} style={{ width: `${failPct}%` }} />
                              <div className={`bg-[#FB923C] ${warnPct ? "rounded-r-md" : ""}`} style={{ width: `${warnPct}%` }} />
                            </>
                          ) : null}
                        </div>
                        <span className="w-24 text-right font-mono text-xs text-slate-500" title="суммарный вес штрафов категории в среднем на скан">
                          -{lossAvg} б.
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            <section className="mt-10">
              <h2 className="font-display text-xl font-extrabold">Битва платформ</h2>
              <p className="mt-1 text-sm text-slate-500">
                Средний балл безопасности сборок по хостинг-платформам из{" "}
                <Link href="/registry" className="text-sky-400 hover:underline">реестра</Link>.
                Кто из конструкторов выпускает более защищённые приложения - цифры обновляются с каждым новым сканом.
              </p>
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-800 bg-[#111827]">
                <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <span className="flex-1">Платформа</span>
                  <span className="w-20 text-right">Домены</span>
                  <span className="w-24 text-right">Средний балл</span>
                </div>
                {leaderboard.map((row, i) => (
                  <div
                    key={row.key}
                    className={`flex items-center gap-3 px-5 py-3 ${i < leaderboard.length - 1 ? "border-b border-slate-800/60" : ""}`}
                  >
                    <span className="flex flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-2.5 text-sm font-semibold text-slate-200">
                        <span className={`font-mono text-xs ${i === 0 ? "text-amber-400" : "text-slate-600"}`}>
                          {i + 1}.
                        </span>
                        <Link
                          href={`/registry?platform=${row.key}`}
                          title={`Открыть реестр: только ${row.label}`}
                          className="transition hover:text-sky-400"
                        >
                          {row.label}
                        </Link>
                      </span>
                      {row.grades ? <span className="text-[10px] text-slate-500">{row.grades}</span> : null}
                    </span>
                    <span className="w-20 text-right font-mono text-xs text-slate-400">{row.count}</span>
                    <span
                      className={`w-24 text-right font-mono text-sm font-bold ${
                        row.avg >= 90 ? "text-emerald-400" : row.avg >= 70 ? "text-sky-400" : "text-amber-400"
                      }`}
                    >
                      {row.avg}/100
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {v.isLive ? (
              <section className="mt-10">
                <h2 className="font-display text-xl font-extrabold">Динамика повторных проверок</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Сайты, попавшие в реестр больше одного раза: куда двинулся их класс между первым и
                  последним сохранённым сканом.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {[
                    { v: dynamics.improved, l: "подняли класс", c: "text-emerald-400", s: "↑" },
                    { v: dynamics.stable, l: "держат тот же класс", c: "text-slate-300", s: "→" },
                    { v: dynamics.dropped, l: "просели ниже", c: "text-amber-400", s: "↓" },
                  ].map((d) => (
                    <div key={d.l} className="rounded-2xl border border-slate-800 bg-[#111827] p-5">
                      <div className={`font-display text-3xl font-extrabold ${d.c}`}>
                        {d.s} {d.v}
                      </div>
                      <div className="mt-1 text-xs leading-snug text-slate-500">{d.l}</div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {v.isLive && live ? (
              <PulseChart hours={live.hours} days={live.days} total={v.doneCount} />
            ) : null}

            {v.isLive ? (
              <section className="mt-10">
                <h2 className="font-display text-xl font-extrabold">По доменным зонам</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Где живут проверенные проекты и как там со средним баллом.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  {tlds.map((t) => (
                    <div key={t.tld} className="rounded-2xl border border-slate-800 bg-[#111827] p-4">
                      <div className="font-mono text-sm font-bold text-sky-400">.{t.tld}</div>
                      <div className="mt-1.5 font-display text-xl font-extrabold text-slate-100">{t.count}</div>
                      <div className="text-xs text-slate-500">средний балл {t.avg}</div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="mt-10">
              <h2 className="font-display text-xl font-extrabold">Откуда приложения</h2>
              <p className="mt-1 text-sm text-slate-500">
                Разбивка исторического массового прогона от {dateFmt.format(new Date(s.generatedAt))}.
              </p>
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
              {v.isLive ? (
                <>
                  База включает исторический массовый прогон от {dateFmt.format(new Date(s.generatedAt))}.
                  Сканер ходит с пометкой AppSeal-Scanner, делает ~140 вежливых GET-запросов на сайт и ничего
                  не эксплуатирует; правила для ботов - на странице{" "}
                  <Link href="/bot" className="underline hover:text-slate-400">/bot</Link>.
                  Владелец домена может запросить исключение из любых публикаций: linedrop@yandex.ru
                  (3 рабочих дня).
                </>
              ) : (
                <>
                  Прогон от {dateFmt.format(new Date(s.generatedAt))}. Сканер ходит с пометкой
                  AppSeal-Scanner, делает ~140 вежливых GET-запросов на сайт и ничего не эксплуатирует;
                  правила для ботов - на странице <Link href="/bot" className="underline hover:text-slate-400">/bot</Link>.
                  Владелец домена может запросить исключение из любых публикаций: linedrop@yandex.ru (3 рабочих дня).
                </>
              )}
            </p>
          </>
        )}
      </main>

      <footer className="border-t border-slate-800/70 bg-[#070B13]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-slate-500 sm:px-6">
          <span>AppSeal Engine v1.0 · External Black-Box Security Scanner</span>
          <span className="inline-flex items-center gap-3">
            <Link href="/digest" className="transition hover:text-slate-400">дайджест недели</Link>
            <Link href="/fixes" className="transition hover:text-slate-400">гайды по исправлению</Link>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-400" /> Aggregate-only статистика
            </span>
          </span>
        </div>
      </footer>
    </div>
  );
}
