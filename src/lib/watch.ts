/**
 * Launch Pass watchlist: paid hosts get a background rescan every 6 hours
 * and a Telegram alert when their standing degrades. Pure helpers live here
 * so they are unit-testable without Redis; /api/monitor-tick wires them up.
 */

export const WATCH_KEY = "lpass:watch";
export const LAST_KEY_PREFIX = "lpass:last:";
/** per-host rescan floor: a paid domain is re-scanned at most this often */
export const RESCAN_AFTER_S = 6 * 3600;

/* Free watch via the Telegram bot: up to FREE_PER_CHAT_MAX domains per chat
 * (tg:watch:{chatId} holds a JSON {"hosts":[...]}, legacy bare string = one
 * host), rescanned once a day (a fraction of the paid 6h cadence) and
 * rotating through the same monitor tick - one free host per tick keeps the
 * CPU cost bounded. */
export const FREE_WATCH_ZSET = "appmot:tg:watch";
export const FREE_WATCH_KEY_PREFIX = "tg:watch:";
export const FREE_WATCH_MAX = 100;
export const FREE_PER_CHAT_MAX = 3;
export const FREE_RESCAN_AFTER_S = 24 * 3600;

/** The stored watch value -> the chat's host list. Backwards compatible by
 *  design: a legacy bare string is a one-element list, a JSON object with a
 *  "hosts" array (or a bare JSON array) is the new format, anything else is
 *  garbage -> no hosts. Deduped and capped at FREE_PER_CHAT_MAX. */
export function parseWatchHosts(raw: string): string[] {
  const text = (raw ?? "").trim();
  if (!text) return [];
  let parsed: unknown = text;
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      parsed = JSON.parse(text);
    } catch {
      return []; // broken JSON - never guess a host from it
    }
  }
  let list: unknown[];
  if (Array.isArray(parsed)) list = parsed;
  else if (parsed && typeof parsed === "object" && Array.isArray((parsed as { hosts?: unknown }).hosts))
    list = (parsed as { hosts: unknown[] }).hosts;
  else if (typeof parsed === "string") list = [parsed];
  else return [];
  return [...new Set(list.filter((h): h is string => typeof h === "string" && h.trim().length > 0).map((h) => h.trim()))].slice(
    0,
    FREE_PER_CHAT_MAX,
  );
}

export interface WatchSnapshot {
  grade: string;
  score: number;
  fails: number;
  /** ids of the checks that FAILED in this snapshot; optional - snapshots
   *  written before the diff feature carry no ids, and an undefined list
   *  means "no diff data" for the alert helpers below. */
  ids?: string[];
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

/** Which checks the current scan added to / removed from the previous fail
 *  list. prevIds undefined = no baseline data -> both lists empty (the very
 *  first snapshot never invents a diff). */
export function diffFailIds(
  prevIds: string[] | undefined,
  curFailIds: string[],
): { newFails: string[]; fixed: string[] } {
  if (!prevIds) return { newFails: [], fixed: [] };
  const prev = new Set(prevIds);
  const cur = new Set(curFailIds);
  return {
    newFails: curFailIds.filter((id) => !prev.has(id)),
    fixed: prevIds.filter((id) => !cur.has(id)),
  };
}

/** Check ids that did not exist at the previous scan (engine growth).
 *  prevIds undefined = no baseline -> nothing is "new". */
export function newCheckIds(prevIds: string[] | undefined, curAllIds: string[]): string[] {
  if (!prevIds) return [];
  const prev = new Set(prevIds);
  return curAllIds.filter((id) => !prev.has(id));
}

/** Minimal shape of a scan CheckResult the alert text needs (watch.ts stays
 *  dependency-free, so the scanner type is mirrored structurally). */
export interface AlertCheckResult {
  id: string;
  title?: { ru?: string; en?: string };
}

/** Human names for check ids taken from the current results; an id the
 *  engine no longer reports degrades to the raw id. At most `max` names -
 *  a longer list collapses into "и ещё N" (RU) / "and N more" (EN). */
export function checkIdNames(
  ids: string[],
  results: AlertCheckResult[] | undefined,
  lang: "ru" | "en" = "ru",
  max = 3,
): string {
  const byId = new Map((results ?? []).map((r) => [r.id, r]));
  const names = ids.map((id) => {
    const t = byId.get(id)?.title;
    return (lang === "en" ? t?.en : undefined) || t?.ru || t?.en || id;
  });
  const limit = Math.max(0, max);
  const head = names.slice(0, limit).join(", ");
  const rest = names.length - Math.min(names.length, limit);
  return rest > 0 ? `${head} ${lang === "en" ? `and ${rest} more` : `и ещё ${rest}`}` : head;
}

/** Degradation alert with the concrete diff appended: what exactly broke and
 *  what got fixed. The diff lines appear only when the previous snapshot
 *  carried ids - older snapshots (or a first baseline) keep the plain
 *  formatAlert text. Signature is a strict superset of formatAlert's. */
export function formatAlertRich(
  host: string,
  prev: WatchSnapshot,
  cur: WatchSnapshot,
  curResults?: AlertCheckResult[],
  lang: "ru" | "en" = "ru",
): string {
  let text = formatAlert(host, prev, cur);
  if (!prev.ids) return text;
  const { newFails, fixed } = diffFailIds(prev.ids, cur.ids ?? []);
  if (newFails.length > 0) {
    text += `\n${lang === "en" ? "New failures" : "Новые провалы"}: ${checkIdNames(newFails, curResults, lang)}`;
  }
  if (fixed.length > 0) {
    text += `\n${lang === "en" ? "Fixed" : "Исправлено"}: ${checkIdNames(fixed, curResults, lang)}`;
  }
  return text;
}

/** Engine-growth notice, sent once per engine update (the snapshot stored
 *  after the rescan already contains the new ids, so it cannot re-fire):
 *  N checks are new since the previous scan, the host passed M of them. */
export function formatNewChecks(n: number, passed: number): string {
  return `🆕 В движке ${n} новых проверок - ваш сайт прошёл ${passed} из ${n}`;
}

/** Good news matters too: watched followers hear about class jumps. */
export function formatImprovement(host: string, prev: WatchSnapshot, cur: WatchSnapshot): string {
  return `✅ AppSeal: ${host}\nкласс ${prev.grade} → ${cur.grade} (${prev.score} → ${cur.score}). Так держать!`;
}
