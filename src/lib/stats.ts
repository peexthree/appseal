/**
 * Pure aggregation for the live /stats page. All IO (Redis reads, pipeline
 * shapes) lives in the page and the store - this file is arithmetic only, so
 * it is unit-testable without a Redis connection.
 */

import { platformOf } from "./registry.ts";

export interface TopFail {
  id: string;
  title: string;
  failPct: number;
  warnPct: number;
}

/** ZRANGE WITHSCORES answers a flat [member, score, member, score, ...]. */
export function pairsFromFlat(flat: unknown): Map<string, number> {
  const out = new Map<string, number>();
  if (!Array.isArray(flat)) return out;
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const count = Number(flat[i + 1]);
    if (Number.isFinite(count) && count > 0) out.set(String(flat[i]), count);
  }
  return out;
}

/** HGETALL answers a flat [field, value, field, value, ...] as well. */
export function mapFromFlat(flat: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (!Array.isArray(flat)) return out;
  for (let i = 0; i + 1 < flat.length; i += 2) {
    out.set(String(flat[i]), String(flat[i + 1]));
  }
  return out;
}

/** HGETALL of numeric counters (grades): values arrive as strings. */
export function countsFromFlat(flat: unknown): Map<string, number> {
  const out = new Map<string, number>();
  if (!Array.isArray(flat)) return out;
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const n = Number(flat[i + 1]);
    if (Number.isFinite(n) && n > 0) out.set(String(flat[i]), n);
  }
  return out;
}

/**
 * Avg and median over the score histogram: ZINCRBY appmot:stats:scores
 * stores one member per distinct score. Median walks the sorted unique
 * scores with a cumulative counter - no giant array materialized.
 */
export function avgMedianFromHistogram(flat: unknown): { avg: number; median: number } {
  const pairs = pairsFromFlat(flat);
  const scores = [...pairs.entries()]
    .map(([s, c]) => ({ score: Number(s), count: c }))
    .sort((a, b) => a.score - b.score);
  let sum = 0;
  let n = 0;
  for (const { score, count } of scores) {
    sum += score * count;
    n += count;
  }
  if (n === 0) return { avg: 0, median: 0 };
  const medianPos = (n - 1) / 2;
  let acc = 0;
  let median = 0;
  for (let i = 0; i < scores.length; i++) {
    const { score, count } = scores[i];
    if (acc + count > medianPos) {
      if (n % 2 === 1 || acc + count > medianPos + 1) {
        median = score;
      } else {
        // even total, middle spans two buckets: average the two middle values
        median = (score + (scores[i + 1]?.score ?? score)) / 2;
      }
      break;
    }
    acc += count;
  }
  return { avg: Math.round(sum / n), median };
}

/**
 * Top missed checks, ranked by fail+warn share of all counted scans.
 * Titles come from the engine's own localized strings (already phrased for
 * the failing status, e.g. "Заголовок CSP не установлен"), so the polarity
 * fix from the audit round holds on live data too.
 */
export function buildTopFails(
  fails: Map<string, number>,
  warns: Map<string, number>,
  titles: Map<string, string>,
  scans: number,
  limit = 10,
): TopFail[] {
  const ids = new Set([...fails.keys(), ...warns.keys()]);
  const rows: { row: TopFail; miss: number }[] = [];
  for (const id of ids) {
    const f = fails.get(id) ?? 0;
    const w = warns.get(id) ?? 0;
    const pct = scans > 0 ? 100 / scans : 0;
    rows.push({
      row: {
        id,
        title: titleFor(titles, id),
        failPct: Math.round(f * pct),
        warnPct: Math.round(w * pct),
      },
      miss: f + w,
    });
  }
  rows.sort((a, b) => b.miss - a.miss);
  return rows.slice(0, limit).map((r) => r.row);
}

/** Title snapshot entries are JSON {ru,en}; a raw string falls back as-is. */
function titleFor(titles: Map<string, string>, id: string): string {
  const raw = titles.get(id);
  if (!raw) return id;
  try {
    const parsed = JSON.parse(raw) as { ru?: string; en?: string };
    return parsed.ru ?? parsed.en ?? id;
  } catch {
    return raw;
  }
}

/** Grade distribution in the fixed display order A+..E. */
export const GRADE_ORDER = ["A+", "A", "B", "C", "D", "E"] as const;

export function gradeRowsFromCounts(
  counts: Map<string, number>,
): { grade: string; count: number }[] {
  return GRADE_ORDER.map((g) => ({ grade: g, count: counts.get(g) ?? 0 })).filter(
    (r) => r.count > 0,
  );
}

/** A+ = 0 ... E = 5; unknown grades sink below E. */
export function gradeIndex(grade: string): number {
  const i = (GRADE_ORDER as readonly string[]).indexOf(grade);
  return i === -1 ? GRADE_ORDER.length : i;
}

/** Score 0-100 folded into ten decade buckets, last one includes 100. */
export function bucketHistogram(
  flat: unknown,
  width = 10,
): { from: number; to: number; count: number }[] {
  const pairs = pairsFromFlat(flat);
  const n = Math.ceil(101 / width); // 0..100 -> 11 buckets of 10
  const buckets = Array.from({ length: n }, (_, i) => ({
    from: i * width,
    to: Math.min(100, i * width + width - 1),
    count: 0,
  }));
  for (const [score, count] of pairs) {
    const s = Number(score);
    if (!Number.isFinite(s) || s < 0 || s > 100) continue;
    const idx = Math.min(n - 1, Math.floor(s / width));
    buckets[idx].count += count;
  }
  return buckets;
}

/** Redis keys for the last n UTC-hour activity buckets, oldest first. */
export function statsHourKeys(prefix: string, now: Date, n = 24): string[] {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 3600 * 1000);
    const p = (v: number) => String(v).padStart(2, "0");
    keys.push(
      prefix +
        d.getUTCFullYear() +
        p(d.getUTCMonth() + 1) +
        p(d.getUTCDate()) +
        p(d.getUTCHours()),
    );
  }
  return keys;
}

/** Redis keys for the last n UTC-day activity buckets, oldest first. */
export function statsDayKeys(prefix: string, now: Date, n = 7): string[] {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 3600 * 1000);
    const p = (v: number) => String(v).padStart(2, "0");
    keys.push(prefix + d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()));
  }
  return keys;
}

/** Public suffix-ish label: the last dot segment of the host. */
export function tldOf(host: string): string {
  const i = host.lastIndexOf(".");
  return i === -1 ? host : host.slice(i + 1).toLowerCase();
}

export function tldRows(
  entries: { host: string; score: number }[],
): { tld: string; count: number; avg: number }[] {
  const m = new Map<string, { count: number; total: number }>();
  for (const e of entries) {
    const tld = tldOf(e.host);
    const b = m.get(tld) ?? { count: 0, total: 0 };
    b.count += 1;
    b.total += e.score;
    m.set(tld, b);
  }
  return [...m.entries()]
    .map(([tld, b]) => ({ tld, count: b.count, avg: Math.round(b.total / b.count) }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Class movement across repeated scans of the same host (the registry keeps
 * every scan): did hosts improve, drop or stay put between their oldest and
 * newest retained scan. Entries arrive newest-first (registry LRANGE order).
 */
export function gradeDynamics(
  entries: { host: string; grade: string; ts?: number }[],
): {
  improved: number;
  dropped: number;
  stable: number;
} {
  const byHost = new Map<string, { newest: string; oldest: string; count: number }>();
  for (const e of entries) {
    const host = e.host.toLowerCase().replace(/^www\./, "");
    const cur = byHost.get(host);
    if (!cur) {
      byHost.set(host, { newest: e.grade, oldest: e.grade, count: 1 });
    } else {
      cur.count += 1;
      cur.oldest = e.grade; // later items in a newest-first list are older
    }
  }
  let improved = 0;
  let dropped = 0;
  let stable = 0;
  for (const h of byHost.values()) {
    if (h.count < 2) continue;
    const d = gradeIndex(h.oldest) - gradeIndex(h.newest);
    if (d > 0) improved += 1;
    else if (d < 0) dropped += 1;
    else stable += 1;
  }
  return { improved, dropped, stable };
}

/** Grade mix inside each hosting platform (leaderboard companion). */
export function platformGradeCounts(
  entries: { host: string; grade: string }[],
): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const e of entries) {
    const p = platformOf(e.host);
    const g = out.get(p) ?? new Map<string, number>();
    g.set(e.grade, (g.get(e.grade) ?? 0) + 1);
    out.set(p, g);
  }
  return out;
}
