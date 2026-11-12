import type { CheckResult, ScanResult, Severity } from "./types";

export function computeScore(results: CheckResult[]): { score: number; grade: ScanResult["grade"] } {
  let score = 100;
  for (const r of results) {
    if (r.status === "fail") score -= r.penalty;
    else if (r.status === "warn") score -= r.penalty;
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  // caps: critical findings can't yield a high grade
  const hasCritical = results.some((r) => (r.status === "fail" || r.status === "warn") && r.severity === "critical");
  const hasHigh = results.some((r) => (r.status === "fail" || r.status === "warn") && r.severity === "high");
  if (hasCritical) score = Math.min(score, 44);
  else if (hasHigh) score = Math.min(score, 74);

  const grade: ScanResult["grade"] = score >= 85 ? "A" : score >= 70 ? "B" : score >= 45 ? "C" : "D";
  return { score, grade };
}

export const GRADE_META: Record<ScanResult["grade"], { color: string; label: { ru: string; en: string } }> = {
  A: { color: "#10b981", label: { ru: "Отлично", en: "Excellent" } },
  B: { color: "#84cc16", label: { ru: "Хорошо", en: "Good" } },
  C: { color: "#f59e0b", label: { ru: "Требует доработки", en: "Needs work" } },
  D: { color: "#ef4444", label: { ru: "Опасно", en: "Unsafe" } },
};

export const SEVERITY_META: Record<Severity, { color: string; label: { ru: string; en: string } }> = {
  critical: { color: "#ef4444", label: { ru: "Критично", en: "Critical" } },
  high: { color: "#f97316", label: { ru: "Высокая", en: "High" } },
  medium: { color: "#f59e0b", label: { ru: "Средняя", en: "Medium" } },
  low: { color: "#a3a3a3", label: { ru: "Низкая", en: "Low" } },
  info: { color: "#525252", label: { ru: "Инфо", en: "Info" } },
};

export const STATUS_LABEL: Record<CheckResult["status"], { ru: string; en: string }> = {
  pass: { ru: "OK", en: "Pass" },
  fail: { ru: "Провалено", en: "Failed" },
  warn: { ru: "Предупреждение", en: "Warning" },
  info: { ru: "Инфо", en: "Info" },
  skip: { ru: "Пропущено", en: "Skipped" },
};
