/**
 * Pure aggregation for the live /stats page. All IO (Redis reads, pipeline
 * shapes) lives in the page and the store - this file is arithmetic only, so
 * it is unit-testable without a Redis connection.
 */

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
