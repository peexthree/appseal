import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { HtmlLangSync } from "@/components/html-lang-sync";
import { ShieldCheck } from "@/components/icons/appseal-icons";
import statsData from "@/data/stats-harvest.json";
import { getRegistryEntriesCached, redisConfig, redisPipeline, STATS_HOUR_PREFIX, STATS_DAY_PREFIX } from "@/lib/scanner/store";
import { canonicalHost, dedupeRegistry, isReferenceSite, platformBucketOf, PLATFORM_LABELS, type PlatformKey, type RegistryEntry } from "@/lib/registry";
import { gradeMovementRows } from "@/lib/db";
import { pageLang } from "@/lib/lang-server";
import { PulseChart } from "./pulse-chart";
import {
  avgMedianFromHistogram,
  barShare,
  bucketHistogram,
  buildTopFails,
  countsFromFlat,
  formatPenaltyAvg,
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

// the page reads the appseal-lang cookie (set by the navbar switcher), so it
// renders dynamically per request instead of on the revalidate clock
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await pageLang();
  return lang === "en"
    ? {
        title: "AppSeal - stats for AI-built apps",
        description:
          "Live stats from the AppSeal black-box scanner: A+-E grade distribution, the most commonly failed checks, average score by hosting platform. Updates automatically - every scan that lands in the registry shifts the numbers.",
        alternates: { canonical: "/stats" },
      }
    : {
        title: "AppSeal - статистика AI-собранных приложений",
        description:
          "Живая статистика техосмотра: распределение классов A+-E, самые частые проваленные проверки, средний балл по платформам. Обновляется автоматически - каждый скан, попавший в реестр, сдвигает цифры.",
        alternates: { canonical: "/stats" },
      };
}

const GRADE_STYLES: Record<string, string> = {
  "A+": "bg-[#C084FC]",
  A: "bg-[#34D399]",
  B: "bg-[#38BDF8]",
  C: "bg-[#FBBF24]",
  D: "bg-[#FB923C]",
  E: "bg-[#F87171]",
};

/** grade chip for the weekly leaderboard, same translucent style as the registry */
const GRADE_CHIP: Record<string, string> = {
  "A+": "bg-[#C084FC]/15 text-[#C084FC] border-[#C084FC]/40",
  A: "bg-[#34D399]/15 text-[#34D399] border-[#34D399]/40",
  B: "bg-[#38BDF8]/15 text-[#38BDF8] border-[#38BDF8]/40",
  C: "bg-[#FBBF24]/15 text-[#FBBF24] border-[#FBBF24]/40",
  D: "bg-[#FB923C]/15 text-[#FB923C] border-[#FB923C]/40",
  E: "bg-[#F87171]/15 text-[#F87171] border-[#F87171]/40",
};

const SOURCE_LABELS: Record<string, { ru: string; en: string }> = {
  hn: { ru: "Hacker News (Show HN)", en: "Hacker News (Show HN)" },
  github: { ru: "GitHub", en: "GitHub" },
  reddit: { ru: "Reddit", en: "Reddit" },
  unknown: { ru: "Другие источники", en: "Other sources" },
};

/** UI strings; check-title and category dicts live right below */
const D = {
  eyebrow: { ru: "Анонимная статистика", en: "Anonymous statistics" },
  liveBadge: { ru: "обновляется после каждого скана", en: "updates after every scan" },
  h1a: { ru: "Техосмотр", en: "A security checkup of" },
  h1b: { ru: "AI-собранных приложений", en: "AI-built apps" },
  introLiveA: { ru: "Каждый скан, попавший в ", en: "Every scan that lands in the " },
  regWord: { ru: "реестр", en: "registry" },
  introLiveB: {
    ru: ", сдвигает цифры на этой странице - распределение классов, топ-провалы и битва платформ считаются автоматически. Ниже только агрегаты: никаких доменов и деталей отчётов.",
    en: " shifts the numbers on this page: grade distribution, top gaps and the platform battle are computed automatically. Aggregates only below - no domains, no report details.",
  },
  introStaticA: {
    ru: "Мы прогнали внешний чёрный ящик по публичным проектам, которыми авторы делились на Hacker News и GitHub. Ниже только агрегаты: никаких доменов и деталей отчётов. Имена появляются в ",
    en: "We ran an external black-box scanner over public projects their authors shared on Hacker News and GitHub. Aggregates only below - no domains, no report details. Names appear in the ",
  },
  introStaticB: {
    ru: " вместе с классом и датой; ссылка и описание открываются только у класса A/A+.",
    en: " along with their grade and date; the link and description unlock only for grade A/A+.",
  },
  threatEyebrow: { ru: "Угроза недели", en: "Threat of the week" },
  threatNote: {
    ru: "Самый частый провал на живых данных: доля проверок с красным или оранжевым статусом. Чинится одним конфигом - ",
    en: "The most common gap on live data: the share of checks that come back red or orange. Fixable with one config - ",
  },
  threatCta: { ru: "готовые исправления под ваш хостинг →", en: "ready-made fixes for your hosting →" },
  pending: {
    ru: "Первый массовый прогон ещё идёт - цифры появятся здесь сразу после его завершения.",
    en: "The first mass run is still in progress - the numbers will appear here right after it completes.",
  },
  runNewBadge: { ru: "Прогон приостановлен", en: "Run paused" },
  runNewNote: {
    ru: "Обработано {done} из {total} сайтов списка, из них {dead} мёртвых или не открывшихся. Цифры обновляются по мере сканирования.",
    en: "{done} of {total} list sites processed, {dead} of them dead or unreachable. Numbers update as scanning continues.",
  },
  heroBreakdown: {
    ru: "{live} живых получили класс · {dead} мёртвых · {queued} ещё не проверены",
    en: "{live} live got a grade · {dead} dead · {queued} not scanned yet",
  },
  tickLead: { ru: "За 24 часа проверок: ", en: "Checks in the last 24 hours: " },
  stat1: { ru: "живых приложений с классом", en: "live apps with a grade" },
  stat2: { ru: "мёртвых или не открывшихся", en: "dead or unreachable" },
  stat3: { ru: "средний балл из 100", en: "average score out of 100" },
  statMedian: { ru: "медианный балл", en: "median score" },
  stat4: { ru: "получили класс A/A+", en: "earned grade A/A+" },
  fact1: { ru: "сайтов не ставят заголовок COOP (защита окон браузера)", en: "of sites skip the COOP header (browser window protection)" },
  fact2: { ru: "проходят весь чек-лист на класс A/A+", en: "pass the full checklist for grade A/A+" },
  fact3: { ru: "сайтов подняли класс между повторными проверками", en: "sites moved up a grade between rescans" },
  fact4: { ru: "имеют провал по секретам или служебным эндпоинтам", en: "have a failing secrets or exposed-endpoint check" },
  distTitle: { ru: "Распределение классов", en: "Grade distribution" },
  // thresholds mirror grade.ts: A = score >= 85, A+ = >= 96 with a clean run
  scaleNote: {
    ru: "Шкала A+-E: класс A - 85+ баллов из 100 по 125 проверкам, A+ - 96+ без единого провала.",
    en: "The A+-E scale: grade A needs 85+ out of 100 across 125 checks; A+ is 96+ with a fully clean run.",
  },
  histTitle: { ru: "Гистограмма баллов", en: "Score histogram" },
  histNote: {
    ru: "Сколько проверок попало в каждый диапазон из 100 баллов - видно, где проходит основная масса.",
    en: "How many scans landed in each band of the 100-point scale - where the bulk of the fleet sits.",
  },
  gapsTitle: { ru: "Чего чаще всего не хватает", en: "Most common gaps" },
  gapsNote: {
    ru: "Доля сканов, где проверка провалена (красный) или под вопросом (оранжевый).",
    en: "Share of scans where the check failed (red) or is questionable (orange).",
  },
  catTitle: { ru: "Где проваливают чаще всего", en: "Where scans fail most" },
  catNote: {
    ru: "Пять категорий чек-листа: провал (красный) и под вопросом (оранжевый), плюс суммарный вес штрафов, который категория в среднем приносит одному скану.",
    en: "Five checklist categories: failed (red) and questionable (orange), plus the average penalty weight a category adds to one scan.",
  },
  catLossTitle: {
    ru: "суммарный вес штрафов категории в среднем на скан",
    en: "the category's average penalty weight per scan",
  },
  catPts: { ru: "б.", en: "pts" },
  battleTitle: { ru: "Битва платформ", en: "Platform battle" },
  battleNoteA: {
    ru: "Средний балл безопасности сборок по хостинг-платформам из ",
    en: "Average security score of builds across the hosting platforms in the ",
  },
  battleNoteB: {
    ru: ". Кто из конструкторов выпускает более защищённые приложения - цифры обновляются с каждым новым сканом.",
    en: ". Which builders ship the most secure apps - the numbers update with every new scan.",
  },
  thPlatform: { ru: "Платформа", en: "Platform" },
  thDomains: { ru: "Домены", en: "Domains" },
  thAvg: { ru: "Средний балл", en: "Avg score" },
  weekTopTitle: { ru: "Топ недели", en: "Top of the week" },
  weekTopNote: {
    ru: "Лучший результат каждого домена за последние 7 дней - топ-10 живого реестра.",
    en: "Each domain's best result over the last 7 days - the top 10 of the live registry.",
  },
  thPlace: { ru: "Место", en: "Rank" },
  thHost: { ru: "Домен", en: "Host" },
  thGrade: { ru: "Класс", en: "Grade" },
  benchTitle: { ru: "Бенчмарк", en: "Benchmark" },
  benchNote: {
    ru: "Средний балл по всем доменам реестра и доля классов A/A+ - точка отсчёта, с которой можно сравнить свой результат.",
    en: "The average score across all registry domains and the share of A/A+ grades - the baseline to compare your own result against.",
  },
  benchAvgLabel: { ru: "средний балл реестра", en: "registry average score" },
  benchAAShare: { ru: "доменов с классом A/A+", en: "domains graded A/A+" },
  registryOnlyA: { ru: "Открыть реестр: только ", en: "Open the registry: " },
  registryOnlyB: { ru: "", en: " only" },
  dynTitle: { ru: "Динамика повторных проверок", en: "Rescan dynamics" },
  dynNote: {
    ru: "Сайты, попавшие в реестр больше одного раза: куда двинулся их класс между первым и последним сохранённым сканом.",
    en: "Sites that entered the registry more than once: how their grade moved between the first and the latest saved scan.",
  },
  dynUp: { ru: "подняли класс", en: "moved up" },
  dynSame: { ru: "держат тот же класс", en: "hold the same grade" },
  dynDown: { ru: "просели ниже", en: "slipped down" },
  tldTitle: { ru: "По доменным зонам", en: "By domain zone" },
  tldNote: {
    ru: "Где живут проверенные проекты и как там со средним баллом.",
    en: "Where the scanned projects live and how they score on average.",
  },
  tldAvg: { ru: "средний балл ", en: "avg score " },
  srcTitle: { ru: "Откуда приложения", en: "Where the apps come from" },
  srcNote: { ru: "Разбивка нового массового прогона от ", en: "Breakdown of the new mass run from " },
  srcAvg: { ru: "средний балл ", en: "avg score " },
  srcNoAvg: { ru: "мало данных для среднего", en: "not enough data for an average" },
  footLiveA: {
    ru: "База включает новый массовый прогон от ",
    en: "The database includes the new mass run from ",
  },
  footScanner: {
    ru: ". Сканер ходит с пометкой AppSeal-Scanner, делает ~140 вежливых GET-запросов на сайт и ничего не эксплуатирует; правила для ботов - на странице ",
    en: ". The scanner identifies as AppSeal-Scanner, makes ~140 polite GET requests per site and exploits nothing; bot rules are on the ",
  },
  footOptout: {
    ru: ". Владелец домена может запросить исключение из любых публикаций: security@appseal.online (3 рабочих дня).",
    en: " page. A domain owner can request exclusion from any publication: security@appseal.online (3 business days).",
  },
  footDigest: { ru: "дайджест недели", en: "weekly digest" },
  footFixes: { ru: "гайды по исправлению", en: "fix guides" },
  footAgg: { ru: "Aggregate-only статистика", en: "Aggregate-only stats" },
} as const;

/** EN titles for the checks most likely to hit the top-misses list; the RU
 * title from Redis stays the fallback for anything not mapped here */
const FAIL_TITLES_EN: Record<string, string> = {
  hdr_coop: "COOP header missing",
  hdr_permissions: "Permissions-Policy header missing",
  hdr_csp: "CSP header missing",
  hdr_xfo: "X-Frame-Options header missing",
  hdr_referrer: "Referrer-Policy header missing",
  hdr_xcto: "X-Content-Type-Options header missing",
  hdr_hsts: "HSTS header missing",
  hdr_xxss: "X-XSS-Protection header missing",
  og_image: "og:image missing",
  og_title: "og:title missing",
  og_description: "og:description missing",
  sri_missing: "Third-party scripts without SRI",
  cors_wildcard: "CORS open to all (*)",
};

/** RU labels for check categories (engine ids) */
const CATEGORY_LABELS: Record<string, { ru: string; en: string }> = {
  secrets: { ru: "Секреты и утечки", en: "Secrets & leaks" },
  headers: { ru: "Заголовки и TLS", en: "Headers & TLS" },
  admin: { ru: "Админки и авторизация", en: "Admin panels & auth" },
  liveness: { ru: "Живость и контент", en: "Liveness & content" },
  trust: { ru: "ИИ-доверие и гигиена", en: "AI-trust hygiene" },
};

interface LiveStats {
  scans: number;
  sites: number;
  gradeRows: { grade: string; count: number }[];
  gradeACount: number;
  avg: number;
  median: number;
  topFails: TopFail[];
  checks24h: number;
  hist: { from: number; to: number; count: number }[];
  hours: number[];
  days: number[];
  days30: number[];
  catRows: { cat: string; fail: number; warn: number; loss: number }[];
  failPairs: Map<string, number>;
  warnPairs: Map<string, number>;
}

/** Live Redis counters written by pushRegistryEntry/recordCheckStats. */
async function readLiveStats(): Promise<LiveStats | null> {
  const cfg = redisConfig();
  if (!cfg) return null;
  try {
    const hourKeys = statsHourKeys(STATS_HOUR_PREFIX, new Date(), 24);
    // one read for both pulse windows: the 7-day view is the tail of the 30
    const dayKeys = statsDayKeys(STATS_DAY_PREFIX, new Date(), 30);
    const responses = await redisPipeline(cfg, [
      ["GET", "appmot:stats:scans"],
      ["SCARD", "appmot:stats:hosts"],
      ["HGETALL", "appmot:stats:grades"],
      ["ZRANGE", "appmot:stats:scores", "0", "-1", "WITHSCORES"],
      ["ZREVRANGE", "appmot:stats:checkfails", "0", "-1", "WITHSCORES"],
      ["ZREVRANGE", "appmot:stats:checkwarns", "0", "-1", "WITHSCORES"],
      ["HGETALL", "appmot:stats:titles"],
      ["HGETALL", "appmot:stats:catfails"],
      ["HGETALL", "appmot:stats:catwarns"],
      ["HGETALL", "appmot:stats:catloss"],
      ...hourKeys.map((k) => ["GET", k] as unknown[]),
      ...dayKeys.map((k) => ["GET", k] as unknown[]),
    ]);
    const [scans, sites, gradesFlat, histFlat, failFlat, warnFlat, titlesFlat, catFailFlat, catWarnFlat, catLossFlat] = responses;
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
    const offset = 10;
    const hours = hourKeys.map((k, i) => Number(responses[offset + i]) || 0);
    const days30 = dayKeys.map((k, i) => Number(responses[offset + hourKeys.length + i]) || 0);
    return {
      scans: scanCount,
      sites: Number(sites) || 0,
      gradeRows: gradeRowsFromCounts(gradeCounts),
      gradeACount: (gradeCounts.get("A+") ?? 0) + (gradeCounts.get("A") ?? 0),
      avg,
      median,
      topFails: buildTopFails(failPairs, warnPairs, mapFromFlat(titlesFlat), scanCount, 10),
      checks24h: hours.reduce((acc, n) => acc + n, 0),
      hist: bucketHistogram(histFlat),
      hours,
      days: days30.slice(-7),
      days30,
      catRows,
      failPairs,
      warnPairs,
    };
  } catch {
    return null;
  }
}

export default async function StatsPage() {
  const lang = await pageLang();
  const t = (k: keyof typeof D) => D[k][lang];
  const numFmt = new Intl.NumberFormat(lang === "en" ? "en-US" : "ru-RU");
  const dateFmt = new Intl.DateTimeFormat(lang === "en" ? "en-US" : "ru-RU", { day: "numeric", month: "long", year: "numeric" });

  const live = await readLiveStats();
  const s = statsData;
  // top-misses need the seeded check counters: without them fall back to the
  // static mass-run snapshot instead of an empty section
  const useLive = Boolean(live && live.topFails.length > 0);
  const hasStatic = Boolean(s.generatedAt) && s.panel.done > 0;

  // platform leaderboard: live registry hosts bucketed by hosting platform.
  // Reference mega-sites (never rendered anywhere) are excluded here too.
  const allEntries = await getRegistryEntriesCached();
  const registryHosts = dedupeRegistry(allEntries).filter(
    (e) => !isReferenceSite(e.host),
  );
  const buckets = new Map<PlatformKey, { count: number; total: number }>();
  for (const e of registryHosts) {
    const key = platformBucketOf(e);
    const b = buckets.get(key) ?? { count: 0, total: 0 };
    b.count += 1;
    b.total += e.score;
    buckets.set(key, b);
  }

  // registry-derived extras (live sections)
  const tlds = tldRows(registryHosts).slice(0, 8);
  const platformGrades = platformGradeCounts(registryHosts);

  // rescan dynamics: the durable scans archive holds the full per-host history
  // (the registry list keeps only a bounded window, where rescans of the same
  // host are usually evicted by newer mass-run pushes); without a database the
  // registry-window computation stays the fallback
  const dbMoves = await gradeMovementRows();
  const dynamics =
    dbMoves !== null
      ? gradeDynamics(dbMoves.filter((e) => !isReferenceSite(e.host)))
      : gradeDynamics(allEntries.filter((e) => !isReferenceSite(e.host)));

  // platform battle: rows with at least one domain, biggest fleet first
  const leaderboard = [...buckets.entries()]
    .filter(([, b]) => b.count > 0)
    .map(([key, b]) => ({
      key,
      count: b.count,
      avg: Math.round(b.total / b.count),
      grades: gradeRowsFromCounts(platformGrades.get(key) ?? new Map())
        .map((g) => `${g.grade} ${g.count}`)
        .join(" · "),
    }))
    .sort((a, b) => b.count - a.count || b.avg - a.avg);

  // weekly leaderboard: each host's best score over the last 7 days, top 10.
  // Raw entries (not deduped) so a re-scan with a higher score counts;
  // reference mega-sites never render, same rule as every other section.
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const weekCutoff = Date.now() - WEEK_MS;
  const weekBest = new Map<string, RegistryEntry>();
  for (const e of allEntries) {
    if (isReferenceSite(e.host) || e.ts < weekCutoff) continue;
    const key = canonicalHost(e.host);
    const cur = weekBest.get(key);
    if (!cur || e.score > cur.score) weekBest.set(key, e);
  }
  const topWeek = [...weekBest.values()].sort((a, b) => b.score - a.score).slice(0, 10);

  // benchmark: registry-wide baseline from the same deduped, reference-free
  // hosts the platform battle renders - no invented numbers, empty registry
  // skips the block entirely
  const benchAvg =
    registryHosts.length > 0
      ? Math.round(registryHosts.reduce((acc, e) => acc + e.score, 0) / registryHosts.length)
      : 0;
  const benchAA =
    registryHosts.length > 0
      ? Math.round(
          (registryHosts.filter((e) => e.grade === "A" || e.grade === "A+").length * 100) /
            registryHosts.length,
        )
      : 0;

  // fact cards - only meaningful on live counters; the miss share counts
  // fails AND warns (a warn-only check like COOP would show a false 0%)
  const facts =
    useLive && live
      ? (() => {
          const missSum = (pred: (id: string) => boolean) =>
            [...live.failPairs, ...live.warnPairs]
              .filter(([id]) => pred(id))
              .reduce((acc, [, c]) => acc + c, 0);
          return [
            {
              big: `${Math.round(((live.failPairs.get("hdr_coop") ?? 0) + (live.warnPairs.get("hdr_coop") ?? 0)) * 100 / live.scans)}%`,
              text: t("fact1"),
            },
            {
              big: `${Math.round((live.gradeACount * 100) / Math.max(1, live.sites))}%`,
              text: t("fact2"),
            },
            {
              big: `${dynamics.improved}`,
              text: t("fact3"),
            },
            {
              big: `${Math.round(
                (missSum((id) => id.startsWith("admin_") || id.startsWith("secrets_")) * 100) /
                  live.scans,
              )}%`,
              text: t("fact4"),
            },
          ];
        })()
      : [];

  // unified view: live counters or the static mass-run snapshot. The title
  // total counts everything that went through the checkup: live hosts (Redis
  // SCARD) plus the dead/unreachable ones (snapshot, refreshed by the stats
  // task) - the requested "8k dead" show as their own card, the queue is a
  // breakdown line under the title
  const deadCount = Number(s.panel.dead) + Number((s.panel as { apiError?: number }).apiError ?? 0);
  const queuedCount = Number(s.panel.missing);
  const v = useLive && live
    ? {
        isLive: true,
        heroCount: live.sites + deadCount,
        liveHosts: live.sites,
        deadCount,
        queuedCount,
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
        checks24h: live.checks24h,
      }
    : {
        isLive: false,
        heroCount: Number(s.panel.total),
        liveHosts: Number(s.panel.done),
        deadCount,
        queuedCount,
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
        checks24h: 0,
      };

  const sources = Object.entries(s.sources).map(([k, n]) => ({
    key: k,
    label: SOURCE_LABELS[k]?.[lang] ?? k,
    count: Number(n),
    avg: (s.avgScoreBySource as Record<string, number>)[k],
  }));

  return (
    <div className="flex min-h-screen flex-col text-slate-100">
      <HtmlLangSync lang={lang} />
      <SiteHeader lang={lang} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-400">{t("eyebrow")}</p>
          {v.isLive ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-400">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              {t("liveBadge")}
            </span>
          ) : null}
          {v.isLive && v.checks24h > 0 ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-0.5 text-[11px] font-bold text-sky-300"
              title={t("tickLead") + numFmt.format(v.checks24h)}
            >
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />
              {t("tickLead")}{numFmt.format(v.checks24h)}
            </span>
          ) : null}
          {s.panel.missing > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 text-[11px] font-bold text-amber-400">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              {t("runNewBadge")}
            </span>
          ) : null}
        </div>
        <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight sm:text-4xl">
          {t("h1a")}{" "}
          <span className="bg-gradient-to-r from-sky-400 via-emerald-400 to-emerald-300 bg-clip-text text-transparent">
            {numFmt.format(v.heroCount)}
          </span>{" "}
          {t("h1b")}
        </h1>
        {v.deadCount > 0 || v.queuedCount > 0 ? (
          <p className="mt-2 max-w-2xl text-sm font-medium text-slate-400">
            {t("heroBreakdown")
              .replace("{live}", numFmt.format(v.liveHosts))
              .replace("{dead}", numFmt.format(v.deadCount))
              .replace("{queued}", numFmt.format(v.queuedCount))}
          </p>
        ) : null}
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
          {v.isLive ? (
            <>
              {t("introLiveA")}
              <Link href="/registry" className="text-sky-400 hover:underline">{t("regWord")}</Link>
              {t("introLiveB")}
            </>
          ) : (
            <>
              {t("introStaticA")}
              <Link href="/registry" className="text-sky-400 hover:underline">{t("regWord")}</Link>
              {t("introStaticB")}
            </>
          )}
        </p>
        {s.panel.missing > 0 ? (
          <p className="mt-2 max-w-2xl text-sm font-medium text-amber-300/90">
            {t("runNewNote")
              .replace("{done}", numFmt.format(v.heroCount))
              .replace("{total}", numFmt.format(s.panel.total))
              .replace("{dead}", numFmt.format(v.deadCount))}
          </p>
        ) : null}

        {useLive && live && live.topFails.length > 0 ? (
          <div className="mt-8 rounded-2xl border border-[#F87171]/30 bg-[#1a0f14] p-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#F87171]">{t("threatEyebrow")}</p>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="font-display text-4xl font-extrabold text-[#F87171]">
                {live.topFails[0].failPct + live.topFails[0].warnPct}%
              </span>
              <span className="font-display text-lg font-extrabold text-slate-100">
                {lang === "en"
                  ? FAIL_TITLES_EN[live.topFails[0].id] ?? live.topFails[0].title
                  : live.topFails[0].title}
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              {t("threatNote")}
              <Link href="/fixes" className="font-bold text-sky-400 hover:underline">
                {t("threatCta")}
              </Link>
            </p>
          </div>
        ) : null}

        {!hasStatic && !v.isLive ? (
          <div className="mt-10 rounded-2xl appseal-glass-card p-8 text-center text-sm text-slate-400">
            {t("pending")}
          </div>
        ) : (
          <>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { v: numFmt.format(v.liveHosts), l: t("stat1"), c: "text-emerald-400" },
                { v: numFmt.format(v.deadCount), l: t("stat2"), c: "text-[#F87171]" },
                { v: `${v.avg}`, l: t("stat3"), sub: `${t("statMedian")}: ${v.median}`, c: "text-slate-100" },
                { v: `${v.gradeACount}`, l: t("stat4"), c: "text-[#C084FC]" },
              ].map((c) => (
                <div key={c.l} className="appseal-glass-card rounded-2xl p-5">
                  <div className={`font-display text-3xl font-extrabold ${c.c}`}>{c.v}</div>
                  <div className="mt-1 text-xs leading-snug text-slate-500">{c.l}</div>
                  {"sub" in c && c.sub ? <div className="mt-0.5 text-[11px] text-slate-600">{c.sub}</div> : null}
                </div>
              ))}
            </div>

            {facts.length > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {facts.map((f) => (
                  <div key={f.text} className="appseal-glass-card rounded-2xl p-4">
                    <div className="font-display text-2xl font-extrabold text-sky-400">{f.big}</div>
                    <div className="mt-1 text-xs leading-snug text-slate-500">{f.text}</div>
                  </div>
                ))}
              </div>
            ) : null}

            <section className="mt-10">
              <h2 className="font-display text-xl font-extrabold">{t("distTitle")}</h2>
              <div className="mt-4 space-y-2.5">
                {v.gradeRows.map((r) => (
                  <div key={r.grade} className="flex items-center gap-3">
                    <span className="w-8 font-display text-sm font-extrabold text-slate-300">{r.grade}</span>
                    <div className="appseal-track h-6 flex-1 overflow-hidden rounded-md">
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
                {t("scaleNote")}
              </p>
            </section>

            {v.isLive && live ? (
              <section className="mt-10">
                <h2 className="font-display text-xl font-extrabold">{t("histTitle")}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {t("histNote")}
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
              <h2 className="font-display text-xl font-extrabold">{t("gapsTitle")}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {t("gapsNote")}
              </p>
              <ul className="mt-4 space-y-2.5">
                {(() => {
                  // bar widths scale to the widest row: a 3% share of scans is
                  // still a readable bar, the % labels stay absolute
                  const maxMiss = Math.max(...v.topFails.map((f) => f.failPct + f.warnPct), 1);
                  return v.topFails.map((f) => {
                    const miss = f.failPct + f.warnPct;
                    return (
                      <li key={f.id} className="flex items-center gap-3">
                        <span
                          className="w-56 shrink-0 truncate text-sm text-slate-300 sm:w-72"
                          title={lang === "en" ? FAIL_TITLES_EN[f.id] ?? f.title : f.title}
                        >
                          {lang === "en" ? FAIL_TITLES_EN[f.id] ?? f.title : f.title}
                        </span>
                        <div className="flex h-5 flex-1 gap-px">
                          {miss > 0 ? (
                            <>
                              <div className="rounded-l-md bg-[#F87171]" style={{ width: `${barShare(f.failPct, maxMiss)}%` }} />
                              <div className={`bg-[#FB923C] ${f.failPct ? "" : "rounded-l-md"} ${f.warnPct ? "rounded-r-md" : ""}`} style={{ width: `${barShare(f.warnPct, maxMiss)}%` }} />
                            </>
                          ) : null}
                        </div>
                        <span className="w-12 text-right font-mono text-xs font-bold text-[#FB923C]">{miss}%</span>
                      </li>
                    );
                  });
                })()}
              </ul>
            </section>

            {v.isLive && live && live.catRows.length > 0 ? (
              <section className="mt-10">
                <h2 className="font-display text-xl font-extrabold">{t("catTitle")}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {t("catNote")}
                </p>
                <ul className="mt-4 space-y-3">
                  {(() => {
                    const maxCat = Math.max(
                      ...live.catRows.map((c) => Math.round((c.fail * 100) / live.scans) + Math.round((c.warn * 100) / live.scans)),
                      1,
                    );
                    return live.catRows.map((c) => {
                      const failPct = Math.round((c.fail * 100) / live.scans);
                      const warnPct = Math.round((c.warn * 100) / live.scans);
                      const lossAvg = formatPenaltyAvg(c.loss / Math.max(1, live.scans), lang);
                      return (
                        <li key={c.cat} className="flex items-center gap-3">
                          <span className="w-56 shrink-0 truncate text-sm text-slate-300 sm:w-72">
                            {CATEGORY_LABELS[c.cat]?.[lang] ?? c.cat}
                          </span>
                          <div className="flex h-5 flex-1 gap-px">
                            {failPct + warnPct > 0 ? (
                              <>
                                <div className={`rounded-l-md bg-[#F87171] ${warnPct ? "" : "rounded-r-md"}`} style={{ width: `${barShare(failPct, maxCat)}%` }} />
                                <div className={`bg-[#FB923C] ${warnPct ? "rounded-r-md" : ""}`} style={{ width: `${barShare(warnPct, maxCat)}%` }} />
                              </>
                            ) : null}
                          </div>
                          <span
                            className="w-24 text-right font-mono text-xs text-slate-500"
                            title={t("catLossTitle")}
                          >
                            {lossAvg} {t("catPts")}
                          </span>
                        </li>
                      );
                    });
                  })()}
                </ul>
              </section>
            ) : null}

            <section className="mt-10">
              <h2 className="font-display text-xl font-extrabold">{t("battleTitle")}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {t("battleNoteA")}
                <Link href="/registry" className="text-sky-400 hover:underline">{t("regWord")}</Link>
                {t("battleNoteB")}
              </p>
              <div className="mt-4 overflow-hidden rounded-2xl appseal-glass-card">
                <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <span className="flex-1">{t("thPlatform")}</span>
                  <span className="w-20 text-right">{t("thDomains")}</span>
                  <span className="w-24 text-right">{t("thAvg")}</span>
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
                          title={`${t("registryOnlyA")}${PLATFORM_LABELS[row.key][lang]}${t("registryOnlyB")}`}
                          className="transition hover:text-sky-400"
                        >
                          {PLATFORM_LABELS[row.key][lang]}
                        </Link>
                      </span>
                      {row.grades ? <span className="text-[11px] text-slate-500">{row.grades}</span> : null}
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

            {/* weekly leaderboard + benchmark: straight from the live registry,
                both blocks skipped while the registry has nothing to show */}
            {topWeek.length > 0 || registryHosts.length > 0 ? (
              <section className="mt-10">
                {topWeek.length > 0 ? (
                  <>
                    <h2 className="font-display text-xl font-extrabold">{t("weekTopTitle")}</h2>
                    <p className="mt-1 text-sm text-slate-500">{t("weekTopNote")}</p>
                    <div className="mt-4 overflow-hidden rounded-2xl appseal-glass-card">
                      <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <span className="w-10 shrink-0">{t("thPlace")}</span>
                        <span className="flex-1">{t("thHost")}</span>
                        <span className="w-24 text-right">{t("thGrade")}</span>
                      </div>
                      {topWeek.map((e, i) => (
                        <div
                          key={`${e.host}-${e.id}`}
                          className={`flex items-center gap-3 px-5 py-3 ${i < topWeek.length - 1 ? "border-b border-slate-800/60" : ""}`}
                        >
                          <span
                            className={`w-10 shrink-0 font-mono text-xs ${i === 0 ? "text-amber-400" : "text-slate-600"}`}
                          >
                            {i + 1}.
                          </span>
                          <Link
                            href={`/verified/${e.host}`}
                            className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-slate-200 transition hover:text-sky-400"
                          >
                            {e.host}
                          </Link>
                          <span className="w-24 shrink-0 text-right">
                            <span
                              className={`inline-flex h-7 min-w-8 items-center justify-center rounded-md border px-2 font-display text-sm font-extrabold ${
                                GRADE_CHIP[e.grade] ?? "bg-slate-800 text-slate-300 border-slate-700"
                              }`}
                            >
                              {e.grade}
                            </span>
                            <span className="ml-2.5 font-mono text-xs text-slate-400">{e.score}/100</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
                {registryHosts.length > 0 ? (
                  <>
                    <h2 className={`font-display text-xl font-extrabold ${topWeek.length > 0 ? "mt-10" : ""}`}>
                      {t("benchTitle")}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">{t("benchNote")}</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl appseal-glass-card p-5">
                        <div className="font-display text-3xl font-extrabold text-slate-100">{benchAvg}/100</div>
                        <div className="mt-1 text-xs leading-snug text-slate-500">{t("benchAvgLabel")}</div>
                      </div>
                      <div className="rounded-2xl appseal-glass-card p-5">
                        <div className="font-display text-3xl font-extrabold text-sky-400">{benchAA}%</div>
                        <div className="mt-1 text-xs leading-snug text-slate-500">{t("benchAAShare")}</div>
                      </div>
                    </div>
                  </>
                ) : null}
              </section>
            ) : null}

            {v.isLive ? (
              <section className="mt-10">
                <h2 className="font-display text-xl font-extrabold">{t("dynTitle")}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {t("dynNote")}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {[
                    { v: dynamics.improved, l: t("dynUp"), c: "text-emerald-400", s: "↑" },
                    { v: dynamics.stable, l: t("dynSame"), c: "text-slate-300", s: "→" },
                    { v: dynamics.dropped, l: t("dynDown"), c: "text-amber-400", s: "↓" },
                  ].map((d) => (
                    <div key={d.l} className="rounded-2xl appseal-glass-card p-5">
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
              <PulseChart hours={live.hours} days={live.days} days30={live.days30} total={v.doneCount} lang={lang} />
            ) : null}

            {v.isLive ? (
              <section className="mt-10">
                <h2 className="font-display text-xl font-extrabold">{t("tldTitle")}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {t("tldNote")}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  {tlds.map((tl) => (
                    <div key={tl.tld} className="rounded-2xl appseal-glass-card p-4">
                      <div className="font-mono text-sm font-bold text-sky-400">.{tl.tld}</div>
                      <div className="mt-1.5 font-display text-xl font-extrabold text-slate-100">{tl.count}</div>
                      <div className="text-xs text-slate-500">{t("tldAvg")}{tl.avg}</div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="mt-10">
              <h2 className="font-display text-xl font-extrabold">{t("srcTitle")}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {t("srcNote")}{dateFmt.format(new Date(s.generatedAt))}.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {sources.map((src) => (
                  <div key={src.key} className="rounded-2xl appseal-glass-card p-5">
                    <div className="text-sm font-bold text-slate-200">{src.label}</div>
                    <div className="mt-2 font-display text-2xl font-extrabold text-slate-100">
                      {numFmt.format(src.count)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {typeof src.avg === "number" ? `${t("srcAvg")}${src.avg}` : t("srcNoAvg")}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <p className="mt-10 text-xs leading-relaxed text-slate-600">
              {v.isLive ? (
                <>
                  {t("footLiveA")}{dateFmt.format(new Date(s.generatedAt))}{t("footScanner")}
                  <Link href="/bot" className="underline hover:text-slate-400">/bot</Link>
                  {t("footOptout")}
                </>
              ) : (
                <>
                  {t("srcNote")}{dateFmt.format(new Date(s.generatedAt))}{t("footScanner")}
                  <Link href="/bot" className="underline hover:text-slate-400">/bot</Link>
                  {t("footOptout")}
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
            <Link href="/digest" className="transition hover:text-slate-400">{t("footDigest")}</Link>
            <Link href="/fixes" className="transition hover:text-slate-400">{t("footFixes")}</Link>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-400" /> {t("footAgg")}
            </span>
          </span>
        </div>
      </footer>
    </div>
  );
}
