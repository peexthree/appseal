"use client";

import { useMemo, useState } from "react";
import type { CheckResult, ScanResult, CategoryId, Lang } from "@/lib/scanner/types";
import { CATEGORY_META, SEVERITY_ORDER } from "@/lib/scanner/types";
import { GRADE_META, SEVERITY_META, STATUS_LABEL } from "@/lib/scanner/grade";
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
  Download, RotateCcw, Copy, Check, ChevronDown, KeyRound, ShieldCheck, Lock, Activity,
} from "lucide-react";

const CAT_ICONS: Record<CategoryId, React.ReactNode> = {
  secrets: <KeyRound className="h-4 w-4" />,
  headers: <ShieldCheck className="h-4 w-4" />,
  admin: <Lock className="h-4 w-4" />,
  liveness: <Activity className="h-4 w-4" />,
};

function StatusIcon({ s }: { s: CheckResult["status"] }) {
  const cls = "h-4 w-4 shrink-0";
  if (s === "pass") return <CheckCircle2 className={`${cls} text-emerald-500`} />;
  if (s === "fail") return <XCircle className={`${cls} text-red-500`} />;
  if (s === "warn") return <AlertTriangle className={`${cls} text-amber-500`} />;
  if (s === "info") return <Info className={`${cls} text-zinc-500`} />;
  return <MinusCircle className={`${cls} text-zinc-600`} />;
}

function GradeRing({ grade, score }: { grade: string; score: number }) {
  const color = GRADE_META[grade as "A" | "B" | "C" | "D"]?.color ?? "#6b7280";
  const R = 52;
  const CIRC = 2 * Math.PI * R;
  const filled = (score / 100) * CIRC;
  return (
    <div className="relative h-32 w-32 shrink-0" aria-label={`grade ${grade} score ${score}`}>
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
        <circle cx="64" cy="64" r={R} fill="none" stroke="#23262c" strokeWidth="11" />
        <circle
          cx="64" cy="64" r={R} fill="none"
          stroke={color} strokeWidth="11" strokeLinecap="round"
          strokeDasharray={`${filled} ${CIRC - filled}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-4xl font-extrabold" style={{ color }}>{grade}</span>
        <span className="text-xs text-zinc-400">{score}/100</span>
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
      <div className="rounded-lg border border-zinc-800 bg-[#101318]">
        <CollapsibleTrigger
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
          aria-expanded={open}
        >
          <StatusIcon s={r.status} />
          <span className="flex-1 text-sm font-medium text-zinc-100">
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
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              {STATUS_LABEL[r.status][lang]}
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        {showFinding && (
          <CollapsibleContent>
            <div className="border-t border-zinc-800 px-4 py-3">
              <p className="text-[13px] leading-relaxed text-zinc-300">
                {r.finding!.detail[lang]}
              </p>
              {r.finding!.evidence.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    {t(lang, "evidence")}
                  </p>
                  <pre className="appmot-scroll max-h-40 overflow-auto rounded-md bg-[#0a0c10] p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
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
  const fails = scan.results.filter((r) => r.status === "fail").length;
  const warns = scan.results.filter((r) => r.status === "warn").length;
  const passes = scan.results.filter((r) => r.status === "pass").length;
  const gm = GRADE_META[scan.grade];

  const byCategory = useMemo(() => {
    const order: CategoryId[] = ["secrets", "headers", "admin", "liveness"];
    return order.map((cat) => ({
      cat,
      items: scan.results
        .filter((r) => r.category === cat)
        .sort((a, b) => {
          const rank = (r: CheckResult) =>
            r.status === "fail" ? 0 : r.status === "warn" ? 1 : r.status === "info" ? 3 : 2;
          return rank(a) - rank(b) || SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
        }),
    }));
  }, [scan.results]);

  const embedCode = `<a href="?report=${scan.id}" target="_blank" rel="noopener"><img src="/api/badge?id=${scan.id}" alt="AppMOT ${scan.grade}" width="132" height="40"></a>`;
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
      {/* header card */}
      <div className="flex flex-col items-start gap-6 rounded-2xl border border-zinc-800 bg-[#0f1216] p-6 sm:flex-row sm:items-center sm:p-8">
        <GradeRing grade={scan.grade} score={scan.score} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
            {t(lang, "gradeTitle")}
          </p>
          <h2 className="font-display mt-1 truncate text-2xl font-bold text-zinc-50">
            {scan.host}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: gm.color }}>
              {gm.label[lang]}
            </span>
            {scan.platform && (
              <Badge variant="secondary" className="bg-zinc-800 text-zinc-300">
                {t(lang, "platform")}: {scan.platform}
              </Badge>
            )}
            {scan.isDemo && (
              <Badge className="bg-amber-500/15 text-amber-400" variant="secondary">
                DEMO
              </Badge>
            )}
          </div>
          <p className="mt-3 text-[13px] text-zinc-400">
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
        <div className="mt-6 rounded-xl border border-emerald-900/50 bg-emerald-500/5 p-5 text-sm leading-relaxed text-emerald-300">
          {t(lang, "allGood")}
        </div>
      )}

      {/* actions */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button asChild className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
          <a href={`/api/report?id=${scan.id}`} download>
            <Download className="h-4 w-4" />
            {t(lang, "downloadPdf")}
          </a>
        </Button>
        <Button variant="outline" onClick={onReset} className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
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
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">{t(lang, "fixPromptCopy")}</p>
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
              <pre className="appmot-scroll mt-3 max-h-96 overflow-auto rounded-md bg-[#0a0c10] p-3 font-mono text-[11px] leading-relaxed text-zinc-400">
                {fixPrompt}
              </pre>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}

      {/* badge embed */}
      <div className="mt-6 rounded-xl border border-zinc-800 bg-[#0f1216] p-5">
        <div className="flex items-center gap-3">
          <img
            src={`/api/badge?id=${scan.id}`}
            alt={`AppMOT ${scan.grade}`}
            width={132}
            height={40}
            className="rounded"
          />
          <div className="flex-1">
            <p className="text-sm font-semibold text-zinc-200">{t(lang, "badgeTitle")}</p>
            <p className="text-xs text-zinc-500">{t(lang, "badgeCopy")}</p>
          </div>
          <Button size="sm" variant="outline" onClick={copy} className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            {copied ? t(lang, "copied") : t(lang, "copyBtn")}
          </Button>
        </div>
        <pre className="appmot-scroll mt-3 overflow-x-auto rounded-md bg-[#0a0c10] p-3 font-mono text-[11px] text-zinc-400">
          {embedCode}
        </pre>
      </div>

      {/* findings by category */}
      <h3 className="font-display mt-8 text-lg font-bold text-zinc-100">
        {t(lang, "findingsTitle")}
      </h3>
      <div className="mt-4 space-y-8">
        {byCategory.map(({ cat, items }) => (
          <section key={cat} aria-label={CATEGORY_META[cat].title[lang]}>
            <div className="mb-3 flex items-center gap-2 text-zinc-300">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-800">
                {CAT_ICONS[cat]}
              </span>
              <h4 className="text-sm font-bold uppercase tracking-wider">
                {CATEGORY_META[cat].title[lang]}
              </h4>
              <span className="text-xs text-zinc-600">
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
