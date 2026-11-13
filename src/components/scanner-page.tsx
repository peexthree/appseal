"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion } from "framer-motion";
import type { Lang, ScanResult, Grade } from "@/lib/scanner/types";
import { CATEGORY_META } from "@/lib/scanner/types";
import { GRADE_META, getTrophyPath } from "@/lib/scanner/grade";
import { t, list } from "@/lib/i18n";
import { ReportView } from "@/components/report-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldCheck, ShieldHeaders, Zap, FileCheck2, KeyRound, ShieldAlert, Lock, Activity, ArrowRight, Globe, Check, Copy, Send } from "@/components/icons/appseal-icons";

type Phase = "form" | "scanning" | "report" | "error";

/** exact check counts per category - from the engine, demo scan = 97 total */
const CHECK_CATEGORIES = [
  {
    icon: <KeyRound className="h-5 w-5" />,
    key: "secrets" as const,
    count: { ru: "21 сигнатура", en: "21 signatures" },
    extra: {
      ru: "+ ещё 17 проверок: git config, .svn/.hg, .DS_Store, Firebase, Supabase, манифесты, security.txt, source maps, сигнатуры AI-ключей (OpenAI, Anthropic), AWS, Stripe, Telegram Bot Token, crypto, generic",
      en: "+ 17 more checks: git config, .svn/.hg, .DS_Store, Firebase, Supabase, manifests, security.txt, source maps, AI key signatures (OpenAI, Anthropic), AWS, Stripe, Telegram Bot Token, crypto, generic",
    },
    items: {
      ru: "Открытые .env и .git|Ключи API в клиентском JS|Firebase/Supabase без правил|Дампы и бэкапы по прямой ссылке",
      en: "Open .env and .git|API keys in client JS|Firebase/Supabase with no rules|Dumps and backups at direct URLs",
    },
  },
  {
    icon: <ShieldHeaders className="h-5 w-5" />,
    key: "headers" as const,
    count: { ru: "26 правил", en: "26 rules" },
    extra: {
      ru: "+ ещё 22 проверки: COOP/COEP/CORP, срок TLS, цепочка редиректов, HTTPS-редирект, сжатие, cookie-флаги по одному, версия сервера, Permissions-Policy, X-Content-Type-Options, Referrer-Policy",
      en: "+ 22 more checks: COOP/COEP/CORP, TLS expiry, redirect chain, HTTPS redirect, compression, cookie flags one by one, server version, Permissions-Policy, X-Content-Type-Options, Referrer-Policy",
    },
    items: {
      ru: "CSP, HSTS, X-Frame-Options|CORS «для всех»|Протухший TLS-сертификат|Cookie без защитных флагов",
      en: "CSP, HSTS, X-Frame-Options|CORS \"for everyone\"|Expired TLS certificate|Cookies without protective flags",
    },
  },
  {
    icon: <Lock className="h-5 w-5" />,
    key: "admin" as const,
    count: { ru: "27 эндпоинтов", en: "27 endpoints" },
    extra: {
      ru: "+ ещё 23 проверки: swagger/graphql, wp-json users, xmlrpc, Spring actuator, Laravel/ASP.NET/PHP debug, wp-debug/drupal, архивы и дампы, .bak, dir listing, дефолтные страницы",
      en: "+ 23 more checks: swagger/graphql, wp-json users, xmlrpc, Spring actuator, Laravel/ASP.NET/PHP debug, wp-debug/drupal, archives and dumps, .bak, dir listing, default pages",
    },
    items: {
      ru: "Админ-панели на стандартных путях|Отладочные эндпоинты на проде|Бэкапы баз в веб-корне|Доступ без rate limit",
      en: "Admin panels on standard paths|Debug endpoints in production|DB backups in the web root|Access without rate limiting",
    },
  },
  {
    icon: <Activity className="h-5 w-5" />,
    key: "liveness" as const,
    count: { ru: "23 паттерна", en: "23 patterns" },
    extra: {
      ru: "+ ещё 19 проверок: soft-404, ошибки Django/PHP/СУБД в разметке, favicon, OG-теги, mixed content, SRI, версия jQuery, alt у изображений, каноникл",
      en: "+ 19 more checks: soft-404, Django/PHP/DB errors in markup, favicon, OG tags, mixed content, SRI, jQuery version, img alt, canonical",
    },
    items: {
      ru: "Шаблонные фразы и заглушки|Ошибки «undefined» в разметке|Битые внутренние ссылки|Пустые title и description",
      en: "Template phrases and placeholders|\"undefined\" rendered in markup|Broken internal links|Empty title and description",
    },
  },
];

/** one-click demo targets - real past scans, the E one is the deliberately vulnerable fixture */
const DEMO_CHIPS: { target: string; grade: Grade; score: number }[] = [
  { target: "akulenok-tmz.ru", grade: "A", score: 97 },
  { target: "appseal.online", grade: "A+", score: 100 },
  { target: "demo://app", grade: "E", score: 0 },
];

/** the re-scan of the aqua center case (A/97), public verification view */
const CASE_REPORT_ID = "mwehe0wu-6f339614bd";

export function ScannerPage({
  initialScan,
  initialReportKey,
}: {
  initialScan: ScanResult | null;
  /** report key from ?key= - present only for the scan initiator */
  initialReportKey?: string;
}) {
  const [lang, setLang] = useState<Lang>("ru");
  const [phase, setPhase] = useState<Phase>(initialScan ? "report" : "form");
  const [showGrade, setShowGrade] = useState<Grade>("A+");
  const [caseCopied, setCaseCopied] = useState(false);
  const [url, setUrl] = useState("");
  const [consent, setConsent] = useState(true);
  const [scanId, setScanId] = useState<string | null>(null);
  const [rkey, setRkey] = useState<string | null>(initialReportKey ?? null);
  const [scan, setScan] = useState<ScanResult | null>(initialScan);
  const [error, setError] = useState("");
  const [quotaHit, setQuotaHit] = useState(false);
  const [passInfo, setPassInfo] = useState<{ host: string; until: string } | null>(null);
  const [paidPending, setPaidPending] = useState(false);
  const [lpHost, setLpHost] = useState("");
  const [lpBusy, setLpBusy] = useState(false);
  const [lpErr, setLpErr] = useState("");
  const [booting, setBooting] = useState(true);
  const [bootPct, setBootPct] = useState(0);
  const [bootStage, setBootStage] = useState(0);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("appseal-lang") : null;
    if (saved === "ru" || saved === "en") {
      setLang(saved);
    } else if (typeof navigator !== "undefined" && !navigator.language.toLowerCase().startsWith("ru")) {
      setLang("en");
    }
  }, []);

  const switchLang = (l: Lang) => {
    setLang(l);
    try {
      localStorage.setItem("appseal-lang", l);
    } catch {
      /* private mode */
    }
  };

  // playful fake boot: 1.2s splash with a progress bar, once per page load.
  // skipped entirely for reduced-motion users
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setBooting(false);
      return;
    }
    const ctrl = animate(0, 100, { duration: 1.1, ease: "easeInOut", onUpdate: (v) => setBootPct(Math.round(v)) });
    const stages = setInterval(() => setBootStage((s) => (s + 1) % 3), 360);
    const done = setTimeout(() => setBooting(false), 1350);
    return () => {
      ctrl.stop();
      clearInterval(stages);
      clearTimeout(done);
    };
  }, []);

  const startScan = useCallback(async (target: string) => {
    setError("");
    setQuotaHit(false);
    setScan(null);
    setScanId(null);
    setPhase("scanning");
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: target, lang }),
      });
      if (res.status === 429) {
        setQuotaHit(true);
        setPhase("error");
        return;
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const { id, rkey: rk } = (await res.json()) as { id: string; rkey?: string };
      setScanId(id);
      setRkey(rk ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }, [lang]);

  // returning from YooKassa: /?paid=<nonce> -> resolve the payment, show the pass
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const nonce = sp.get("paid");
    if (!nonce) return;
    try {
      history.replaceState(null, "", "/");
    } catch {
      /* keep the query on older browsers */
    }
    const check = async () => {
      try {
        const res = await fetch(`/api/purchase?nonce=${encodeURIComponent(nonce)}`, { cache: "no-store" });
        const d = (await res.json()) as { status?: string; host?: string; until?: string };
        if (d.status === "succeeded" && d.host) {
          setPassInfo({ host: d.host, until: d.until ?? "" });
        } else if (d.status) {
          setPaidPending(true);
        }
      } catch {
        /* network hiccup: the webhook still activates the pass server-side */
      }
    };
    void check();
  }, []);

  const buyPass = async () => {
    setLpErr("");
    const host = lpHost.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/^www\./i, "");
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(host)) {
      setLpErr(t(lang, "lpDomainBad"));
      return;
    }
    setLpBusy(true);
    try {
      const nonce = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      const res = await fetch("/api/purchase", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ host, nonce, lang }),
      });
      const d = (await res.json().catch(() => ({}))) as { confirmationUrl?: string; error?: string };
      if (!res.ok || !d.confirmationUrl) {
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      window.location.href = d.confirmationUrl;
    } catch (e) {
      setLpErr(`${t(lang, "lpErr")}${e instanceof Error ? e.message : String(e)}`);
      setLpBusy(false);
    }
  };

  useEffect(() => {
    if (!scanId) return;
    let alive = true;
    const tick = async () => {
      try {
        // the report key keeps this session on the full record; without it
        // the server downgrades a finished scan to the public view
        const res = await fetch(`/api/scan/${scanId}${rkey ? `?key=${rkey}` : ""}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("poll failed");
        const data = (await res.json()) as ScanResult;
        if (!alive) return;
        if (data.status === "done") {
          setScan(data);
          setPhase("report");
          setTimeout(() => reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
          return;
        }
        if (data.status === "error") {
          setError(data.error?.[lang] ?? "scan error");
          setPhase("error");
          return;
        }
        setScan(data);
        setTimeout(tick, 1300);
      } catch {
        if (alive) setTimeout(tick, 2500);
      }
    };
    void tick();
    return () => {
      alive = false;
    };
  }, [scanId, lang, rkey]);

  const reset = () => {
    setPhase("form");
    setScan(null);
    setScanId(null);
    setRkey(null);
    setUrl("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#090d16] text-slate-100">
      {/* fake boot splash: playful SaaS-style loader, ~1.2s */}
      <AnimatePresence>
        {booting && (
          <motion.div
            key="boot"
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-[#090d16]"
          >
            <div className="w-64 text-center">
              <motion.img
                src="/ico.svg"
                alt=""
                width={56}
                height={56}
                animate={{ scale: [1, 1.08, 1], opacity: [0.8, 1, 0.8] }}
                transition={{ repeat: Infinity, duration: 1.15 }}
                className="mx-auto h-14 w-14 object-contain drop-shadow-[0_0_26px_rgba(56,189,248,0.45)]"
              />
              <p className="font-display mt-4 text-lg font-extrabold tracking-tight text-slate-100">AppSeal</p>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-sky-400 transition-all duration-150" style={{ width: `${bootPct}%` }} />
              </div>
              <p className="mt-2 font-mono text-[11px] text-slate-500">
                {bootStage === 0 ? t(lang, "bootStage1") : bootStage === 1 ? t(lang, "bootStage2") : t(lang, "bootStage3")} {bootPct}%
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* header */}
      <header className="sticky top-0 z-40 bg-[#090d16]/75 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <a href="/" className="group flex items-center gap-2.5" aria-label="AppSeal home">
            <img
              src="/ico.svg"
              alt="AppSeal"
              width={28}
              height={28}
              className="h-7 w-7 object-contain drop-shadow-[0_0_10px_rgba(56,189,248,0.45)] transition-transform group-hover:scale-110"
            />
            <span className="font-display text-lg font-extrabold tracking-tight">AppSeal</span>
          </a>
          <nav className="hidden items-center gap-1 sm:flex" aria-label="Site">
            {[
              { href: "/registry", label: t(lang, "navRegistry") },
              { href: "#pricing", label: t(lang, "navPricing") },
              { href: "/legal", label: t(lang, "navLegal") },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-400 transition hover:bg-slate-800/70 hover:text-slate-100"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2.5">
            <a
              href="/?report=mweys4fr-0d7b05c638"
              target="_blank"
              rel="noopener"
              title="AppSeal Security Verified: Grade A+ (100/100)"
              className="hidden items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] font-bold text-emerald-400 transition hover:border-emerald-400/60 md:inline-flex"
            >
              <span className="appseal-pulse h-1.5 w-1.5 rounded-full bg-emerald-400" />
              A+ · 100
            </a>
            <nav className="flex items-center rounded-full border border-slate-800 bg-slate-900/60 p-0.5" aria-label="Language">
              {(["ru", "en"] as Lang[]).map((l) => (
                <button
                  key={l}
                  onClick={() => switchLang(l)}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase transition ${
                    lang === l ? "bg-sky-400 text-[#090d16]" : "text-slate-500 hover:text-slate-300"
                  }`}
                  aria-pressed={lang === l}
                >
                  {l}
                </button>
              ))}
            </nav>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-emerald-400/30 via-sky-500/60 to-purple-500/30" />
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 sm:px-6">
        {/* Launch Pass status (returning from YooKassa) */}
        {(passInfo || paidPending) && (
          <div
            className={`mx-auto mb-2 mt-4 max-w-3xl rounded-xl border p-4 text-sm leading-relaxed ${
              passInfo
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-amber-500/40 bg-amber-500/10 text-amber-300"
            }`}
            role="status"
          >
            {passInfo ? (
              <>
                <span className="font-bold">{t(lang, "paidOk")}</span> {passInfo.host}{" "}
                {t(lang, "paidUntil")}{" "}
                {new Date(passInfo.until).toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US")}
              </>
            ) : (
              t(lang, "paidPending")
            )}
          </div>
        )}

        {/* hero + scanner */}
        <section
          className="appmot-grid relative pb-14 pt-14 sm:pt-20"
          aria-label="Scanner"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(56,189,248,0.12), transparent 70%)",
          }}
        >
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-400">
              {t(lang, "tagline")}
            </p>
            <h1 className="font-display mt-4 text-4xl font-extrabold leading-tight tracking-tight text-slate-50 sm:text-5xl">
              {t(lang, "heroTitle")}{" "}
              <span className="text-sky-400">{t(lang, "heroTitleAccent")}</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-slate-400">
              {t(lang, "heroSub")}
            </p>
          </div>

          {phase === "form" && (
            <div className="mx-auto mt-8 max-w-2xl">
              <form
                className="flex flex-col gap-3 sm:flex-row"
                style={{ filter: "drop-shadow(0 0 24px rgba(56,189,248,0.22))" }}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (url.trim() && consent) void startScan(url.trim());
                }}
              >
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={t(lang, "inputPlaceholder")}
                  className="h-12 flex-1 border-slate-700 bg-[#111827] text-base text-slate-100 placeholder:text-slate-500"
                  inputMode="url"
                  aria-label="App URL"
                  required
                />
                <Button
                  type="submit"
                  disabled={!consent}
                  className="h-12 bg-sky-400 px-6 text-base font-bold text-[#090d16] shadow-[0_0_30px_-5px_rgba(56,189,248,0.5)] hover:bg-sky-300 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Zap className="h-4 w-4" />
                  {t(lang, "scanBtn")}
                </Button>
              </form>

              {/* Consent & legal checkbox (152-FZ & passive scan notice) */}
              <label className="mt-3.5 flex items-start gap-2.5 text-left cursor-pointer select-none px-1">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-[#111827] text-sky-400 accent-sky-400 focus:ring-sky-400"
                />
                <span className="text-[12px] leading-relaxed text-slate-400">
                  {lang === "ru"
                    ? "Запуская проверку, вы подтверждаете, что являетесь владельцем/разработчиком ресурса или действуете с его разрешения. Скан выполняется в пассивном режиме чтения публичных HTTP-ответов."
                    : "By starting the scan, you confirm that you are the owner/developer of the resource or have authorization. The scan runs in passive mode reading public HTTP responses."}
                </span>
              </label>

              {/* one-click demo scans: real past results, no typing needed */}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <span className="text-[11px] font-semibold text-slate-500">{t(lang, "demoChipsTitle")}</span>
                {DEMO_CHIPS.map((c) => (
                  <button
                    key={c.target}
                    onClick={() => void startScan(c.target)}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-[#111827] px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:bg-slate-800"
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: GRADE_META[c.grade].color }} />
                    <span className="font-mono">{c.target}</span>
                    <span className="font-mono font-bold" style={{ color: GRADE_META[c.grade].color }}>
                      {c.grade} · {c.score}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* interactive grade showcase: the trophy changes glow per rank */}
          {phase === "form" && (
            <div className="mx-auto mt-6 max-w-2xl rounded-2xl border border-slate-800 bg-[#111827]/70 p-5 sm:p-6">
              <p className="text-center text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                {t(lang, "showcaseHint")}
              </p>
              <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:gap-6">
                <motion.img
                  key={showGrade}
                  src={getTrophyPath(showGrade)}
                  alt={`AppSeal grade ${showGrade}`}
                  width={112}
                  height={112}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1, filter: `drop-shadow(0 0 22px ${GRADE_META[showGrade].color}66)` }}
                  transition={{ duration: 0.35 }}
                  className="h-28 w-28 shrink-0 object-contain"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap justify-center gap-1.5 sm:justify-start">
                    {(["A+", "A", "B", "C", "D", "E"] as Grade[]).map((g) => {
                      const m = GRADE_META[g];
                      const active = g === showGrade;
                      return (
                        <button
                          key={g}
                          onClick={() => setShowGrade(g)}
                          className="rounded-lg border px-2.5 py-1 font-display text-sm font-extrabold transition"
                          style={
                            active
                              ? { color: m.color, borderColor: `${m.color}66`, backgroundColor: `${m.color}14` }
                              : { color: "#64748b", borderColor: "rgba(30,41,59,0.8)" }
                          }
                          aria-pressed={active}
                        >
                          {g}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-sm font-bold" style={{ color: GRADE_META[showGrade].color }}>
                    {GRADE_META[showGrade].label[lang]}
                    <span className="ml-2 font-mono text-xs text-slate-500">
                      {GRADE_META[showGrade].minScore}-{GRADE_META[showGrade].maxScore}
                    </span>
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">{GRADE_META[showGrade].description[lang]}</p>
                </div>
              </div>
            </div>
          )}

          {phase === "scanning" && (
            <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-slate-800 bg-[#111827] p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <span className="appseal-pulse flex h-3 w-3 rounded-full bg-sky-400" />
                <p className="font-semibold text-slate-100">{t(lang, "scanning")}</p>
                <span className="ml-auto font-mono text-sm text-sky-400">{scan?.progress ?? 0}%</span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-sky-400 transition-all duration-500"
                  style={{ width: `${scan?.progress ?? 4}%` }}
                />
              </div>
              <p className="mt-3 text-sm text-slate-400">
                {scan?.stage?.[lang] ?? "…"}{" "}
                <span className="font-mono text-slate-500">{url ? url.replace(/^https?:\/\//, "") : "demo-app"}</span>
              </p>
              {/* live radar: categories click through as the scan advances */}
              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { key: "secrets" as const, from: 8, to: 34, Icon: KeyRound },
                  { key: "headers" as const, from: 34, to: 56, Icon: ShieldHeaders },
                  { key: "admin" as const, from: 56, to: 78, Icon: Lock },
                  { key: "liveness" as const, from: 78, to: 100, Icon: Activity },
                ].map((c) => {
                  const p = scan?.progress ?? 0;
                  const state = p >= c.to ? "done" : p >= c.from ? "active" : "wait";
                  return (
                    <motion.div
                      key={c.key}
                      animate={{
                        borderColor: state === "done" ? "rgba(52,211,153,0.6)" : state === "active" ? "rgba(56,189,248,0.45)" : "rgba(30,41,59,0.8)",
                        backgroundColor: state === "done" ? "rgba(52,211,153,0.06)" : "rgba(17,24,39,1)",
                      }}
                      className="flex items-center gap-2 rounded-lg border px-3 py-2.5"
                      aria-label={CATEGORY_META[c.key].title[lang]}
                    >
                      <span className={state === "done" ? "text-emerald-400" : state === "active" ? "text-sky-400 appseal-pulse" : "text-slate-600"}>
                        <c.Icon size={14} radarState={state} />
                      </span>
                      <span className={`truncate text-[11px] font-semibold ${state === "wait" ? "text-slate-600" : "text-slate-200"}`}>
                        {CATEGORY_META[c.key].title[lang]}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {phase === "error" && quotaHit ? (
            <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-amber-900/60 bg-amber-500/5 p-6 text-center">
              <Zap className="mx-auto h-8 w-8 text-amber-400" />
              <p className="mt-3 font-semibold text-amber-300">{t(lang, "quotaTitle")}</p>
              <p className="mt-1 text-sm text-slate-400">{t(lang, "quotaText")}</p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                <Button
                  className="bg-indigo-500 text-white hover:bg-indigo-400"
                  onClick={() => {
                    setPhase("form");
                    document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  <Zap className="h-4 w-4" />
                  {t(lang, "quotaCta")}
                </Button>
                <Button variant="outline" onClick={reset} className="border-slate-700 text-slate-300 hover:bg-slate-800">
                  {t(lang, "rescan")}
                </Button>
              </div>
            </div>
          ) : phase === "error" ? (
            <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-red-900/60 bg-red-500/5 p-6 text-center">
              <ShieldAlert className="mx-auto h-8 w-8 text-red-400" />
              <p className="mt-3 font-semibold text-red-300">{t(lang, "errTitle")}</p>
              <p className="mt-1 break-words text-sm text-slate-400">{error}</p>
              <Button variant="outline" onClick={reset} className="mt-4 border-slate-700 text-slate-300 hover:bg-slate-800">
                {t(lang, "rescan")}
              </Button>
            </div>
          ) : null}

          <div ref={reportRef} className={phase === "report" ? "mt-10 scroll-mt-20" : ""}>
            {phase === "report" && scan && (
              <ReportView scan={scan} lang={lang} onReset={reset} reportKey={rkey ?? undefined} />
            )}
          </div>
        </section>

        {/* stats */}
        <section className="border-t border-slate-800/70 py-14" aria-label={t(lang, "statsTitle")}>
          <h2 className="font-display text-center text-2xl font-bold text-slate-100">
            {t(lang, "statsTitle")}
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              { n: "45%", s: t(lang, "stat1") },
              { n: "40%", s: t(lang, "stat2") },
              { n: "1.3M", s: t(lang, "stat3") },
            ].map((x) => (
              <div key={x.n} className="rounded-2xl border border-slate-800 bg-[#111827] p-6 text-center">
                <p className="font-display text-4xl font-extrabold text-sky-400">{x.n}</p>
                <p className="mt-2 text-[13px] leading-relaxed text-slate-400">{x.s}</p>
              </div>
            ))}
          </div>
        </section>

        {/* how it works */}
        <section className="border-t border-slate-800/70 py-14" aria-label={t(lang, "howTitle")}>
          <h2 className="font-display text-center text-2xl font-bold text-slate-100">
            {t(lang, "howTitle")}
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              { icon: <Globe className="h-5 w-5" />, n: "01", ti: t(lang, "how1Title"), tx: t(lang, "how1Text") },
              { icon: <Zap className="h-5 w-5" />, n: "02", ti: t(lang, "how2Title"), tx: t(lang, "how2Text") },
              { icon: <FileCheck2 className="h-5 w-5" />, n: "03", ti: t(lang, "how3Title"), tx: t(lang, "how3Text") },
            ].map((x) => (
              <div key={x.n} className="rounded-2xl border border-slate-800 bg-[#111827] p-6">
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-400/10 text-sky-400">
                    {x.icon}
                  </span>
                  <span className="font-mono text-xs text-slate-600">{x.n}</span>
                </div>
                <h3 className="font-display mt-4 text-base font-bold text-slate-100">{x.ti}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-slate-400">{x.tx}</p>
              </div>
            ))}
          </div>
        </section>

        {/* first real case */}
        <section className="border-t border-slate-800/70 py-14" aria-label={t(lang, "caseTitle")}>
          <h2 className="font-display text-center text-2xl font-bold text-slate-100">
            {t(lang, "caseTitle")}
          </h2>
          <p className="mt-2 text-center text-sm text-slate-500">{t(lang, "caseSub")}</p>
          <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-sky-900/40 bg-sky-400/[0.04] p-6 sm:p-8">
            {/* timeline: lime 86 -> emerald 97 */}
            <div className="grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
              <div className="rounded-xl border border-slate-800 bg-[#111827] p-5 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t(lang, "caseStep1t")}</p>
                <p className="font-display mt-2 text-2xl font-extrabold text-lime-400">{t(lang, "caseStep1n")}</p>
                <p className="mt-2 text-[12px] leading-relaxed text-slate-400">{t(lang, "caseStep1d")}</p>
              </div>
              <div className="hidden items-center justify-center text-slate-600 sm:flex" aria-hidden>
                <ArrowRight className="h-4 w-4" />
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#111827] p-5 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t(lang, "caseStep2t")}</p>
                <p className="font-display mt-2 text-2xl font-extrabold text-slate-300">{t(lang, "caseStep2n")}</p>
                <p className="mt-2 text-[12px] leading-relaxed text-slate-400">{t(lang, "caseStep2d")}</p>
              </div>
              <div className="hidden items-center justify-center text-slate-600 sm:flex" aria-hidden>
                <ArrowRight className="h-4 w-4" />
              </div>
              <div className="rounded-xl border border-emerald-900/50 bg-emerald-500/[0.05] p-5 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t(lang, "caseStep3t")}</p>
                <p className="font-display mt-2 text-2xl font-extrabold text-emerald-400">{t(lang, "caseStep3n")}</p>
                <p className="mt-2 text-[12px] leading-relaxed text-slate-400">{t(lang, "caseStep3d")}</p>
              </div>
            </div>

            {/* mini-terminal with the real fix-prompt fragment */}
            <div className="mt-6 overflow-hidden rounded-xl border border-slate-800 bg-[#070b13]">
              <div className="flex items-center gap-1.5 border-b border-slate-800 px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
                <span className="ml-2 font-mono text-[11px] text-slate-500">fix-prompt.txt</span>
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(t(lang, "casePrompt"));
                    setCaseCopied(true);
                    setTimeout(() => setCaseCopied(false), 2000);
                  }}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-400 transition hover:border-sky-500/50 hover:text-sky-400"
                >
                  {caseCopied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  {caseCopied ? t(lang, "copied") : t(lang, "copyBtn")}
                </button>
              </div>
              <pre className="overflow-x-auto p-4 font-mono text-[11px] leading-relaxed text-slate-300">
                {t(lang, "casePrompt")}
              </pre>
            </div>

            <p className="mt-6 text-[13px] leading-relaxed text-slate-400">{t(lang, "caseBody")}</p>
            <p className="font-display mt-4 text-sm font-bold text-sky-300">{t(lang, "caseQuote")}</p>
            <a
              href={`/?report=${CASE_REPORT_ID}`}
              target="_blank"
              rel="noopener"
              className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-sky-400 underline decoration-dotted underline-offset-4 transition hover:text-sky-300"
            >
              {t(lang, "caseReportLink")}
            </a>
          </div>
        </section>

        {/* public registry: prominent placement after the proof case */}
        <section className="border-t border-slate-800/70 py-14" aria-label={t(lang, "issue2Title")}>
          <div className="mx-auto max-w-3xl rounded-2xl border border-sky-900/40 bg-sky-400/[0.04] p-6 text-center sm:p-10">
            <h2 className="font-display text-2xl font-bold text-slate-100">
              {t(lang, "issue2Title")}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[13px] leading-relaxed text-slate-400">
              {t(lang, "issue2Sub")}
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                className="bg-sky-400 px-5 text-sm font-bold text-[#090d16] hover:bg-sky-300"
                onClick={() => {
                  window.scrollTo({ top: 0, behavior: "smooth" });
                  document.querySelector<HTMLInputElement>('input[aria-label="App URL"]')?.focus();
                }}
              >
                <Zap className="h-4 w-4" />
                {t(lang, "issue2CtaScan")}
              </Button>
              <a
                href="/registry"
                className="rounded-md border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-sky-500/50 hover:text-sky-400"
              >
                {t(lang, "issue2CtaRegistry")} →
              </a>
            </div>
          </div>
        </section>

        {/* what we check */}
        <section className="border-t border-slate-800/70 py-14" aria-label={t(lang, "checksTitle")}>
          <h2 className="font-display text-center text-2xl font-bold text-slate-100">
            {t(lang, "checksTitle")}
          </h2>
          <p className="mt-2 text-center text-sm text-slate-500">{t(lang, "checksSub")}</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {CHECK_CATEGORIES.map((c) => (
              <div key={c.key} className="rounded-2xl border border-slate-800 bg-[#111827] p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-400/10 text-sky-400">
                    {c.icon}
                  </span>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                    {CATEGORY_META[c.key].title[lang]}
                  </h3>
                  <span className="ml-auto shrink-0 rounded border border-slate-700 bg-[#090d16] px-2 py-0.5 font-mono text-[10px] font-semibold text-sky-400">
                    [{c.count[lang]}]
                  </span>
                </div>
                <ul className="mt-4 space-y-2">
                  {c.items[lang].split("|").map((item) => (
                    <li key={item} className="flex items-start gap-2 text-[13px] text-slate-400">
                      <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400/70" />
                      {item}
                    </li>
                  ))}
                </ul>
                <p className="mt-4 rounded-lg border border-slate-800/80 bg-[#090d16]/60 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
                  {c.extra[lang]}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* pricing */}
        <section id="pricing" className="scroll-mt-16 border-t border-slate-800/70 py-14" aria-label={t(lang, "pricingTitle")}>
          <h2 className="font-display text-center text-2xl font-bold text-slate-100">
            {t(lang, "pricingTitle")}
          </h2>
          <p className="mt-2 text-center text-sm text-slate-500">{t(lang, "pricingSub")}</p>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {[
              { name: t(lang, "planFree"), price: t(lang, "planFreePrice"), sub: "", feats: list(lang, "planFreeFeats"), hi: false, cta: t(lang, "planFreeCta"), kind: "free" as const },
              { name: t(lang, "planLP"), price: t(lang, "planLPPrice"), sub: t(lang, "planLPSub"), feats: list(lang, "planLPFeats"), hi: true, cta: t(lang, "planLPCta"), kind: "lp" as const },
            ].map((p) => (
              <div
                key={p.name}
                className={`relative flex flex-col rounded-2xl border p-6 ${
                  p.hi
                    ? "border-emerald-500/40 bg-emerald-500/[0.04] shadow-[0_0_44px_-14px_rgba(52,211,153,0.4)]"
                    : "border-slate-800 bg-[#111827]"
                }`}
              >
                {p.hi && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-emerald-400 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#090d16] shadow-[0_0_20px_-4px_rgba(52,211,153,0.6)]">
                    {t(lang, "planMostPopular")}
                  </span>
                )}
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{p.name}</p>
                <p className={`font-display mt-2 text-3xl font-extrabold ${p.hi ? "text-emerald-400" : "text-slate-100"}`}>
                  {p.price}
                </p>
                {p.sub && <p className="mt-1 text-[11px] leading-snug text-slate-500">{p.sub}</p>}
                <ul className="mt-4 flex-1 space-y-2">
                  {p.feats.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13px] text-slate-300">
                      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400" />
                      {f}
                    </li>
                  ))}
                </ul>
                {p.kind === "lp" ? (
                  <div className="mt-5 space-y-2">
                    <input
                      value={lpHost}
                      onChange={(e) => setLpHost(e.target.value)}
                      placeholder={t(lang, "lpDomainPh")}
                      aria-label="Pass domain"
                      className="w-full rounded-md border border-slate-700 bg-[#090d16] px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
                    />
                    <Button
                      className="w-full bg-emerald-400 text-[#090d16] hover:bg-emerald-300"
                      onClick={buyPass}
                      disabled={lpBusy}
                    >
                      <Zap className="h-4 w-4" />
                      {lpBusy ? "…" : p.cta}
                    </Button>
                    <p className="text-[10px] leading-relaxed text-slate-500">{t(lang, "lpNote")}</p>
                    {lpErr && <p className="text-[11px] leading-snug text-red-400">{lpErr}</p>}
                  </div>
                ) : (
                  <Button
                    className="mt-5 w-full bg-sky-400 text-[#090d16] hover:bg-sky-300"
                    onClick={() => {
                      window.scrollTo({ top: 0, behavior: "smooth" });
                      document.querySelector<HTMLInputElement>('input[aria-label="App URL"]')?.focus();
                    }}
                  >
                    <Zap className="h-4 w-4" />
                    {p.cta} ↑
                  </Button>
                )}
              </div>
            ))}
          </div>
          {/* platform: contact row instead of a third pricing card */}
          <div className="mt-4 rounded-2xl border border-slate-800 bg-[#111827] p-5 sm:p-6">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Platform · <span className="font-mono normal-case tracking-normal">{t(lang, "planPlatformPrice")}</span>
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-slate-300">{t(lang, "platformRowText")}</p>
              </div>
              <a
                href="https://t.me/peexthree"
                target="_blank"
                rel="noopener"
                className="inline-flex shrink-0 items-center gap-2 rounded-md bg-sky-400 px-5 py-2.5 text-sm font-bold text-[#090d16] transition hover:bg-sky-300"
              >
                <Send className="h-4 w-4" />
                {t(lang, "telegramCta")}
              </a>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-slate-800/70 py-14" aria-label={t(lang, "faqTitle")}>
          <h2 className="font-display text-center text-2xl font-bold text-slate-100">
            {t(lang, "faqTitle")}
          </h2>
          <div className="mx-auto mt-8 max-w-3xl space-y-3">
            {(
              [
                ["faq1Q", "faq1A"],
                ["faq2Q", "faq2A"],
                ["faq3Q", "faq3A"],
                ["faq4Q", "faq4A"],
                ["faq5Q", "faq5A"],
                ["faq6Q", "faq6A"],
                ["faq7Q", "faq7A"],
                ["faq8Q", "faq8A"],
              ] as const
            ).map(
              ([q, a]) => (
                <details key={q} className="group rounded-xl border border-slate-800 bg-[#111827] p-5">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-slate-100 marker:hidden">
                    <span className="mr-2 text-sky-400 transition group-open:rotate-90 inline-block">▸</span>
                    {t(lang, q)}
                  </summary>
                  <p className="mt-3 pl-6 text-[13px] leading-relaxed text-slate-400">{t(lang, a)}</p>
                </details>
              ),
            )}
          </div>
        </section>
      </main>

      {/* footer */}
      <footer className="mt-auto border-t border-slate-800/70 bg-[#070b13]">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-5 px-4 py-8 text-center sm:flex-row sm:px-6 sm:text-left">
          <div className="space-y-1.5">
            <p className="text-xs text-slate-500">
              © {new Date().getFullYear()} AppSeal · {t(lang, "footerText")}
            </p>
            <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 font-mono text-[10px] text-slate-700 sm:justify-start">
              <span>{t(lang, "footerEngine")}</span>
              <span>·</span>
              <a href="/registry" className="transition hover:text-slate-400">реестр</a>
              <span>·</span>
              <a href="/bot" className="transition hover:text-slate-400">робот (bot)</a>
              <span>·</span>
              <a href="/legal" className="transition hover:text-slate-400">правила</a>
              <span>·</span>
              <a href="https://t.me/peexthree" target="_blank" rel="noopener" className="transition hover:text-slate-400">
                telegram
              </a>
              <span>·</span>
              <span className="inline-flex items-center gap-1.5 text-emerald-500/90">
                <span className="appseal-pulse h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {t(lang, "footerStatus")}
              </span>
            </p>
          </div>
          <div className="shrink-0 text-center">
            <a
              href="/?report=mweys4fr-0d7b05c638"
              target="_blank"
              rel="noopener"
              title="AppSeal Security Verified: Grade A+ (100/100)"
              className="inline-block transition-transform hover:scale-[1.02]"
            >
              <img
                src="/api/badge?id=mweys4fr-0d7b05c638"
                alt="AppSeal Verified: Grade A+"
                width={228}
                height={44}
                className="h-[44px] w-[228px] drop-shadow-[0_4px_16px_rgba(192,132,252,0.18)]"
              />
            </a>
            <p className="mt-1.5 max-w-[228px] text-[10px] leading-snug text-slate-600">
              {t(lang, "footerBadgeNote")}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
