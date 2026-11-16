/**
 * Weekly digest: who improved their grade this week, who joined the A-club.
 * Pure builders - shared by the /digest page and the weekly Telegram post
 * (/api/digest-tick, GHA cron). Registry entries arrive newest-first, but
 * the builder sorts by ts itself, so input order does not matter.
 */

import { canonicalHost, isDofollow, type RegistryEntry } from "./registry.ts";
import { gradeIndex } from "./stats.ts";

export interface DigestImprover {
  host: string;
  from: string;
  to: string;
  score: number;
  ts: number;
}

export interface DigestNewcomer {
  host: string;
  grade: string;
  score: number;
  ts: number;
}

export interface DigestData {
  weekScans: number;
  improvers: DigestImprover[];
  /** improvers whose latest grade earns a public name (A/A+) */
  namedImprovers: DigestImprover[];
  anonymousImproved: number;
  /** hosts that entered the registry this week straight at class A/A+ */
  newA: DigestNewcomer[];
}

const WEEK_MS = 7 * 24 * 3600 * 1000;
const TOP_N = 5;

export function buildDigest(
  entries: RegistryEntry[],
  now: number = Date.now(),
): DigestData {
  const cutoff = now - WEEK_MS;
  const week = entries.filter((e) => e.ts >= cutoff);
  const weekScans = week.length;

  const byHost = new Map<string, RegistryEntry[]>();
  for (const e of week) {
    const host = canonicalHost(e.host);
    const list = byHost.get(host) ?? [];
    list.push(e);
    byHost.set(host, list);
  }

  const improvers: DigestImprover[] = [];
  let anonymousImproved = 0;
  for (const [host, list] of byHost) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.ts - b.ts);
    const oldest = list[0];
    const newest = list[list.length - 1];
    if (gradeIndex(newest.grade) >= gradeIndex(oldest.grade)) continue;
    improvers.push({ host, from: oldest.grade, to: newest.grade, score: newest.score, ts: newest.ts });
    if (!isDofollow(newest)) anonymousImproved += 1;
  }
  improvers.sort(
    (a, b) =>
      gradeIndex(b.from) - gradeIndex(b.to) - (gradeIndex(a.from) - gradeIndex(a.to)) ||
      b.score - a.score,
  );

  // first-ever appearance this week straight at A/A+ - the A-club newcomers
  const firstSeen = new Map<string, number>();
  const latest = new Map<string, RegistryEntry>();
  for (const e of entries) {
    const host = canonicalHost(e.host);
    const prevTs = firstSeen.get(host);
    if (prevTs === undefined || e.ts < prevTs) firstSeen.set(host, e.ts);
    const cur = latest.get(host);
    if (!cur || e.ts > cur.ts) latest.set(host, e);
  }
  const newA: DigestNewcomer[] = [];
  for (const [host, e] of latest) {
    if (!isDofollow(e)) continue;
    const ts = firstSeen.get(host) ?? 0;
    if (ts >= cutoff) {
      newA.push({ host, grade: e.grade, score: e.score, ts: e.ts });
    }
  }
  newA.sort((a, b) => b.score - a.score);

  return {
    weekScans,
    improvers,
    namedImprovers: improvers.filter((i) => i.to === "A+" || i.to === "A").slice(0, TOP_N),
    anonymousImproved,
    newA: newA.slice(0, TOP_N),
  };
}

/** Telegram-ready post text (RU - the channel language). */
export function buildDigestText(data: DigestData, now: number = Date.now()): string {
  const fmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
  const from = fmt.format(new Date(now - WEEK_MS));
  const to = fmt.format(new Date(now));
  const lines: string[] = [`🗓 AppSeal: неделя ${from} - ${to}`, `Проверок за неделю: ${data.weekScans}`];
  if (data.namedImprovers.length > 0) {
    lines.push("", "🟢 Подняли класс:");
    data.namedImprovers.forEach((i, idx) => {
      lines.push(`${idx + 1}. ${i.host}: ${i.from} → ${i.to} (${i.score}/100)`);
    });
  }
  if (data.anonymousImproved > 0) {
    lines.push(
      `+ ещё ${data.anonymousImproved} проект(ов) улучшили класс - имена откроются вместе с классом A`,
    );
  }
  if (data.newA.length > 0) {
    lines.push("", "🆕 Вошли в клуб A/A+ с первого скана:");
    data.newA.forEach((n) => {
      lines.push(`• ${n.host} (${n.grade} · ${n.score}/100)`);
    });
  }
  if (lines.length === 2) {
    lines.push("", "Тишина - ни улучшений, ни новичков. Проверь свой проект: https://appseal.online");
  } else {
    lines.push("", "Проверь свой проект: https://appseal.online");
  }
  return lines.join("\n");
}
