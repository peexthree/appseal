export type Lang = "ru" | "en";

export type Grade = "A+" | "A" | "B" | "C" | "D" | "E";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type CheckStatus = "pass" | "fail" | "warn" | "info" | "skip";

export type CategoryId = "secrets" | "headers" | "admin" | "liveness";

export interface Localized {
  ru: string;
  en: string;
}

export interface CheckFinding {
  /** Machine-readable summary line */
  code: string;
  /** Human explanation in both languages */
  detail: Localized;
  /** Evidence lines (truncated, safe) */
  evidence: string[];
}

export interface CheckResult {
  id: string;
  category: CategoryId;
  title: Localized;
  status: CheckStatus;
  severity: Severity; // severity when failing / warn
  /** points deducted when failing */
  penalty: number;
  durationMs: number;
  finding?: CheckFinding;
}

export interface TechPassport {
  stack: string;
  cdnWaf: string;
  pageSizeKb: number;
  ttfbMs: number;
}

export interface ScanResult {
  id: string;
  /** URL as entered by user */
  inputUrl: string;
  /** Normalized URL actually scanned */
  targetUrl: string;
  host: string;
  isDemo: boolean;
  lang: Lang;
  startedAt: string;
  finishedAt: string;
  status: "queued" | "running" | "done" | "error";
  progress: number; // 0..100
  stage: Localized;
  error?: Localized;
  score: number; // 0..100
  grade: Grade;
  results: CheckResult[];
  platform?: string; // detected builder platform
  techPassport?: TechPassport;
  /** Secret report key: issued once to the scan initiator at POST /api/scan.
   *  Full findings (results, PDF, fix prompt) are served only with it; the
   *  bare report id grants the public verification view only. Never sent
   *  back in API responses. */
  rkey?: string;
  /** Transport flag set by the server on public (keyless) views; never persisted. */
  publicOnly?: boolean;
}

export const CATEGORY_META: Record<CategoryId, { title: Localized; icon: string }> = {
  secrets: {
    title: { ru: "Секреты и утечки", en: "Secrets & leaks" },
    icon: "key",
  },
  headers: {
    title: { ru: "Заголовки и TLS", en: "Headers & TLS" },
    icon: "shield",
  },
  admin: {
    title: { ru: "Админки и авторизация", en: "Admin & auth" },
    icon: "lock",
  },
  liveness: {
    title: { ru: "Живость и контент", en: "Liveness & content" },
    icon: "pulse",
  },
};

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};
