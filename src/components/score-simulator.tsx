"use client";

import { useMemo, useState } from "react";
import { getTrophyPath, GRADE_META, TOTAL_CHECKS } from "@/lib/scanner/grade";
import type { Lang } from "@/lib/scanner/types";

/**
 * Pre-scan mini-simulator: honest checkbox estimate over the header subset
 * of the checklist (penalties mirror the engine's header rules). Score is a
 * rough estimate, not a scan - the caption says so explicitly. All headers
 * checked = A+ eligibility; a full AppSeal scan adds the remaining checks.
 */

interface SimItem {
  id: string;
  label: string;
  penalty: number;
}

const ITEMS: SimItem[] = [
  { id: "csp", label: "Content-Security-Policy", penalty: 8 },
  { id: "hsts", label: "Strict-Transport-Security", penalty: 3 },
  { id: "xfo", label: "X-Frame-Options", penalty: 3 },
  { id: "xcto", label: "X-Content-Type-Options", penalty: 3 },
  { id: "permissions", label: "Permissions-Policy", penalty: 3 },
  { id: "referrer", label: "Referrer-Policy", penalty: 2 },
  { id: "coop", label: "Cross-Origin-Opener-Policy", penalty: 2 },
];

const SIM_TEXT = {
  title: { ru: "Прикинь свой балл - ещё до скана", en: "Estimate your score - before the scan" },
  subtitle: {
    ru: "Отметь, что у твоего сайта уже есть - покажем приблизительный балл и главную дыру.",
    en: "Check what your site already has - we'll estimate the score and the biggest hole.",
  },
  altGrade: { ru: "Примерная оценка", en: "Estimated grade" },
  gradeLabel: { ru: "класс", en: "grade" },
  fixFirst: { ru: "Первым делом чини", en: "Fix first" },
  fixFirstTail: {
    ru: "- это самая дорогая дыра из незакрытых.",
    en: "- the most expensive hole still open.",
  },
  allSet: {
    ru: "Все заголовки на месте - полный скан проверит остальные",
    en: "All headers in place - a full scan checks the remaining",
  },
  allSetTail: { ru: "пунктов.", en: "checks." },
  estimateNote: {
    ru: "Это прикидка по заголовкам, не скан: настоящий техосмотр прогоняет 125 проверок.",
    en: "This is a header estimate, not a scan: the real inspection runs 125 checks.",
  },
  cta: { ru: "Проверить по-настоящему - бесплатно", en: "Scan it for real - free" },
} as const;

function estimateGrade(score: number, allChecked: boolean): { grade: string; color: string } {
  const meta = (g: string) => GRADE_META[g as keyof typeof GRADE_META] ?? GRADE_META.E;
  if (score >= 96 && allChecked) return { grade: "A+", color: meta("A+").color };
  if (score >= 85) return { grade: "A", color: meta("A").color };
  if (score >= 70) return { grade: "B", color: meta("B").color };
  if (score >= 50) return { grade: "C", color: meta("C").color };
  if (score >= 25) return { grade: "D", color: meta("D").color };
  return { grade: "E", color: meta("E").color };
}

export function ScoreSimulator({ lang }: { lang: Lang }) {
  // start honest: nothing assumed - most AI-built deploys ship no headers
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const score = useMemo(() => {
    const lost = ITEMS.reduce((s, i) => s + (checked[i.id] ? 0 : i.penalty), 0);
    return Math.max(0, 100 - lost);
  }, [checked]);
  const allChecked = ITEMS.every((i) => checked[i.id]);
  const { grade, color } = estimateGrade(score, allChecked);
  const missing = ITEMS.filter((i) => !checked[i.id]);
  const L = (k: keyof typeof SIM_TEXT) => SIM_TEXT[k][lang];

  return (
    <div className="appseal-card rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-extrabold text-slate-100">{L("title")}</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{L("subtitle")}</p>
        </div>
        <img
          src={getTrophyPath(grade)}
          alt={`${L("altGrade")} ${grade}`}
          width={56}
          height={56}
          className="h-14 w-14 object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)]"
        />
        <div className="text-right">
          <div className="font-display text-3xl font-extrabold" style={{ color }}>
            {score}
            <span className="text-base text-slate-500">/100</span>
          </div>
          <div className="font-bold text-sm" style={{ color }}>
            {L("gradeLabel")} {grade}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {ITEMS.map((i) => (
          <label
            key={i.id}
            className="flex cursor-pointer select-none items-center gap-2.5 rounded-lg border border-slate-800 bg-[#090d16]/60 px-3 py-2 text-sm transition hover:border-slate-600"
          >
            <input
              type="checkbox"
              checked={Boolean(checked[i.id])}
              onChange={(e) => setChecked((c) => ({ ...c, [i.id]: e.target.checked }))}
              aria-label={i.label}
              className="h-4 w-4 rounded border-slate-700 bg-[#111827] accent-sky-400"
            />
            <span className="font-mono text-xs text-slate-300">{i.label}</span>
            <span className="ml-auto font-mono text-[10px] text-slate-600">-{i.penalty}</span>
          </label>
        ))}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        {missing.length > 0 ? (
          <>
            {L("fixFirst")}{" "}
            <span className="font-bold text-slate-300">{missing[0].label}</span> (-{missing[0].penalty}{" "}
            {lang === "ru" ? "б." : "pts"}) {L("fixFirstTail")}
          </>
        ) : (
          <>
            {L("allSet")} {TOTAL_CHECKS - ITEMS.length} {L("allSetTail")}
          </>
        )}{" "}
        {L("estimateNote")}
      </p>

      <button
        type="button"
        onClick={() => {
          const input = document.querySelector("input[inputmode='url']") as HTMLInputElement | null;
          if (input) {
            input.scrollIntoView({ behavior: "smooth", block: "center" });
            setTimeout(() => input.focus({ preventScroll: true }), 400);
          }
        }}
        className="mt-4 rounded-md bg-sky-400 px-4 py-2 text-sm font-bold text-[#090d16] transition hover:bg-sky-300"
      >
        {L("cta")}
      </button>
    </div>
  );
}
