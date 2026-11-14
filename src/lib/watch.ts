/**
 * Launch Pass watchlist: paid hosts get a background rescan every 6 hours
 * and a Telegram alert when their standing degrades. Pure helpers live here
 * so they are unit-testable without Redis; /api/monitor-tick wires them up.
 */

export const WATCH_KEY = "lpass:watch";
export const LAST_KEY_PREFIX = "lpass:last:";
/** per-host rescan floor: a paid domain is re-scanned at most this often */
export const RESCAN_AFTER_S = 6 * 3600;

export interface WatchSnapshot {
  grade: string;
  score: number;
  fails: number;
}

const GRADE_WORSENESS: Record<string, number> = {
  "A+": 0,
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
};

export function gradeIndex(grade: string): number {
  return GRADE_WORSENESS[grade] ?? 5;
}

/** Why the new snapshot is worse than the previous one (null = stable/better).
 *  The very first scan is a baseline - nothing to compare against yet. */
export function detectDegradation(prev: WatchSnapshot | null, cur: WatchSnapshot): string | null {
  if (!prev) return null;
  if (gradeIndex(cur.grade) > gradeIndex(prev.grade)) return "grade-drop";
  if (prev.score - cur.score >= 10) return "score-drop";
  if (cur.fails - prev.fails >= 3) return "fails-spike";
  return null;
}

export function formatAlert(host: string, prev: WatchSnapshot, cur: WatchSnapshot): string {
  const reasons: string[] = [];
  if (gradeIndex(cur.grade) > gradeIndex(prev.grade)) reasons.push(`класс ${prev.grade} → ${cur.grade}`);
  if (prev.score - cur.score >= 10) reasons.push(`балл ${prev.score} → ${cur.score}`);
  if (cur.fails - prev.fails >= 3) reasons.push(`провалов ${prev.fails} → ${cur.fails}`);
  return `🔻 AppSeal: ${host}\n${reasons.join(", ")}`;
}
