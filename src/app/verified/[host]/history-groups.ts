import type { Lang } from "@/lib/scanner/types";

/**
 * Pure grouping/formatting logic for the /verified/[host] scan history.
 * Kept dependency-free and client-safe so the profile renders a stable
 * "dynamics" line (runs collapsed into dated groups) instead of a bouncing
 * feed of look-alike scans; tests/agent-trust.test.ts imports it directly.
 */

export interface HistEntry {
  id: string;
  ts: number;
  grade: string;
  score: number;
}

export interface HistGroup {
  grade: string;
  score: number;
  from: number;
  to: number;
  count: number;
  firstId: string;
  lastId: string;
}

// UTC on both sides: the calendar day never depends on the visitor's timezone,
// so SSR markup and client hydration always agree
export const dateFmt: Record<Lang, Intl.DateTimeFormat> = {
  ru: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
};

// short "13 нояб." / "Nov 13" for collapsed scan-run ranges
const shortFmt: Record<Lang, Intl.DateTimeFormat> = {
  ru: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "UTC" }),
};

const DAY_MS = 86400000;

// collapse runs of consecutive scans with the same grade and score into one
// group (from..to, count): a stable dynamics line instead of a bouncing feed
export function buildHistGroups(history: HistEntry[]): HistGroup[] {
  const groups: HistGroup[] = [];
  for (const e of history) {
    const last = groups[groups.length - 1];
    if (last && last.grade === e.grade && last.score === e.score) {
      last.to = e.ts;
      last.lastId = e.id;
      last.count += 1;
    } else {
      groups.push({ grade: e.grade, score: e.score, from: e.ts, to: e.ts, count: 1, firstId: e.id, lastId: e.id });
    }
  }
  return groups;
}

// cap the rendered groups at 15 keeping the origin, the current state and, in
// newest-first order, every boundary where the grade actually changed - the
// meaningful class swings stay visible even for very long histories
export function pickHistGroups(groups: HistGroup[], max: number): HistGroup[] {
  const cap = max > 0 ? max : 15;
  if (groups.length <= cap) return groups;
  const keep = new Set<number>([0, groups.length - 1]);
  for (let i = groups.length - 1; i > 0 && keep.size < cap; i--) {
    if (groups[i].grade !== groups[i - 1].grade) keep.add(i);
  }
  for (let i = groups.length - 1; i >= 0 && keep.size < cap; i--) keep.add(i);
  return [...keep].sort((a, b) => a - b).map((i) => groups[i]);
}

// "1 проверка / 2 проверки / 5 проверок" (ru), "1 scan / 5 scans" (en)
export function scansLabel(n: number, lang: Lang): string {
  if (lang === "en") return `${n} ${n === 1 ? "scan" : "scans"}`;
  const m10 = n % 10;
  const m100 = n % 100;
  const form =
    m10 === 1 && m100 !== 11
      ? "проверка"
      : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)
        ? "проверки"
        : "проверок";
  return `${n} ${form}`;
}

// "13-14 нояб." (ru) / "Nov 13-14" (en); cross-month and cross-year ranges
// keep both ends readable; the year is appended only for older runs
export function histRangeLabel(g: Pick<HistGroup, "from" | "to">, lang: Lang, withYear: boolean): string {
  const a = new Date(g.from);
  const b = new Date(g.to);
  const yA = a.getUTCFullYear();
  const yB = b.getUTCFullYear();
  const sameDay = Math.floor(g.from / DAY_MS) === Math.floor(g.to / DAY_MS);
  const sameMonth = sameDay || (a.getUTCMonth() === b.getUTCMonth() && yA === yB);
  const monthOf = (ts: number) => shortFmt[lang].formatToParts(new Date(ts)).find((p) => p.type === "month")?.value ?? "";
  const dayOf = (ts: number) => new Date(ts).getUTCDate();
  const yearSuffix = withYear && yA === yB ? (lang === "ru" ? ` ${yA}` : `, ${yA}`) : "";
  if (sameDay) {
    return shortFmt[lang].format(a) + yearSuffix;
  }
  if (sameMonth) {
    const core =
      lang === "ru"
        ? `${dayOf(g.from)}-${dayOf(g.to)} ${monthOf(g.from)}`
        : `${monthOf(g.from)} ${dayOf(g.from)}-${dayOf(g.to)}`;
    return core + yearSuffix;
  }
  if (yA === yB) {
    return lang === "ru"
      ? `${dayOf(g.from)} ${monthOf(g.from)} - ${dayOf(g.to)} ${monthOf(g.to)}${yearSuffix}`
      : `${monthOf(g.from)} ${dayOf(g.from)} - ${monthOf(g.to)} ${dayOf(g.to)}${yearSuffix}`;
  }
  return lang === "ru"
    ? `${dayOf(g.from)} ${monthOf(g.from)} ${yA} - ${dayOf(g.to)} ${monthOf(g.to)} ${yB}`
    : `${monthOf(g.from)} ${dayOf(g.from)}, ${yA} - ${monthOf(g.to)} ${dayOf(g.to)}, ${yB}`;
}

// list-cell label: single scans keep the existing full date, collapsed runs
// get the compact range plus the scan count
export function histDateLabel(g: HistGroup, lang: Lang, withYear: boolean): string {
  if (g.count <= 1) return dateFmt[lang].format(new Date(g.from));
  const range = histRangeLabel(g, lang, withYear);
  const count = scansLabel(g.count, lang);
  return lang === "ru" ? `${range}, ${count}` : `${range} · ${count}`;
}
