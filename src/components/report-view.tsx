"use client";

import { useMemo, useState } from "react";
import type { CheckResult, ScanResult, CategoryId, Lang, Grade } from "@/lib/scanner/types";
import { CATEGORY_META, SEVERITY_ORDER } from "@/lib/scanner/types";
import { getTrophyPath, GRADE_META, SEVERITY_META, STATUS_LABEL } from "@/lib/scanner/grade";
import { buildFixPrompt } from "@/lib/fix-prompt";
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
  Download, RotateCcw, Copy, Check, ChevronDown, KeyRound, ShieldHeaders, Lock, Activity,
} from "@/components/icons/appseal-icons";

const CAT_ICONS: Record<CategoryId, React.ReactNode> = {
  secrets: <KeyRound className="h-4 w-4" />,
  headers: <ShieldHeaders className="h-4 w-4" />,
  admin: <Lock className="h-4 w-4" />,
  liveness: <Activity className="h-4 w-4" />,
};

function StatusIcon({ s }: { s: CheckResult["status"] }) {
  const cls = "h-4 w-4 shrink-0";
  if (s === "pass") return <CheckCircle2 className={`${cls} text-emerald-400`} />;
  if (s === "fail") return <XCircle className={`${cls} text-red-500`} />;
  if (s === "warn") return <AlertTriangle className={`${cls} text-amber-500`} />;
  if (s === "info") return <Info className={`${cls} text-slate-500`} />;
  return <MinusCircle className={`${cls} text-slate-600`} />;
}

function TrophyHero({ grade, score }: { grade: Grade; score: number }) {
  const meta = GRADE_META[grade] ?? GRADE_META["E"];
  const trophyPath = getTrophyPath(grade);

  return (
    <div className="relative flex h-32 w-32 shrink-0 items-center justify-center" aria-label={`grade ${grade} score ${score}`}>
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
        className="relative z-10 h-28 w-28 object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.7)] transition-transform duration-300 hover:scale-105"
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

function CheckRow({ r, lang }: { r: CheckResult; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const sev = SEVERITY_META[r.severity];
  const showFinding = r.finding && (r.status === "fail" || r.status === "warn" || r.status === "info");
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg border border-slate-800 bg-[#111827]">
        <CollapsibleTrigger
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
          aria-expanded={open}
        >
          <StatusIcon s={r.status} />
          <span className="flex-1 text-sm font-medium text-slate-100">
            {r.title[lang]}
          </span>
          {(r.status === "fail" || r.status === "warn") && (
            <Badge
              variant="outline"
              className="border-none text-[10px] font-bold uppercase tracking-wider"
              style={{ color: sev.color, backgroundColor: `${sev.color}1a` }}
            >
              {sev.label[lang]}
            </Badge>
          )}
          {r.status !== "fail" && r.status !== "warn" && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {STATUS_LABEL[r.status][lang]}
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        {showFinding && (
          <CollapsibleContent>
            <div className="border-t border-slate-800 px-4 py-3">
              <p className="text-[13px] leading-relaxed text-slate-300">
                {r.finding!.detail[lang]}
              </p>
              {r.finding!.evidence.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {t(lang, "evidence")}
                  </p>
                  <pre className="appseal-scroll max-h-40 overflow-auto rounded-md bg-[#090d16] p-3 font-mono text-[11px] leading-relaxed text-slate-300">
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
}: {
  scan: ScanResult;
  lang: Lang;
  onReset: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [badgeFormat, setBadgeFormat] = useState<"trophy" | "shield">("trophy");

  const fails = scan.results.filter((r) => r.status === "fail").length;
  const warns = scan.results.filter((r) => r.status === "warn").length;
  const passes = scan.results.filter((r) => r.status === "pass").length;
  const gm = GRADE_META[scan.grade] ?? GRADE_META["E"];

  const byCategory = useMemo(() => {
    const order: CategoryId[] = ["secrets", "headers", "admin", "liveness"];
    return order.map((cat) => ({
      cat,
      items: scan.results
        .filter((r) => r.category === cat)
        .sort((a, b) => {
          const rank = (r: CheckResult) =>
            r.status === "fail" ? 0 : r.status === "warn" ? 1 : r.status === "info" ? 3 : 2;
          return (
            rank(a) - rank(b) ||
            SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
            b.penalty - a.penalty
          );
        }),
    }));
  }, [scan.results]);

  // absolute URLs: the embed lives on foreign sites, relative paths break there
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const embedCode = useMemo(() => {
    if (badgeFormat === "trophy") {
      return `<a href="${origin}/?report=${scan.id}" target="_blank" rel="noopener" title="AppSeal Security Verified: Grade ${scan.grade} (${scan.score}/100)"><img src="${origin}/api/badge?id=${scan.id}&style=trophy" alt="AppSeal Verified: Grade ${scan.grade}" width="80" height="80" style="filter: drop-shadow(0 4px 12px rgba(0,0,0,0.3));" /></a>`;
    }
    return `<a href="${origin}/?report=${scan.id}" target="_blank" rel="noopener"><img src="${origin}/api/badge?id=${scan.id}" alt="AppSeal ${scan.grade}" width="168" height="44"></a>`;
  }, [badgeFormat, origin, scan.id, scan.grade, scan.score]);

  const fixPrompt = useMemo(() => buildFixPrompt(scan, lang), [scan, lang]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(fixPrompt);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="w-full">
      {/* header card with 3D trophy */}
      <div className="flex flex-col items-start gap-6 rounded-2xl border border-slate-800 bg-[#111827] p-6 sm:flex-row sm:items-center sm:p-8">
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
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold" style={{ color: gm.color }}>
              {gm.label[lang]}
            </span>
            {scan.platform && (
              <Badge variant="secondary" className="bg-slate-800 text-slate-300">
                {t(lang, "platform")}: {scan.platform}
              </Badge>
            )}
            {scan.isDemo && (
              <Badge className="bg-amber-500/15 text-amber-400" variant="secondary">
                DEMO
              </Badge>
            )}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-400 max-w-xl">
            {gm.description[lang]}
          </p>
          <p className="mt-3 text-[13px] text-slate-400">
            {t(lang, "summaryChecks")} {scan.results.length} ·{" "}
            <span className="text-red-400">{fails} {t(lang, "summaryFailed")}</span> ·{" "}
            <span className="text-amber-400">{warns} {t(lang, "summaryWarns")}</span> ·{" "}
            <span className="text-emerald-400">{passes} {t(lang, "summaryPassed")}</span>
          </p>
          {scan.isDemo && (
            <p className="mt-2 text-xs text-amber-400/80">{t(lang, "demoNote")}</p>
          )}
        </div>
      </div>

      {fails === 0 && warns === 0 && (
        <div className="mt-6 rounded-xl border border-emerald-900/50 bg-emerald-400/5 p-5 text-sm leading-relaxed text-emerald-300">
          {t(lang, "allGood")}
        </div>
      )}

      {/* actions */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button asChild className="bg-sky-400 text-[#090d16] hover:bg-sky-300">
          <a href={`/api/report?id=${scan.id}`} download>
            <Download className="h-4 w-4" />
            {t(lang, "downloadPdf")}
          </a>
        </Button>
        <Button variant="outline" onClick={onReset} className="border-slate-700 text-slate-300 hover:bg-slate-800">
          <RotateCcw className="h-4 w-4" />
          {t(lang, "rescan")}
        </Button>
      </div>

      {/* AI-fix prompt */}
      {fails + warns > 0 && (
        <Collapsible open={promptOpen} onOpenChange={setPromptOpen}>
          <div className="mt-6 rounded-xl border border-sky-900/50 bg-sky-500/5 p-5">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-sky-300">{t(lang, "fixPromptTitle")}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{t(lang, "fixPromptCopy")}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={copyPrompt}
                className="shrink-0 border-sky-800 text-sky-300 hover:bg-sky-900/30"
              >
                {promptCopied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                {promptCopied ? t(lang, "copied") : t(lang, "fixPromptBtn")}
              </Button>
            </div>
            <CollapsibleContent>
              <pre className="appseal-scroll mt-3 max-h-96 overflow-auto rounded-md bg-[#090d16] p-3 font-mono text-[11px] leading-relaxed text-slate-400">
                {fixPrompt}
              </pre>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}

      {/* badge embed */}
      <div className="mt-6 rounded-xl border border-slate-800 bg-[#111827] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-200">{t(lang, "badgeTitle")}</p>
            <p className="text-xs text-slate-500">{t(lang, "badgeCopy")}</p>
          </div>
          {/* Format switcher tabs */}
          <div className="flex rounded-lg border border-slate-800 bg-[#090d16] p-0.5 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setBadgeFormat("trophy")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                badgeFormat === "trophy"
                  ? "bg-sky-400 text-[#090d16] shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>🏆</span>
              <span>{t(lang, "badgeTrophyTab")}</span>
            </button>
            <button
              type="button"
              onClick={() => setBadgeFormat("shield")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                badgeFormat === "shield"
                  ? "bg-sky-400 text-[#090d16] shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>🛡</span>
              <span>{t(lang, "badgeShieldTab")}</span>
            </button>
          </div>
        </div>

        {/* Live Badge Preview and Copy Area */}
        <div className="mt-4 flex flex-col items-center gap-5 rounded-lg border border-slate-800/80 bg-[#090d16]/70 p-4 sm:flex-row">
          <div className="flex min-w-[130px] items-center justify-center p-2">
            {badgeFormat === "trophy" ? (
              <div className="group relative flex items-center justify-center">
                <div
                  className="absolute inset-0 rounded-full blur-xl opacity-30 transition-opacity group-hover:opacity-60"
                  style={{ backgroundColor: gm.color }}
                />
                <img
                  src={gm.trophy}
                  alt={`AppSeal ${scan.grade}`}
                  width={80}
                  height={80}
                  className="relative z-10 h-20 w-20 object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.6)]"
                />
              </div>
            ) : (
              <img
                src={`/api/badge?id=${scan.id}`}
                alt={`AppSeal ${scan.grade}`}
                width={168}
                height={44}
                className="rounded"
              />
            )}
          </div>

          <div className="min-w-0 flex-1 w-full">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-400">
                {badgeFormat === "trophy"
                  ? "HTML-код для вставки 3D-значка (footer/header вашего сайта):"
                  : "HTML-код для вставки компактного бейджа:"}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={copy}
                className="h-7 border-slate-700 text-xs text-slate-300 hover:bg-slate-800"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? t(lang, "copied") : t(lang, "copyBtn")}
              </Button>
            </div>
            <pre className="appseal-scroll select-all overflow-x-auto rounded-md border border-slate-800/70 bg-[#090d16] p-3 font-mono text-[11px] leading-relaxed text-slate-300">
              {embedCode}
            </pre>
          </div>
        </div>
      </div>

      {/* findings by category */}
      <h3 className="font-display mt-8 text-lg font-bold text-slate-100">
        {t(lang, "findingsTitle")}
      </h3>
      <div className="mt-4 space-y-8">
        {byCategory.map(({ cat, items }) => (
          <section key={cat} aria-label={CATEGORY_META[cat].title[lang]}>
            <div className="mb-3 flex items-center gap-2 text-slate-300">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-800">
                {CAT_ICONS[cat]}
              </span>
              <h4 className="text-sm font-bold uppercase tracking-wider">
                {CATEGORY_META[cat].title[lang]}
              </h4>
              <span className="text-xs text-slate-600">
                {items.filter((i) => i.status === "pass").length}/{items.length}
              </span>
            </div>
            <div className="space-y-2">
              {items.map((r) => (
                <CheckRow key={r.id} r={r} lang={lang} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
