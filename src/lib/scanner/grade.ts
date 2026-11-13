import type { CheckResult, Grade, Severity } from "./types";

export interface GradeMetaItem {
  color: string;
  secondaryColor: string;
  minScore: number;
  maxScore: number;
  trophy: string;
  label: { ru: string; en: string };
  description: { ru: string; en: string };
}

export function computeScore(results: CheckResult[]): { score: number; grade: Grade } {
  let score = 100;
  for (const r of results) {
    if (r.status === "fail" || r.status === "warn") {
      score -= r.penalty;
    }
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Потолки (caps)
  const criticalIssues = results.filter(
    (r) => (r.status === "fail" || r.status === "warn") && r.severity === "critical",
  ).length;

  const hasHigh = results.some(
    (r) => (r.status === "fail" || r.status === "warn") && r.severity === "high",
  );

  // 1 критический провал принудительно опускает потолок в диапазон класса D (макс 49),
  // 2 и более критических провала сразу переводят проект в класс E (макс 24)
  if (criticalIssues >= 2) {
    score = Math.min(score, 24);
  } else if (criticalIssues === 1) {
    score = Math.min(score, 49);
  } else if (hasHigh) {
    // Любая проблема уровня high ограничивает максимум границей класса B (макс 84)
    score = Math.min(score, 84);
  }

  // Условие для A+: отсутствие провалов и предупреждений уровня выше низкого
  const hasFail = results.some((r) => r.status === "fail");
  const hasWarnAboveLow = results.some(
    (r) => r.status === "warn" && (r.severity === "critical" || r.severity === "high" || r.severity === "medium"),
  );
  const isAplusEligible = !hasFail && !hasWarnAboveLow;

  let grade: Grade;
  if (score >= 96 && isAplusEligible) {
    grade = "A+";
  } else if (score >= 85) {
    if (score >= 96) score = Math.min(score, 95);
    grade = "A";
  } else if (score >= 70) {
    grade = "B";
  } else if (score >= 50) {
    grade = "C";
  } else if (score >= 25) {
    grade = "D";
  } else {
    grade = "E";
  }

  return { score, grade };
}

export function getTrophyPath(grade: string): string {
  if (grade === "A+") return "/Aplus.png";
  if (grade === "A" || grade === "B" || grade === "C" || grade === "D" || grade === "E") {
    return `/${grade}.png`;
  }
  return "/E.png";
}

export const GRADE_META: Record<Grade, GradeMetaItem> = {
  "A+": {
    color: "#C084FC",
    secondaryColor: "#9333EA",
    minScore: 96,
    maxScore: 100,
    trophy: "/Aplus.png",
    label: { ru: "Эталон", en: "Benchmark" },
    description: {
      ru: "Королевский аметист. Высший ранг для приложений без единого провала и с настроенными защитными заголовками.",
      en: "Royal amethyst. Highest tier for apps with zero failures and hardened security headers.",
    },
  },
  A: {
    color: "#34D399",
    secondaryColor: "#059669",
    minScore: 85,
    maxScore: 95,
    trophy: "/A.png",
    label: { ru: "Отлично", en: "Excellent" },
    description: {
      ru: "Изумрудный неон. Основной рабочий знак безопасности для продакшен-приложений с мелкими недочётами.",
      en: "Emerald neon. Primary production trust seal with minor findings like a missing secondary header or tag.",
    },
  },
  B: {
    color: "#38BDF8",
    secondaryColor: "#0284C7",
    minScore: 70,
    maxScore: 84,
    trophy: "/B.png",
    label: { ru: "Хорошо", en: "Good" },
    description: {
      ru: "Электрик-голубой. Безопасно по критическим контурам секретов и БД, требует доводки конфигурации кук или CORS.",
      en: "Electric sky. Safe against critical leaks and database access, requires cookie or CORS refinement.",
    },
  },
  C: {
    color: "#FBBF24",
    secondaryColor: "#D97706",
    minScore: 50,
    maxScore: 69,
    trophy: "/C.png",
    label: { ru: "Требует доработки", en: "Needs work" },
    description: {
      ru: "Янтарное золото. Пограничное состояние (типичный dev-инстанс до настройки прокси и продакшен-сборки).",
      en: "Amber gold. Borderline state (typical dev instance before proxy and production hardening).",
    },
  },
  D: {
    color: "#FB923C",
    secondaryColor: "#EA580C",
    minScore: 25,
    maxScore: 49,
    trophy: "/D.png",
    label: { ru: "Уязвимо", en: "Vulnerable" },
    description: {
      ru: "Раскалённая медь. Наличие серьёзных пробоев конфигурации либо сработавший потолок при одной критической находке.",
      en: "Molten copper. Serious configuration weaknesses or ceiling triggered by a single critical finding.",
    },
  },
  E: {
    color: "#F87171",
    secondaryColor: "#DC2626",
    minScore: 0,
    maxScore: 24,
    trophy: "/E.png",
    label: { ru: "Опасно", en: "Dangerous" },
    description: {
      ru: "Рубиновый красный. Полный провал гигиены безопасности: слитые ключи API, открытый .env или дамп базы по прямой ссылке.",
      en: "Ruby red. Complete failure of security hygiene: leaked API keys, open .env, or exposed database dumps.",
    },
  },
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
