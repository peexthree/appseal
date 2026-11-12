"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang, ScanResult } from "@/lib/scanner/types";
import { CATEGORY_META } from "@/lib/scanner/types";
import { t, list } from "@/lib/i18n";
import { ReportView } from "@/components/report-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldCheck, Zap, FileCheck2, KeyRound, ShieldAlert, Lock, Activity, ArrowRight, Globe } from "lucide-react";

type Phase = "form" | "scanning" | "report" | "error";

const CHECK_CATEGORIES = [
  {
    icon: <KeyRound className="h-5 w-5" />,
    key: "secrets" as const,
    items: {
      ru: "Открытые .env и .git|Ключи API в клиентском JS|Firebase/Supabase без правил|Дампы и бэкапы по прямой ссылке",
      en: "Open .env and .git|API keys in client JS|Firebase/Supabase with no rules|Dumps and backups at direct URLs",
    },
  },
  {
    icon: <ShieldCheck className="h-5 w-5" />,
    key: "headers" as const,
    items: {
      ru: "CSP, HSTS, X-Frame-Options|CORS «для всех»|Протухший TLS-сертификат|Cookie без защитных флагов",
      en: "CSP, HSTS, X-Frame-Options|CORS \"for everyone\"|Expired TLS certificate|Cookies without protective flags",
    },
  },
  {
    icon: <Lock className="h-5 w-5" />,
    key: "admin" as const,
    items: {
      ru: "Админ-панели на стандартных путях|Отладочные эндпоинты на проде|Бэкапы баз в веб-корне|Доступ без rate limit",
      en: "Admin panels on standard paths|Debug endpoints in production|DB backups in the web root|Access without rate limiting",
    },
  },
  {
    icon: <Activity className="h-5 w-5" />,
    key: "liveness" as const,
    items: {
      ru: "Заглушки и lorem ipsum|Ошибки «undefined» в разметке|Битые внутренние ссылки|Пустые title и description",
      en: "Placeholders and lorem ipsum|\"undefined\" rendered in markup|Broken internal links|Empty title and description",
    },
  },
];

export default function Home() {
  const [lang, setLang] = useState<Lang>("ru");
  const [phase, setPhase] = useState<Phase>("form");
  const [url, setUrl] = useState("");
  const [scanId, setScanId] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [error, setError] = useState("");
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("appmot-lang") : null;
    if (saved === "ru" || saved === "en") {
      setLang(saved);
    } else if (typeof navigator !== "undefined" && !navigator.language.toLowerCase().startsWith("ru")) {
      setLang("en");
    }
  }, []);

  const switchLang = (l: Lang) => {
    setLang(l);
    try {
      localStorage.setItem("appmot-lang", l);
    } catch {
      /* private mode */
    }
  };

  const startScan = useCallback(async (target: string) => {
    setError("");
    setScan(null);
    setScanId(null);
    setPhase("scanning");
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: target, lang }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const { id } = (await res.json()) as { id: string };
      setScanId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }, [lang]);

  useEffect(() => {
    if (!scanId) return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/scan/${scanId}`, { cache: "no-store" });
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
  }, [scanId, lang]);

  const reset = () => {
    setPhase("form");
    setScan(null);
    setScanId(null);
    setUrl("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0c10] text-zinc-100">
      {/* header */}
      <header className="sticky top-0 z-40 border-b border-zinc-800/70 bg-[#0a0c10]/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <a href="/" className="flex items-center gap-2" aria-label="AppMOT home">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500 text-zinc-950">
              <ShieldCheck className="h-4.5 w-4.5" strokeWidth={2.4} />
            </span>
            <span className="font-display text-lg font-extrabold tracking-tight">AppMOT</span>
          </a>
          <nav className="flex items-center gap-1" aria-label="Language">
            <Globe className="mr-1 h-3.5 w-3.5 text-zinc-600" />
            {(["ru", "en"] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => switchLang(l)}
                className={`rounded-md px-2.5 py-1 text-xs font-bold uppercase transition ${
                  lang === l ? "bg-zinc-800 text-emerald-400" : "text-zinc-500 hover:text-zinc-300"
                }`}
                aria-pressed={lang === l}
              >
                {l}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 sm:px-6">
        {/* hero + scanner */}
        <section className="pb-14 pt-14 sm:pt-20" aria-label="Scanner">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-400">
              {t(lang, "tagline")}
            </p>
            <h1 className="font-display mt-4 text-4xl font-extrabold leading-tight tracking-tight text-zinc-50 sm:text-5xl">
              {t(lang, "heroTitle")}{" "}
              <span className="text-emerald-400">{t(lang, "heroTitleAccent")}</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-zinc-400">
              {t(lang, "heroSub")}
            </p>
          </div>

          {phase === "form" && (
            <form
              className="mx-auto mt-8 flex max-w-2xl flex-col gap-3 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (url.trim()) void startScan(url.trim());
              }}
            >
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t(lang, "inputPlaceholder")}
                className="h-12 flex-1 border-zinc-700 bg-[#101318] text-base text-zinc-100 placeholder:text-zinc-600"
                inputMode="url"
                aria-label="App URL"
                required
              />
              <Button type="submit" className="h-12 bg-emerald-500 px-6 text-base font-bold text-zinc-950 hover:bg-emerald-400">
                <Zap className="h-4 w-4" />
                {t(lang, "scanBtn")}
              </Button>
            </form>
          )}

          {phase === "form" && (
            <div className="mt-3 text-center">
              <button
                onClick={() => void startScan("demo://app")}
                className="text-sm text-zinc-500 underline decoration-dotted underline-offset-4 transition hover:text-emerald-400"
              >
                {t(lang, "demoBtn")} →
              </button>
            </div>
          )}

          {phase === "scanning" && (
            <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-zinc-800 bg-[#0f1216] p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <span className="appmot-pulse flex h-3 w-3 rounded-full bg-emerald-400" />
                <p className="font-semibold text-zinc-100">{t(lang, "scanning")}</p>
                <span className="ml-auto font-mono text-sm text-emerald-400">{scan?.progress ?? 0}%</span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${scan?.progress ?? 4}%` }}
                />
              </div>
              <p className="mt-3 text-sm text-zinc-400">
                {scan?.stage?.[lang] ?? "…"}{" "}
                <span className="font-mono text-zinc-500">{url ? url.replace(/^https?:\/\//, "") : "demo-app"}</span>
              </p>
            </div>
          )}

          {phase === "error" && (
            <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-red-900/60 bg-red-500/5 p-6 text-center">
              <ShieldAlert className="mx-auto h-8 w-8 text-red-400" />
              <p className="mt-3 font-semibold text-red-300">{t(lang, "errTitle")}</p>
              <p className="mt-1 break-words text-sm text-zinc-400">{error}</p>
              <Button variant="outline" onClick={reset} className="mt-4 border-zinc-700 text-zinc-300 hover:bg-zinc-800">
                {t(lang, "rescan")}
              </Button>
            </div>
          )}

          <div ref={reportRef} className={phase === "report" ? "mt-10 scroll-mt-20" : ""}>
            {phase === "report" && scan && (
              <ReportView scan={scan} lang={lang} onReset={reset} />
            )}
          </div>
        </section>

        {/* stats */}
        <section className="border-t border-zinc-800/70 py-14" aria-label={t(lang, "statsTitle")}>
          <h2 className="font-display text-center text-2xl font-bold text-zinc-100">
            {t(lang, "statsTitle")}
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              { n: "45%", s: t(lang, "stat1") },
              { n: "40%", s: t(lang, "stat2") },
              { n: "1.3M", s: t(lang, "stat3") },
            ].map((x) => (
              <div key={x.n} className="rounded-2xl border border-zinc-800 bg-[#0f1216] p-6 text-center">
                <p className="font-display text-4xl font-extrabold text-emerald-400">{x.n}</p>
                <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">{x.s}</p>
              </div>
            ))}
          </div>
        </section>

        {/* how it works */}
        <section className="border-t border-zinc-800/70 py-14" aria-label={t(lang, "howTitle")}>
          <h2 className="font-display text-center text-2xl font-bold text-zinc-100">
            {t(lang, "howTitle")}
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              { icon: <Globe className="h-5 w-5" />, n: "01", ti: t(lang, "how1Title"), tx: t(lang, "how1Text") },
              { icon: <Zap className="h-5 w-5" />, n: "02", ti: t(lang, "how2Title"), tx: t(lang, "how2Text") },
              { icon: <FileCheck2 className="h-5 w-5" />, n: "03", ti: t(lang, "how3Title"), tx: t(lang, "how3Text") },
            ].map((x) => (
              <div key={x.n} className="rounded-2xl border border-zinc-800 bg-[#0f1216] p-6">
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                    {x.icon}
                  </span>
                  <span className="font-mono text-xs text-zinc-600">{x.n}</span>
                </div>
                <h3 className="font-display mt-4 text-base font-bold text-zinc-100">{x.ti}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">{x.tx}</p>
              </div>
            ))}
          </div>
        </section>

        {/* what we check */}
        <section className="border-t border-zinc-800/70 py-14" aria-label={t(lang, "checksTitle")}>
          <h2 className="font-display text-center text-2xl font-bold text-zinc-100">
            {t(lang, "checksTitle")}
          </h2>
          <p className="mt-2 text-center text-sm text-zinc-500">{t(lang, "checksSub")}</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {CHECK_CATEGORIES.map((c) => (
              <div key={c.key} className="rounded-2xl border border-zinc-800 bg-[#0f1216] p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                    {c.icon}
                  </span>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-200">
                    {CATEGORY_META[c.key].title[lang]}
                  </h3>
                </div>
                <ul className="mt-4 space-y-2">
                  {c.items[lang].split("|").map((item) => (
                    <li key={item} className="flex items-start gap-2 text-[13px] text-zinc-400">
                      <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500/70" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* pricing */}
        <section className="border-t border-zinc-800/70 py-14" aria-label={t(lang, "pricingTitle")}>
          <h2 className="font-display text-center text-2xl font-bold text-zinc-100">
            {t(lang, "pricingTitle")}
          </h2>
          <p className="mt-2 text-center text-sm text-zinc-500">{t(lang, "pricingSub")}</p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              { name: t(lang, "planFree"), price: t(lang, "planFreePrice"), feats: list(lang, "planFreeFeats"), hi: false },
              { name: t(lang, "planPro"), price: t(lang, "planProPrice"), feats: list(lang, "planProFeats"), hi: true },
              { name: t(lang, "planPlatform"), price: t(lang, "planPlatformPrice"), feats: list(lang, "planPlatformFeats"), hi: false },
            ].map((p) => (
              <div
                key={p.name}
                className={`rounded-2xl border p-6 ${
                  p.hi ? "border-emerald-500/60 bg-emerald-500/5" : "border-zinc-800 bg-[#0f1216]"
                }`}
              >
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">{p.name}</p>
                <p className={`font-display mt-2 text-3xl font-extrabold ${p.hi ? "text-emerald-400" : "text-zinc-100"}`}>
                  {p.price}
                </p>
                <ul className="mt-4 space-y-2">
                  {p.feats.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13px] text-zinc-300">
                      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-zinc-800/70 py-14" aria-label={t(lang, "faqTitle")}>
          <h2 className="font-display text-center text-2xl font-bold text-zinc-100">
            {t(lang, "faqTitle")}
          </h2>
          <div className="mx-auto mt-8 max-w-3xl space-y-3">
            {([["faq1Q", "faq1A"], ["faq2Q", "faq2A"], ["faq3Q", "faq3A"], ["faq4Q", "faq4A"]] as const).map(
              ([q, a]) => (
                <details key={q} className="group rounded-xl border border-zinc-800 bg-[#0f1216] p-5">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-zinc-100 marker:hidden">
                    <span className="mr-2 text-emerald-400 transition group-open:rotate-90 inline-block">▸</span>
                    {t(lang, q)}
                  </summary>
                  <p className="mt-3 pl-6 text-[13px] leading-relaxed text-zinc-400">{t(lang, a)}</p>
                </details>
              ),
            )}
          </div>
        </section>
      </main>

      {/* footer */}
      <footer className="mt-auto border-t border-zinc-800/70 bg-[#080a0d]">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-4 py-6 text-center sm:flex-row sm:px-6 sm:text-left">
          <p className="text-xs text-zinc-500">
            © {new Date().getFullYear()} AppMOT · {t(lang, "footerText")}
          </p>
          <p className="font-mono text-[10px] text-zinc-700">MVP v0.1 · Next.js · external black-box scanner</p>
        </div>
      </footer>
    </div>
  );
}
