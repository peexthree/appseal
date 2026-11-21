"use client";

import { useEffect, useMemo, useState } from "react";
import type { CheckResult, ScanResult, CategoryId, Lang, Grade } from "@/lib/scanner/types";
import { CATEGORY_META, SEVERITY_ORDER } from "@/lib/scanner/types";
import { getTrophyPath, GRADE_META, SEVERITY_META, STATUS_LABEL } from "@/lib/scanner/grade";
import { buildFixPrompt, type AiTarget } from "@/lib/fix-prompt";
import { buildLlmsTxt, buildSecurityTxt } from "@/lib/generators";
import { buildHostingPatch } from "@/lib/config-patch";
import { CI_YAML as CI_YAML_TEMPLATE } from "@/lib/ci-yaml";
import { simulateFix } from "@/lib/score-sim";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CheckCircle2, XCircle, AlertTriangle, Info, MinusCircle,
  Download, RotateCcw, Copy, Check, ChevronDown, KeyRound, ShieldHeaders, Lock, Activity, Sparkles,
  FileCheck2, Scale,
} from "@/components/icons/appseal-icons";

const CAT_ICONS: Record<CategoryId, React.ReactNode> = {
  secrets: <KeyRound className="h-4 w-4" />,
  headers: <ShieldHeaders className="h-4 w-4" />,
  admin: <Lock className="h-4 w-4" />,
  liveness: <Activity className="h-4 w-4" />,
  trust: <Sparkles className="h-4 w-4" />,
};

const CI_YAML = CI_YAML_TEMPLATE;

function StatusIcon({ s }: { s: CheckResult["status"] }) {
  const cls = "h-4 w-4 shrink-0";
  if (s === "pass") return <CheckCircle2 className={`${cls} text-emerald-400`} />;
  if (s === "fail") return <XCircle className={`${cls} text-red-500`} />;
  if (s === "warn") return <AlertTriangle className={`${cls} text-amber-500`} />;
  if (s === "info") return <Info className={`${cls} text-slate-500`} />;
  return <MinusCircle className={`${cls} text-slate-600`} />;
}

// share icon: three nodes connected by lines (share-2 style), stroke matches
// the appseal-icons look (viewBox 24, currentColor, strokeWidth 2)
function ShareIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function TrophyHero({ grade, score }: { grade: Grade; score: number }) {
  const meta = GRADE_META[grade] ?? GRADE_META["E"];
  const trophyPath = getTrophyPath(grade);

  return (
    <div className="relative flex h-28 w-28 shrink-0 items-center justify-center sm:h-32 sm:w-32" aria-label={`grade ${grade} score ${score}`}>
      {/* Ambient glow matching grade */}
      <div
        className="absolute inset-1 rounded-full blur-2xl opacity-40 transition-all duration-300"
        style={{ backgroundColor: meta.color }}
      />
      {/* 3D Trophy Image */}
      <img
        src={trophyPath}
        alt={`AppSeal ${grade}`}
        width={128}
        height={128}
        className="relative z-10 h-24 w-24 object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.7)] transition-transform duration-300 hover:scale-105 sm:h-28 sm:w-28"
      />
      {/* Floating score badge */}
      <div
        className="absolute -bottom-1 -right-1 z-20 flex items-center justify-center rounded-lg border px-2 py-0.5 font-mono text-[11px] font-extrabold shadow-lg backdrop-blur"
        style={{
          backgroundColor: "#090d16",
          borderColor: `${meta.color}66`,
          color: meta.color,
        }}
      >
        {score}/100
      </div>
    </div>
  );
}

function CheckRow({
  r,
  lang,
  isOpen,
  onToggle,
}: {
  r: CheckResult;
  lang: Lang;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const [evidenceCopied, setEvidenceCopied] = useState(false);
  const sev = SEVERITY_META[r.severity];
  const showFinding = r.finding && (r.status === "fail" || r.status === "warn" || r.status === "info");

  const copyEvidence = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!r.finding?.evidence.length) return;
    try {
      await navigator.clipboard.writeText(r.finding.evidence.join("\n"));
      setEvidenceCopied(true);
      setTimeout(() => setEvidenceCopied(false), 2000);
    } catch {}
  };

  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <div className={`rounded-xl border transition-all duration-200 ${
        r.status === "fail"
          ? "border-red-500/30 bg-red-950/10 hover:border-red-500/50"
          : r.status === "warn"
          ? "border-amber-500/30 bg-amber-950/10 hover:border-amber-500/50"
          : "border-slate-800/80 bg-[#0c121e]/60 hover:border-slate-700"
      }`}>
        <CollapsibleTrigger
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors"
          aria-expanded={isOpen}
        >
          <StatusIcon s={r.status} />
          <span className="flex-1 text-sm font-medium text-slate-100">
            {r.title[lang]}
          </span>
          {(r.status === "fail" || r.status === "warn") && (
            <>
              {r.penalty > 0 && (
                <span
                  className="rounded border border-emerald-800/60 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-300"
                  title={lang === "ru" ? "Сколько баллов вернёт исправление" : "Points this fix returns"}
                >
                  +{r.penalty} {lang === "ru" ? "б." : "pts"}
                </span>
              )}
              <Badge
                variant="outline"
                className="border-none text-[11px] font-bold uppercase tracking-wider"
                style={{ color: sev.color, backgroundColor: `${sev.color}1a` }}
              >
                {sev.label[lang]}
              </Badge>
            </>
          )}
          {r.status !== "fail" && r.status !== "warn" && (
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {STATUS_LABEL[r.status][lang]}
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        {showFinding && (
          <CollapsibleContent>
            <div className="border-t border-slate-800/80 px-4 py-3 bg-[#090d16]/50 rounded-b-xl">
              <p className="text-[13px] leading-relaxed text-slate-300">
                {r.finding!.detail[lang]}
              </p>
              {r.finding!.evidence.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      {t(lang, "evidence")}
                    </p>
                    <button
                      type="button"
                      onClick={copyEvidence}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-200"
                    >
                      {evidenceCopied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      <span>{evidenceCopied ? (lang === "ru" ? "Скопировано" : "Copied") : (lang === "ru" ? "Копировать лог" : "Copy log")}</span>
                    </button>
                  </div>
                  <pre className="appseal-scroll max-h-40 overflow-auto rounded-md border border-slate-800/70 bg-[#060911] p-3 font-mono text-[11px] leading-relaxed text-slate-300">
                    {r.finding!.evidence.join("\n")}
                  </pre>
                </div>
              )}
            </div>
          </CollapsibleContent>
        )}
      </div>
    </Collapsible>
  );
}

export function ReportView({
  scan,
  lang,
  onReset,
  reportKey,
}: {
  scan: ScanResult;
  lang: Lang;
  onReset: () => void;
  reportKey?: string;
}) {
  // Main view tab: checks | ai-fix | badge | dev-tools
  const fails = scan.results.filter((r) => r.status === "fail").length;
  const warns = scan.results.filter((r) => r.status === "warn").length;
  const passes = scan.results.filter((r) => r.status === "pass").length;
  const criticals = scan.results.filter(
    (r) => (r.status === "fail" || r.status === "warn") && r.severity === "critical",
  ).length;

  const [activeTab, setActiveTab] = useState<"checks" | "ai-fix" | "badge" | "dev-tools">(
    fails + warns > 0 ? "checks" : "badge",
  );

  // Filters inside Checks tab
  const [statusFilter, setStatusFilter] = useState<"issues" | "critical" | "all" | "passes">(
    fails + warns > 0 ? "issues" : "all",
  );
  const [categoryFilter, setCategoryFilter] = useState<CategoryId | "all">("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // AI-fix target selector (Generic, Cursor, Claude, v0)
  const [aiTarget, setAiTarget] = useState<AiTarget>("cursor");
  const [promptCopied, setPromptCopied] = useState(false);

  // Badge state
  const [badgeFormat, setBadgeFormat] = useState<"trophy" | "shield">("trophy");
  const [syntax, setSyntax] = useState<"html" | "markdown">("html");
  const [badgeCopied, setBadgeCopied] = useState(false);

  // Dev tools sub-tabs
  const [devToolTab, setDevToolTab] = useState<"patch" | "ci" | "trustfiles">("patch");
  const [patchCopied, setPatchCopied] = useState(false);
  const [ciCopied, setCiCopied] = useState(false);
  const [genFile, setGenFile] = useState<"llms" | "sec">("llms");
  const [genCopied, setGenCopied] = useState(false);

  // Share & Link state
  const [resultCopied, setResultCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [prevScan, setPrevScan] = useState<{ score: number; grade: Grade; id: string } | null>(null);
  const [passActive, setPassActive] = useState<boolean | null>(null);

  const gm = GRADE_META[scan.grade] ?? GRADE_META["E"];

  useEffect(() => {
    if (!reportKey) return;
    let alive = true;
    fetch(`/api/pass-status?id=${encodeURIComponent(scan.id)}&key=${encodeURIComponent(reportKey)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { active?: boolean }) => {
        if (alive) setPassActive(Boolean(data.active));
      })
      .catch(() => {
        if (alive) setPassActive(false);
      });
    return () => {
      alive = false;
    };
  }, [scan.id, scan.host, reportKey]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const key = `appseal_hist_${scan.host}`;
        const saved = localStorage.getItem(key);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.id && parsed.id !== scan.id) {
            setPrevScan(parsed);
          }
        }
        localStorage.setItem(key, JSON.stringify({ score: scan.score, grade: scan.grade, id: scan.id }));
      } catch {}
    }, 0);
    return () => window.clearTimeout(id);
  }, [scan.host, scan.id, scan.score, scan.grade]);

  // Filtered check list
  const filteredResults = useMemo(() => {
    return scan.results.filter((r) => {
      // Category filter
      if (categoryFilter !== "all" && r.category !== categoryFilter) return false;
      // Status filter
      if (statusFilter === "issues") return r.status === "fail" || r.status === "warn";
      if (statusFilter === "critical") return (r.status === "fail" || r.status === "warn") && r.severity === "critical";
      if (statusFilter === "passes") return r.status === "pass";
      return true;
    }).sort((a, b) => {
      const rank = (r: CheckResult) =>
        r.status === "fail" ? 0 : r.status === "warn" ? 1 : r.status === "info" ? 3 : 2;
      return (
        rank(a) - rank(b) ||
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        b.penalty - a.penalty
      );
    });
  }, [scan.results, statusFilter, categoryFilter]);

  const toggleExpandAll = () => {
    if (expandedIds.size > 0) {
      setExpandedIds(new Set());
    } else {
      setExpandedIds(new Set(filteredResults.map((r) => r.id)));
    }
  };

  const toggleRow = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const badgeW = useMemo(() => {
    const cleanHost = scan.host.replace(/^www\./i, "");
    const hostDisplay = cleanHost.length > 24 ? cleanHost.slice(0, 22) + "…" : cleanHost;
    return Math.max(228, Math.min(276, Math.round(44 + hostDisplay.length * 7.2 + 64)));
  }, [scan.host]);

  const embedCode = useMemo(() => {
    const hostParam = encodeURIComponent(scan.host);
    const profile = `${origin}/verified/${hostParam}`;
    if (syntax === "markdown") {
      if (badgeFormat === "trophy") {
        return `[![AppSeal Security Verified - live grade](${origin}/api/badge?host=${hostParam}&style=trophy)](${profile})`;
      }
      return `[![AppSeal Security Verified - live grade](${origin}/api/badge?host=${hostParam})](${profile})`;
    }
    if (badgeFormat === "trophy") {
      return `<a href="${profile}" target="_blank" rel="noopener" title="AppSeal Security Verified - live security grade"><img src="${origin}/api/badge?host=${hostParam}&style=trophy" alt="AppSeal Verified: ${scan.host}" width="80" height="80" style="filter: drop-shadow(0 4px 12px rgba(0,0,0,0.3));" /></a>`;
    }
    return `<a href="${profile}" target="_blank" rel="noopener" title="AppSeal Security Verified - live security grade"><img src="${origin}/api/badge?host=${hostParam}" alt="AppSeal Verified: ${scan.host}" width="${badgeW}" height="44"></a>`;
  }, [badgeFormat, syntax, origin, scan.host, badgeW]);

  const fixPrompt = useMemo(() => buildFixPrompt(scan, lang, aiTarget), [scan, lang, aiTarget]);
  const sim = useMemo(() => simulateFix(scan.results), [scan.results]);
  const hostingPatch = useMemo(() => buildHostingPatch(scan), [scan]);

  const copyBadge = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setBadgeCopied(true);
      setTimeout(() => setBadgeCopied(false), 2000);
    } catch {}
  };

  // share block: public verified profile is the shareable link - the full
  // report stays rkey-private, so /verified/{host} is the honest share target
  const checksTotal = scan.results.length > 0 ? scan.results.length : 125;
  const verifiedUrl = `${origin}/verified/${scan.host}`;
  const shareResultText = t(lang, "shareResultText")
    .replace("{host}", scan.host)
    .replace("{grade}", scan.grade)
    .replace("{score}", String(scan.score))
    .replace("{n}", String(checksTotal));

  const copyResultShare = async () => {
    const payload = `${shareResultText} ${verifiedUrl}`;
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      // clipboard API denied or missing (non-secure context): execCommand fallback
      try {
        const ta = document.createElement("textarea");
        ta.value = payload;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {}
    }
    setResultCopied(true);
    setTimeout(() => setResultCopied(false), 2000);
  };

  // native share sheet (mobile) with clipboard fallback; shares the report
  // page URL - /report/[id] renders the public verification view for visitors
  // and the rkey never appears in the URL, so location.href is safe to hand out
  const shareResult = async () => {
    const shareUrl = window.location.href;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `AppSeal: ${scan.host}`,
          text: shareResultText,
          url: shareUrl,
        });
        return;
      } catch (err) {
        // user dismissed the share sheet - no clipboard copy, no toast
        if (err instanceof DOMException && err.name === "AbortError") return;
        // share failed (no targets / permission): fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // clipboard API denied or missing (non-secure context): execCommand fallback
      try {
        const ta = document.createElement("textarea");
        ta.value = shareUrl;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {}
    }
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(fixPrompt);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    } catch {}
  };

  const copyPatch = async () => {
    try {
      await navigator.clipboard.writeText(hostingPatch.code);
      setPatchCopied(true);
      setTimeout(() => setPatchCopied(false), 2000);
    } catch {}
  };

  const copyCi = async () => {
    try {
      await navigator.clipboard.writeText(CI_YAML);
      setCiCopied(true);
      setTimeout(() => setCiCopied(false), 2000);
    } catch {}
  };

  const copyGenFile = async () => {
    const fileObj = genFile === "llms" ? buildLlmsTxt(scan) : buildSecurityTxt(scan);
    try {
      await navigator.clipboard.writeText(fileObj.content);
      setGenCopied(true);
      setTimeout(() => setGenCopied(false), 2000);
    } catch {}
  };

  // Public verification view
  if (scan.publicOnly) {
    const fmtDate = new Date(scan.finishedAt || scan.startedAt).toLocaleDateString(
      lang === "ru" ? "ru-RU" : "en-US",
    );
    return (
      <div className="w-full">
        <div className="flex flex-col items-start gap-6 rounded-2xl appseal-glass-card p-6 sm:flex-row sm:items-center sm:p-8">
          <TrophyHero grade={scan.grade} score={scan.score} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                {t(lang, "gradeTitle")}
              </p>
              <span
                className="inline-flex items-center rounded px-2 py-0.5 font-display text-xs font-extrabold"
                style={{ color: gm.color, backgroundColor: `${gm.color}1a` }}
              >
                Класс {scan.grade}
              </span>
            </div>
            <h2 className="font-display mt-1 truncate text-2xl font-bold text-slate-50">
              {scan.host}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              {lang === "ru"
                ? `Проверка завершена ${fmtDate}. Публичная верификация подтверждает класс и дату; полный отчёт с перечнем проверок доступен только инициатору скана.`
                : `Check completed ${fmtDate}. Public verification confirms the grade and date; the full findings report is available only to the scan initiator.`}
            </p>
            <Button
              onClick={onReset}
              className="mt-4 bg-sky-400 font-bold text-[#090d16] hover:bg-sky-300"
            >
              {lang === "ru" ? "Проверить свой сайт" : "Scan your own app"}
            </Button>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          {lang === "ru"
            ? "Результаты носят информационный характер и не являются заключением аудита безопасности - "
            : "Results are informational and not a security audit - "}
          <a href="/legal" className="underline decoration-slate-600 hover:text-slate-300">
            {lang === "ru" ? "правила и дисклеймер" : "terms & disclaimer"}
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* 1. Header Card (Результат сканирования) */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-[#0a0f1d]/90 p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          <TrophyHero grade={scan.grade} score={scan.score} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center rounded-md px-2.5 py-0.5 font-display text-xs font-extrabold tracking-wide uppercase"
                style={{ color: gm.color, backgroundColor: `${gm.color}1f`, border: `1px solid ${gm.color}40` }}
              >
                Класс {scan.grade}
              </span>
              <span className="text-sm font-bold" style={{ color: gm.color }}>
                {gm.label[lang]}
              </span>
              {scan.platform && (
                <Badge variant="secondary" className="bg-slate-800/90 text-slate-300 border border-slate-700">
                  {scan.platform}
                </Badge>
              )}
              {scan.isDemo && (
                <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/40" variant="secondary">
                  DEMO
                </Badge>
              )}
            </div>

            <h2 className="font-display mt-2 truncate text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {scan.host}
            </h2>

            <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-slate-300 max-w-2xl">
              {gm.description[lang]}
            </p>

            {/* Quick Metrics & Passport */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-bold text-red-400">
                <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" />
                {fails} {lang === "ru" ? "критичных проблем" : "failures"}
              </div>
              <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-400">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                {warns} {lang === "ru" ? "предупреждений" : "warnings"}
              </div>
              <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                {passes} {lang === "ru" ? "пройдено" : "passed"}
              </div>

              {scan.techPassport && (
                <>
                  <span className="hidden sm:inline-block h-4 w-px bg-slate-800 mx-1" />
                  <span className="inline-flex items-center gap-1 rounded-md bg-slate-900/90 px-2 py-1 text-[11px] font-mono text-slate-300 border border-slate-800">
                    <span className="text-sky-400">⚡</span> {scan.techPassport.stack}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-slate-900/90 px-2 py-1 text-[11px] font-mono text-slate-300 border border-slate-800">
                    <span className="text-emerald-400">🛡️</span> {scan.techPassport.cdnWaf}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-slate-900/90 px-2 py-1 text-[11px] font-mono text-slate-300 border border-slate-800">
                    <span className="text-violet-400">⏱️</span> {scan.techPassport.ttfbMs} ms
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons Bar */}
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-800/80 pt-5">
          <div className="flex flex-wrap items-center gap-2.5">
            {passActive === true ? (
              <Button asChild className="bg-sky-400 text-[#090d16] hover:bg-sky-300 font-bold shadow-lg shadow-sky-500/20">
                <a href={`/api/report?id=${scan.id}${reportKey ? `&key=${reportKey}` : ""}`} download>
                  <Download className="h-4 w-4 mr-1.5" />
                  {t(lang, "downloadPdf")}
                </a>
              </Button>
            ) : passActive === false ? (
              <Button asChild className="bg-sky-400 text-[#090d16] hover:bg-sky-300 font-bold shadow-lg shadow-sky-500/20">
                <a href="/#pricing">
                  <Download className="h-4 w-4 mr-1.5" />
                  {t(lang, "passGatePdf")}
                </a>
              </Button>
            ) : (
              // pass status is still loading: disabled placeholder - a live
              // download link here would fetch the 402 gate response as a file
              <Button disabled className="bg-sky-400/50 text-[#090d16] font-bold shadow-lg shadow-sky-500/20" aria-busy="true">
                <Download className="h-4 w-4 mr-1.5" />
                {t(lang, "pdfChecking")}
              </Button>
            )}

            <Button variant="outline" onClick={onReset} className="border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white">
              <RotateCcw className="h-4 w-4 mr-1.5" />
              {t(lang, "rescan")}
            </Button>

            {/* always available - sits outside the pass-gated PDF block above */}
            <Button variant="outline" onClick={shareResult} className="border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white">
              <ShareIcon className="h-4 w-4 mr-1.5" />
              {lang === "ru" ? "Поделиться результатом" : "Share result"}
            </Button>
            {linkCopied && (
              <span role="status" aria-live="polite" className="text-xs font-bold text-emerald-300">
                {lang === "ru" ? "Ссылка скопирована" : "Link copied"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Share your result: public verified profile, plain links + clipboard
          only (strict CSP - no external share scripts) */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-[#0a0f1d]/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-200">{t(lang, "shareBlockTitle")}</p>
          <p className="mt-0.5 truncate font-mono text-xs text-slate-500">{verifiedUrl}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-8 border-sky-500/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 text-xs font-bold"
          >
            <a
              href={`https://t.me/share/url?url=${encodeURIComponent(verifiedUrl)}&text=${encodeURIComponent(shareResultText)}`}
              target="_blank"
              rel="noopener"
            >
              <span className="mr-1">✈️</span> Telegram
            </a>
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-8 border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white text-xs font-bold"
          >
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareResultText)}&url=${encodeURIComponent(verifiedUrl)}`}
              target="_blank"
              rel="noopener"
            >
              <span className="mr-1">𝕏</span> X
            </a>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={copyResultShare}
            className="h-8 border-slate-700 bg-slate-900 text-xs text-slate-300 hover:bg-slate-800 hover:text-white font-semibold"
          >
            {resultCopied ? <Check className="h-3.5 w-3.5 text-emerald-400 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
            {resultCopied ? t(lang, "copied") : t(lang, "copyBtn")}
          </Button>
        </div>
      </div>

      {/* Before / After Re-scan Diff Banner */}
      {prevScan && scan.score > prevScan.score && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-emerald-300 shadow-lg shadow-emerald-500/5">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎉</span>
            <div>
              <p className="text-sm font-bold text-emerald-200">
                {lang === "ru" ? "Зафиксирован прогресс безопасности!" : "Security progress confirmed!"}
              </p>
              <p className="text-xs text-emerald-300/80 mt-0.5">
                {lang === "ru"
                  ? `Оценка выросла: было ${prevScan.score}/100 (${prevScan.grade}) → стало ${scan.score}/100 (${scan.grade}) (+${scan.score - prevScan.score} баллов)`
                  : `Score improved: ${prevScan.score}/100 (${prevScan.grade}) → ${scan.score}/100 (${scan.grade}) (+${scan.score - prevScan.score} pts)`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 2. Main Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab("checks")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-all ${
            activeTab === "checks"
              ? "bg-sky-500 text-[#090d16] shadow-lg shadow-sky-500/20"
              : "bg-slate-900/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          }`}
        >
          <span>📋</span>
          <span>{lang === "ru" ? "Проверки и проблемы" : "Findings & Checks"}</span>
          {fails + warns > 0 ? (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
              activeTab === "checks" ? "bg-[#090d16] text-sky-400" : "bg-red-500/20 text-red-400 border border-red-500/40"
            }`}>
              {fails + warns}
            </span>
          ) : (
            <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-extrabold ${
              activeTab === "checks" ? "bg-[#090d16] text-emerald-400" : "bg-emerald-500/20 text-emerald-400"
            }`}>
              ✓
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("ai-fix")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-all ${
            activeTab === "ai-fix"
              ? "bg-sky-500 text-[#090d16] shadow-lg shadow-sky-500/20"
              : "bg-slate-900/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          }`}
        >
          <span>🤖</span>
          <span>{lang === "ru" ? "Исправить с AI" : "Fix with AI"}</span>
          <span className={`text-[11px] font-extrabold uppercase px-1.5 py-0.2 rounded ${
            activeTab === "ai-fix" ? "bg-[#090d16]/30 text-[#090d16]" : "bg-sky-500/15 text-sky-400"
          }`}>
            Cursor / Claude
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("badge")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-all ${
            activeTab === "badge"
              ? "bg-sky-500 text-[#090d16] shadow-lg shadow-sky-500/20"
              : "bg-slate-900/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          }`}
        >
          <span>🏷️</span>
          <span>{lang === "ru" ? "Бейдж на сайт" : "Trust Badge"}</span>
          <span className={`text-[11px] font-mono font-bold ${
            activeTab === "badge" ? "text-[#090d16]" : "text-emerald-400"
          }`}>
            {scan.grade}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("dev-tools")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-all ${
            activeTab === "dev-tools"
              ? "bg-sky-500 text-[#090d16] shadow-lg shadow-sky-500/20"
              : "bg-slate-900/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          }`}
        >
          <span>🛠️</span>
          <span>{lang === "ru" ? "Инструменты разработчика" : "Dev Tools"}</span>
          <span className="text-[11px] text-slate-500">CI/CD, конфиги</span>
        </button>
      </div>

      {/* 3. TAB CONTENT: CHECKS & FINDINGS */}
      {activeTab === "checks" && (
        <div className="space-y-6">
          {/* Simulator Banner */}
          {sim.items.length > 0 && (
            <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-4 sm:p-5 shadow-lg">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base">🎯</span>
                    <h4 className="text-sm font-bold text-sky-200">
                      {lang === "ru" ? "Симулятор быстрого исправления" : "Fast Fix Simulator"}
                    </h4>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-300">
                    {lang === "ru" ? (
                      <>
                        Исправьте всего <strong className="text-sky-300 font-bold">{sim.stepCount} пункта</strong> — и сайт получит оценку{" "}
                        <span className="inline-flex items-center font-bold text-sky-300">Класс {sim.stepGrade} ({sim.stepScore}/100)</span>.
                        Максимум при закрытии всех пунктов:{" "}
                        <span className="font-bold text-emerald-300">Класс {sim.potentialGrade} ({sim.potentialScore}/100)</span>.
                      </>
                    ) : (
                      <>
                        Fix just <strong className="text-sky-300 font-bold">{sim.stepCount} items</strong> to reach{" "}
                        <span className="font-bold text-sky-300">Grade {sim.stepGrade} ({sim.stepScore}/100)</span>.
                        Potential with all resolved:{" "}
                        <span className="font-bold text-emerald-300">Grade {sim.potentialGrade} ({sim.potentialScore}/100)</span>.
                      </>
                    )}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => setActiveTab("ai-fix")}
                  className="bg-sky-400 hover:bg-sky-300 text-[#090d16] font-bold text-xs shrink-0"
                >
                  <span>🤖</span> {lang === "ru" ? "Сгенерировать промпт" : "Generate AI prompt"}
                </Button>
              </div>
            </div>
          )}

          {/* Filter Bar */}
          <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-[#0a0f1d]/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Status Filters */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setStatusFilter("issues")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    statusFilter === "issues"
                      ? "bg-red-500/20 text-red-300 border border-red-500/50"
                      : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  }`}
                >
                  ⚠️ {lang === "ru" ? "Требуют внимания" : "Action Needed"} ({fails + warns})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("critical")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    statusFilter === "critical"
                      ? "bg-red-600 text-white shadow"
                      : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  }`}
                >
                  🔴 {lang === "ru" ? "Критичные" : "Critical"} ({criticals})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("passes")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    statusFilter === "passes"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/50"
                      : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  }`}
                >
                  🟢 {lang === "ru" ? "Пройденные" : "Passed"} ({passes})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    statusFilter === "all"
                      ? "bg-slate-800 text-sky-400 border border-slate-700"
                      : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  }`}
                >
                  📑 {lang === "ru" ? "Все проверки" : "All checks"} ({scan.results.length})
                </button>
              </div>

              {/* Expand / Collapse All */}
              <button
                type="button"
                onClick={toggleExpandAll}
                className="text-xs font-semibold text-slate-400 hover:text-sky-300 transition"
              >
                {expandedIds.size > 0
                  ? (lang === "ru" ? "Свернуть все" : "Collapse all")
                  : (lang === "ru" ? "Развернуть все" : "Expand all")}
              </button>
            </div>

            {/* Category Pills */}
            <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-800/80 pt-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mr-1">
                {lang === "ru" ? "Категория:" : "Category:"}
              </span>
              <button
                type="button"
                onClick={() => setCategoryFilter("all")}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  categoryFilter === "all"
                    ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                {lang === "ru" ? "Все категории" : "All"}
              </button>
              {(Object.keys(CATEGORY_META) as CategoryId[]).map((cat) => {
                const count = scan.results.filter((r) => r.category === cat).length;
                const catIssues = scan.results.filter(
                  (r) => r.category === cat && (r.status === "fail" || r.status === "warn"),
                ).length;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                      categoryFilter === cat
                        ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                        : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    }`}
                  >
                    <span>{CAT_ICONS[cat]}</span>
                    <span>{CATEGORY_META[cat].title[lang]}</span>
                    {catIssues > 0 ? (
                      <span className="rounded-full bg-red-500/20 px-1.5 text-[11px] font-bold text-red-400">
                        {catIssues}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-600">({count})</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Results List */}
          <div className="space-y-2.5">
            {filteredResults.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-[#090d16] p-8 text-center text-slate-400">
                <span className="text-3xl">🎉</span>
                <p className="mt-2 text-sm font-semibold text-slate-200">
                  {lang === "ru" ? "В этой выборке нет проверок" : "No checks match this filter"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {lang === "ru"
                    ? "Все проверки в этой категории пройдены успешно!"
                    : "All checks in this view are in a clean state!"}
                </p>
              </div>
            ) : (
              filteredResults.map((r) => (
                <CheckRow
                  key={r.id}
                  r={r}
                  lang={lang}
                  isOpen={expandedIds.has(r.id)}
                  onToggle={() => toggleRow(r.id)}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* 4. TAB CONTENT: FIX WITH AI */}
      {activeTab === "ai-fix" && (
        <div className="rounded-2xl border border-slate-800 bg-[#0a0f1d]/90 p-6 sm:p-8 backdrop-blur shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">🤖</span>
                <h3 className="text-lg font-bold text-white">
                  {lang === "ru" ? "Генератор промптов для AI-разработки" : "AI Agent Fix Prompts"}
                </h3>
              </div>
              <p className="mt-1 text-xs sm:text-sm text-slate-400 leading-relaxed max-w-xl">
                {lang === "ru"
                  ? "Скопируйте готовый промпт в ваш AI-редактор. ИИ автоматически найдет нужные файлы, вставит заголовки безопасности и исправит все уязвимости."
                  : "Copy this ready-made prompt into your AI coding tool. The AI will locate config files, add missing headers and resolve all security findings."}
              </p>
            </div>

            <Button
              onClick={copyPrompt}
              className="bg-sky-400 hover:bg-sky-300 text-[#090d16] font-bold text-sm shrink-0 shadow-lg shadow-sky-500/20"
            >
              {promptCopied ? <Check className="h-4 w-4 mr-1.5 text-emerald-950" /> : <Copy className="h-4 w-4 mr-1.5" />}
              {promptCopied ? (lang === "ru" ? "Скопировано в буфер!" : "Copied!") : (lang === "ru" ? "Скопировать промпт" : "Copy prompt")}
            </Button>
          </div>

          {/* AI IDE Target Selector */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800">
            <span className="text-xs font-semibold text-slate-400 mr-1">
              {lang === "ru" ? "Целевой агент:" : "Target Agent:"}
            </span>
            {(
              [
                { id: "cursor", label: "Cursor (Composer)", icon: "🎯" },
                { id: "claude", label: "Claude Code CLI", icon: "⚡" },
                { id: "v0", label: "v0 / Lovable / Bolt", icon: "🎨" },
                { id: "generic", label: "Универсальный промпт", icon: "📋" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setAiTarget(t.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  aiTarget === t.id
                    ? "bg-sky-500 text-[#090d16] shadow-sm"
                    : "bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800"
                }`}
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {/* Prompt Preview */}
          <div className="relative">
            <pre className="appseal-scroll max-h-[480px] overflow-auto rounded-xl border border-slate-800 bg-[#060911] p-4 font-mono text-[11px] leading-relaxed text-slate-300 select-all">
              {fixPrompt}
            </pre>
          </div>
        </div>
      )}

      {/* 5. TAB CONTENT: TRUST BADGE */}
      {activeTab === "badge" && (
        <div className="rounded-2xl border border-slate-800 bg-[#0a0f1d]/90 p-6 sm:p-8 backdrop-blur shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">🏷️</span>
                <h3 className="text-lg font-bold text-white">
                  {lang === "ru" ? "Интерактивный бейдж доверия AppSeal" : "AppSeal Trust Badge"}
                </h3>
              </div>
              <p className="mt-1 text-xs sm:text-sm text-slate-400 leading-relaxed max-w-xl">
                {lang === "ru"
                  ? "Разместите бейдж в футере сайта или в README репозитория. Бейдж динамически обновляется при повторных проверках и подтверждает безопасность проекта."
                  : "Embed this badge in your footer or GitHub README. It updates dynamically with your latest scan score and proves your app hygiene."}
              </p>
            </div>

            {passActive === true && (
              <Button
                onClick={copyBadge}
                className="bg-sky-400 hover:bg-sky-300 text-[#090d16] font-bold text-sm shrink-0 shadow-lg shadow-sky-500/20"
              >
                {badgeCopied ? <Check className="h-4 w-4 mr-1.5 text-emerald-950" /> : <Copy className="h-4 w-4 mr-1.5" />}
                {badgeCopied ? (lang === "ru" ? "Скопировано!" : "Copied!") : (lang === "ru" ? "Скопировать код" : "Copy code")}
              </Button>
            )}
          </div>

          {passActive !== true && (
            // badge embeds are gated server-side (/api/badge answers with the
            // grey "Launch Pass required" stub for hosts without a pass) - the
            // copy-ready code block for a non-pass visitor shipped a broken
            // embed, so the honest gate card replaces it until a pass is known
            <div className="rounded-xl border border-sky-500/30 bg-sky-500/[0.06] p-5 space-y-3">
              <p className="text-sm font-bold text-slate-100">{t(lang, "passGateTitle")}</p>
              <p className="text-[13px] leading-relaxed text-slate-300">
                {t(lang, "passGateText").replace("{host}", scan.host)}
              </p>
              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <Button asChild className="bg-sky-400 hover:bg-sky-300 text-[#090d16] font-bold text-sm shadow-lg shadow-sky-500/20">
                  <a href="/#pricing">{t(lang, "passGateCta")}</a>
                </Button>
                <Button asChild variant="outline" className="border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white text-sm">
                  <a href="/#scan">{t(lang, "fixToastCta")}</a>
                </Button>
              </div>
              <p className="pt-1 text-[11px] leading-relaxed text-slate-500">{t(lang, "fixToastTitle")}</p>
            </div>
          )}

          {passActive === true && (
            <>
          {/* Badge Format & Syntax Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400">
                {lang === "ru" ? "Стиль бейджа:" : "Badge Style:"}
              </span>
              <button
                type="button"
                onClick={() => setBadgeFormat("trophy")}
                className={`rounded-md px-3 py-1 text-xs font-bold transition ${
                  badgeFormat === "trophy"
                    ? "bg-slate-800 text-sky-400 border border-slate-700"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                🏆 3D Trophy
              </button>
              <button
                type="button"
                onClick={() => setBadgeFormat("shield")}
                className={`rounded-md px-3 py-1 text-xs font-bold transition ${
                  badgeFormat === "shield"
                    ? "bg-slate-800 text-sky-400 border border-slate-700"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                🛡️ Компактный щит
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400">
                {lang === "ru" ? "Формат кода:" : "Code Format:"}
              </span>
              <div className="flex rounded-md border border-slate-800 bg-[#090d16] p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setSyntax("html")}
                  className={`rounded px-2.5 py-1 font-bold transition ${
                    syntax === "html" ? "bg-slate-800 text-sky-400" : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  HTML
                </button>
                <button
                  type="button"
                  onClick={() => setSyntax("markdown")}
                  className={`rounded px-2.5 py-1 font-bold transition ${
                    syntax === "markdown" ? "bg-slate-800 text-sky-400" : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  Markdown
                </button>
              </div>
            </div>
          </div>

          {/* Badge Preview and Code Block */}
          <div className="flex flex-col items-center gap-6 rounded-xl border border-slate-800/80 bg-[#060911] p-6 sm:flex-row">
            <div className="flex shrink-0 items-center justify-center p-3">
              {badgeFormat === "trophy" ? (
                <div className="group relative flex items-center justify-center">
                  <div
                    className="absolute inset-0 rounded-full blur-xl opacity-40 transition-opacity group-hover:opacity-70"
                    style={{ backgroundColor: gm.color }}
                  />
                  <img
                    src={gm.trophy}
                    alt={`AppSeal ${scan.grade}`}
                    width={96}
                    height={96}
                    className="relative z-10 h-24 w-24 object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.6)]"
                  />
                </div>
              ) : (
                <img
                  src={`/api/badge?host=${encodeURIComponent(scan.host)}`}
                  alt={`AppSeal ${scan.grade}`}
                  width={badgeW}
                  height={44}
                  className="rounded-lg shadow-md max-w-none"
                />
              )}
            </div>

            <div className="min-w-0 flex-1 w-full">
              <pre className="appseal-scroll select-all overflow-x-auto rounded-lg border border-slate-800/80 bg-[#090d16] p-3.5 font-mono text-[11px] leading-relaxed text-slate-300">
                {embedCode}
              </pre>
            </div>
          </div>
            </>
          )}
        </div>
      )}

      {/* 6. TAB CONTENT: DEV TOOLS */}
      {activeTab === "dev-tools" && (
        <div className="rounded-2xl border border-slate-800 bg-[#0a0f1d]/90 p-6 sm:p-8 backdrop-blur shadow-xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">🛠️</span>
              <h3 className="text-lg font-bold text-white">
                {lang === "ru" ? "Инструменты разработчика и хостинга" : "Developer & Hosting Tools"}
              </h3>
            </div>

            {/* Sub-tabs selector */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setDevToolTab("patch")}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  devToolTab === "patch"
                    ? "bg-slate-800 text-sky-400 border border-slate-700"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                ⚡ {lang === "ru" ? "Конфиг хостинга" : "Hosting Patch"}
              </button>
              <button
                type="button"
                onClick={() => setDevToolTab("ci")}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  devToolTab === "ci"
                    ? "bg-slate-800 text-sky-400 border border-slate-700"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                ⚙️ GitHub Actions CI
              </button>
              <button
                type="button"
                onClick={() => setDevToolTab("trustfiles")}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  devToolTab === "trustfiles"
                    ? "bg-slate-800 text-sky-400 border border-slate-700"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                📄 {lang === "ru" ? "Файлы доверия" : "Trust Files"}
              </button>
            </div>
          </div>

          {/* Sub-tab 1: Hosting Config Patch */}
          {devToolTab === "patch" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-slate-400 leading-relaxed">
                  {lang === "ru"
                    ? `Готовый патч заголовков безопасности для ${hostingPatch.label} (${hostingPatch.file}): положите в репозиторий и сделайте деплой.`
                    : `Ready security headers configuration for ${hostingPatch.label} (${hostingPatch.file}): add to repo and deploy.`}
                </p>
                <Button
                  size="sm"
                  onClick={copyPatch}
                  className="bg-sky-400 hover:bg-sky-300 text-[#090d16] font-bold text-xs shrink-0"
                >
                  {patchCopied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                  {patchCopied ? (lang === "ru" ? "Скопировано!" : "Copied!") : (lang === "ru" ? "Копировать конфиг" : "Copy config")}
                </Button>
              </div>
              <pre className="appseal-scroll max-h-[380px] overflow-auto rounded-xl border border-slate-800 bg-[#060911] p-4 font-mono text-[11px] leading-relaxed text-slate-300 select-all">
                {hostingPatch.code}
              </pre>
            </div>
          )}

          {/* Sub-tab 2: CI/CD Pipeline */}
          {devToolTab === "ci" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-slate-400 leading-relaxed">
                  {lang === "ru"
                    ? "GitHub Actions workflow (.github/workflows/appseal.yml): блокирует мердж в продакшен, если качество безопасности ниже класса B."
                    : "GitHub Actions workflow: automatically fails PR checks if the deployment security grade drops below B."}
                </p>
                <Button
                  size="sm"
                  onClick={copyCi}
                  className="bg-sky-400 hover:bg-sky-300 text-[#090d16] font-bold text-xs shrink-0"
                >
                  {ciCopied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                  {ciCopied ? (lang === "ru" ? "Скопировано!" : "Copied!") : (lang === "ru" ? "Копировать YAML" : "Copy YAML")}
                </Button>
              </div>
              <pre className="appseal-scroll max-h-[380px] overflow-auto rounded-xl border border-slate-800 bg-[#060911] p-4 font-mono text-[11px] leading-relaxed text-slate-300 select-all">
                {CI_YAML}
              </pre>
            </div>
          )}

          {/* Sub-tab 3: Trust Files (llms.txt / security.txt) */}
          {devToolTab === "trustfiles" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-400">
                    {lang === "ru" ? "Выберите файл:" : "Select file:"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setGenFile("llms")}
                    className={`rounded-md px-2.5 py-1 text-xs font-bold transition ${
                      genFile === "llms"
                        ? "bg-slate-800 text-sky-400 border border-slate-700"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    llms.txt (для AI-агентов)
                  </button>
                  <button
                    type="button"
                    onClick={() => setGenFile("sec")}
                    className={`rounded-md px-2.5 py-1 text-xs font-bold transition ${
                      genFile === "sec"
                        ? "bg-slate-800 text-sky-400 border border-slate-700"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    security.txt (RFC 9116)
                  </button>
                </div>

                <Button
                  size="sm"
                  onClick={copyGenFile}
                  className="bg-sky-400 hover:bg-sky-300 text-[#090d16] font-bold text-xs shrink-0"
                >
                  {genCopied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                  {genCopied ? (lang === "ru" ? "Скопировано!" : "Copied!") : (lang === "ru" ? "Копировать файл" : "Copy file")}
                </Button>
              </div>
              <pre className="appseal-scroll max-h-[380px] overflow-auto rounded-xl border border-slate-800 bg-[#060911] p-4 font-mono text-[11px] leading-relaxed text-slate-300 select-all">
                {genFile === "llms" ? buildLlmsTxt(scan).content : buildSecurityTxt(scan).content}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Footer navigation links */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 pt-2">
        <div className="flex items-center gap-4">
          <a href="/fixes" className="inline-flex items-center gap-1 font-semibold text-sky-400 hover:text-sky-300">
            <FileCheck2 className="h-3.5 w-3.5" />
            {t(lang, "repFixesCta")} →
          </a>
          <a href={`/versus?a=${encodeURIComponent(scan.host)}`} className="inline-flex items-center gap-1 font-semibold text-slate-400 hover:text-slate-200">
            <Scale className="h-3.5 w-3.5" />
            {t(lang, "repVersusCta")} →
          </a>
        </div>
        <div>
          <a href="/legal" className="underline decoration-slate-700 hover:text-slate-300">
            {lang === "ru" ? "Правила и дисклеймер" : "Terms & Disclaimer"}
          </a>
        </div>
      </div>
    </div>
  );
}
