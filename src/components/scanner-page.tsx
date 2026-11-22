"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import dynamic from "next/dynamic";
import { track } from "@vercel/analytics";
import { ymGoal } from "@/components/yandex-metrika";
import { motion } from "framer-motion";
import type { Lang, ScanResult, Grade } from "@/lib/scanner/types";
import { CATEGORY_META } from "@/lib/scanner/types";
import { GRADE_META, getTrophyPath } from "@/lib/scanner/grade";
import { t, list } from "@/lib/i18n";
import statsData from "@/data/stats-harvest.json";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Reveal } from "@/components/reveal";
import { SectionHead } from "@/components/section-head";
import { Stat } from "@/components/stat";
import { ShieldHeaders, Zap, FileCheck2, KeyRound, ShieldAlert, Lock, Activity, Sparkles, ArrowRight, ArrowUp, Globe, Check, Copy, Send, ChevronDown, Scale, CodeXml, GitBranch } from "@/components/icons/appseal-icons";
import { SiteHeader } from "@/components/site-header";
// React Bits preview (local only, not committed to prod decision yet)
import SpotlightCard from "@/components/bits/SpotlightCard";
import Particles from "@/components/bits/Particles";

// the report lives behind the scan - it never renders on first paint, so its
// ~140KB of code (fixtures, PDF helpers, tabs) must not sit in the landing
// bundle; ssr:false is safe in a client component
const ReportView = dynamic(
  () => import("@/components/report-view").then((m) => m.ReportView),
  { ssr: false },
);

type Phase = "form" | "scanning" | "report" | "error";

/**
 * Decorative background loop for mid-page sections: ships with no src and
 * preload="none", attaches the file and starts playing only when scrolled
 * near the viewport, pauses again when it leaves - zero cost for LCP and
 * for visitors who never scroll that far.
 */
function BackdropVideo({ src, className }: { src: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let attached = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (!attached) {
            attached = true;
            el.setAttribute("src", src); // starts the fetch on demand
          }
          void el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [src]);
  // onCanPlay covers the race where play() fires while the file is still loading
  return (
    <video
      ref={ref}
      muted
      loop
      playsInline
      preload="none"
      aria-hidden
      onCanPlay={() => void ref.current?.play().catch(() => {})}
      className={className}
    />
  );
}

/** exact check counts per category - from the engine, demo scan = 125 total */
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
  {
    icon: <Sparkles className="h-5 w-5" />,
    key: "trust" as const,
    count: { ru: "28 проверок", en: "28 checks" },
    extra: {
      ru: "+ ещё 24 проверки: llms.txt, политика ИИ-краулеров в robots.txt, SPF/DMARC против подделки писем, версия TLS, sitemap.xml, JSON-LD, инвентарь сторонних скриптов, трекеры без политики приватности, открытые ИИ-прокси (/api/chat и др.)",
      en: "+ 24 more checks: llms.txt, AI-crawler policy in robots.txt, SPF/DMARC anti-spoofing, TLS version, sitemap.xml, JSON-LD, third-party script inventory, undisclosed trackers, exposed AI proxies (/api/chat and more)",
    },
    items: {
      ru: "llms.txt и ИИ-краулеры|SPF/DMARC против подделки писем|Политика приватности против трекеров|Открытые ИИ-прокси без авторизации",
      en: "llms.txt and AI crawlers|SPF/DMARC anti-spoofing|Privacy policy vs trackers|Exposed AI proxies without auth",
    },
  },
];

/** one-click demo targets - real past scans, the E one is the deliberately vulnerable fixture */
const DEMO_CHIPS: { target: string; grade: Grade; score: number }[] = [
  { target: "akulenok-tmz.ru", grade: "A", score: 91 },
  { target: "appseal.online", grade: "A+", score: 97 },
  { target: "demo://app", grade: "E", score: 0 },
];

/** footer nav hrefs, index-aligned with the i18n "footerNav" labels */
const FOOTER_NAV_HREFS = ["/registry", "/versus", "/fixes", "/digest", "/ci", "/api", "/bot", "/legal"];

/** the re-scan of the aqua center case (A/91, current engine), public verification view */
const CASE_REPORT_ID = "mwgtru41-31b2e3c030";

/** grade showcase rotation order: the chips render it, the 5s auto-cycle walks it */
const GRADE_ORDER: Grade[] = ["A+", "A", "B", "C", "D", "E"];

/** ticker under the hero: real engine check names, language-neutral */
const CHECK_TICKER = [
  "CSP", "HSTS", ".env", ".git", "CORS", "TLS expiry", "cookie flags", "swagger",
  "actuator", "wp-json", "mixed content", "SRI", "soft-404", "X-Frame-Options",
  "Referrer-Policy", "COOP", "dir listing", "source maps", "DMARC", "llms.txt",
  "SPF", "AI crawlers",
];

/** section eyebrow pills, per language */
const EYEBROWS = {
  stats: { ru: "Почему", en: "Why" },
  how: { ru: "Процесс", en: "Process" },
  grades: { ru: "Грейды", en: "Grades" },
  case: { ru: "Кейс", en: "Case" },
  engine: { ru: "Движок", en: "Engine" },
  eco: { ru: "Экосистема", en: "Ecosystem" },
  pricing: { ru: "Тарифы", en: "Pricing" },
  reviews: { ru: "Отзывы", en: "Reviews" },
  faq: { ru: "FAQ", en: "FAQ" },
};

/** animated stat cards: value, suffix and decimal precision */
/** «Проблема уже здесь» - реальные цифры нашего массового прогона; stats-harvest.json
 * обновляет пайплайн (каждые 2 воскресенья), числа на лендинге подтягиваются при деплое */
const HARVEST_DONE = statsData.panel.done;
const HARVEST_BELOW_A =
  HARVEST_DONE > 0
    ? Math.round(((HARVEST_DONE - statsData.gradeACount) / HARVEST_DONE) * 100)
    : 0;
const HARVEST_CSP_MISS = statsData.topFails.find((f) => f.id === "hdr_csp")?.warnPct ?? 0;
// generatedAt = "+0500"; фиксируем зону генерации, чтобы дата не «уезжала» на день
const HARVEST_TS = statsData.generatedAt.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");

const STATS: { value: number; suffix: string; decimals: number; label: "stat1" | "stat2" | "stat3" }[] = [
  { value: HARVEST_DONE, suffix: "", decimals: 0, label: "stat1" },
  { value: HARVEST_BELOW_A, suffix: "%", decimals: 0, label: "stat2" },
  { value: HARVEST_CSP_MISS, suffix: "%", decimals: 0, label: "stat3" },
];

/** one approved review for the landing strip (client fetch at mount) */
interface LandingReview {
  id: string;
  name: string;
  rating: number;
  host: string | null;
  body: string;
  /** moderator's showcase pin (the GET payload carries it) */
  featured?: boolean;
}

/** featured-review caption for the landing strip (page-local label) */
const REVIEW_FEATURED_LABEL: Record<Lang, string> = {
  ru: "От избранного редактора",
  en: "Editor's pick",
};

/** star row for the landing cards: plain characters, the meaning rides on
 *  aria-label (no images, no new dependencies) */
function ReviewStars({ rating, lang }: { rating: number; lang: Lang }) {
  const n = Math.max(1, Math.min(5, rating));
  return (
    <span
      role="img"
      aria-label={t(lang, "reviewsCardRating").replace("{n}", String(n))}
      className="shrink-0 text-xs tracking-widest text-amber-400"
    >
      <span aria-hidden>{"★".repeat(n)}</span>
      <span aria-hidden className="text-slate-600">
        {"☆".repeat(5 - n)}
      </span>
    </span>
  );
}

/** custom checkbox: native accent-sky-400 renders differently in every OS -
 *  this one paints the same way everywhere (border, fill, dark check mark) */
function ConsentCheck({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <span
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      tabIndex={0}
      onClick={(e) => {
        e.preventDefault();
        onToggle();
      }}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onToggle();
        }
      }}
      className={`mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border transition duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 ${
        checked
          ? "border-sky-400 bg-sky-400 text-[#090d16]"
          : "border-white/20 bg-white/[0.03] text-transparent hover:border-white/35"
      }`}
    >
      <Check className="h-3 w-3" strokeWidth={3} />
    </span>
  );
}

/** landing reviews strip: up to 3 latest approved reviews fetched at mount.
 *  Empty feed renders one honest invitation line - no invented quotes; the
 *  full showcase and the submit form live on /reviews. */
function LandingReviews({ lang }: { lang: Lang }) {
  const [reviews, setReviews] = useState<LandingReview[] | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/reviews?limit=3", { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j: { reviews?: LandingReview[] }) =>
        setReviews(Array.isArray(j.reviews) ? j.reviews.slice(0, 3) : []),
      )
      .catch(() => setReviews([]));
    return () => ctrl.abort();
  }, []);
  // quiet while loading - a skeleton would promise content that may never come
  if (reviews === null) return null;
  if (reviews.length === 0) {
    return (
      <p className="mx-auto mt-8 max-w-2xl text-center text-sm leading-relaxed text-slate-500">
        {t(lang, "reviewsEmpty")}
      </p>
    );
  }
  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-3">
      {reviews.map((r) => (
        <figure key={r.id} className="appseal-card flex flex-col rounded-2xl p-5">
          <div className="flex items-center justify-between gap-3">
            <figcaption className="min-w-0 truncate text-sm font-bold text-slate-100">
              {r.name}
            </figcaption>
            <ReviewStars rating={r.rating} lang={lang} />
          </div>
          {r.featured && (
            <p className="mt-1.5 text-[11px] font-semibold text-amber-400">
              <span aria-hidden>⭐</span> {REVIEW_FEATURED_LABEL[lang]}
            </p>
          )}
          {r.host && (
            <p className="mt-1.5 text-[11px] text-slate-500">
              {t(lang, "reviewsAboutHost")} <span className="font-mono text-slate-400">{r.host}</span>
            </p>
          )}
          <blockquote className="mt-3 flex-1 text-[13px] leading-relaxed text-slate-300 line-clamp-4">
            {r.body}
          </blockquote>
        </figure>
      ))}
    </div>
  );
}

export function ScannerPage({
  initialScan,
  initialReportKey,
  initialLang,
  initialTotals,
  initialChips,
}: {
  initialScan: ScanResult | null;
  /** report key from ?key= - present only for the scan initiator */
  initialReportKey?: string;
  /** server-resolved seed (headers): ru for RU audience, en for everyone
   *  else; a saved localStorage choice still wins over it */
  initialLang?: Lang;
  /** live monotonic counters from Redis (same source /stats renders from):
   *  hosts = unique apps ever scanned, scans = scans counted. The landing
   *  stats card uses hosts so it always matches /stats; null falls back to
   *  the static harvest snapshot */
  initialTotals?: { scans: number; hosts: number } | null;
  /** live chip grades resolved server-side from the registry (same source
   *  as /api/verify); null/empty falls back to the static DEMO_CHIPS */
  initialChips?: { target: string; grade: Grade; score: number }[] | null;
}) {
  // language: derived, not stored. useSyncExternalStore reads the same
  // cookie/localStorage the switcher writes (server snapshot "" keeps the
  // SSR seed authoritative through hydration, the client snapshot wins after
  // a saved choice or an appseal-lang event)
  const savedLang = useSyncExternalStore(
    (cb) => {
      window.addEventListener("appseal-lang", cb);
      return () => window.removeEventListener("appseal-lang", cb);
    },
    () => {
      const m = document.cookie.match(/(?:^|; )appseal-lang=(ru|en)/);
      if (m) return m[1] as Lang;
      try {
        const saved = localStorage.getItem("appseal-lang");
        if (saved === "ru" || saved === "en") return saved;
      } catch {
        /* private mode */
      }
      return "";
    },
    () => "",
  );
  const lang: Lang = savedLang === "ru" || savedLang === "en" ? savedLang : (initialLang ?? "ru");
  const [phase, setPhase] = useState<Phase>(initialScan ? "report" : "form");
  const [showGrade, setShowGrade] = useState<Grade>("A+");
  // auto-showcase: pointer or keyboard focus inside the card pauses the cycle,
  // a manual pick bumps the seed so the 5s timer restarts from the clicked grade
  const [hoverHold, setHoverHold] = useState(false);
  const [focusHold, setFocusHold] = useState(false);
  const [cycleSeed, setCycleSeed] = useState(0);
  const cycleHold = hoverHold || focusHold;
  const [caseCopied, setCaseCopied] = useState(false);
  const [url, setUrl] = useState("");
  const [consent, setConsent] = useState(true);
  // private scan: keep the result out of the public registry (Pass-only,
  // the API answers 402 private_requires_pass without an active pass)
  const [privateScan, setPrivateScan] = useState(false);
  const [scanId, setScanId] = useState<string | null>(null);
  const [rkey, setRkey] = useState<string | null>(initialReportKey ?? null);
  const [scan, setScan] = useState<ScanResult | null>(initialScan);
  const [error, setError] = useState("");
  const [quotaHit, setQuotaHit] = useState(false);
  const [privateHit, setPrivateHit] = useState(false);
  const [privateFallback, setPrivateFallback] = useState(false);
  const [passInfo, setPassInfo] = useState<{ host: string; until: string } | null>(null);
  const [paidPending, setPaidPending] = useState(false);
  // one-click demo chips: server-resolved live grades when available
  const demoChips = initialChips && initialChips.length > 0 ? initialChips : DEMO_CHIPS;
  // honest footer status: the "All systems operational" claim is backed by a
  // real /api/healthz probe, not hardcoded - degrade visibly when it fails
  const [sysOk, setSysOk] = useState<boolean | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/healthz", { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j: { ok?: boolean; redis?: string }) => setSysOk(j.ok === true && j.redis !== "down"))
      .catch(() => setSysOk(false));
    return () => ctrl.abort();
  }, []);
  // keep <html lang> in sync with the rendered language: layout hardcodes
  // lang="ru" while the landing SSR detects EN visitors - without this an EN
  // visitor gets <html lang="ru"> and every useLang() consumer (cookie banner,
  // navbar) stays Russian. The broadcast lets those consumers re-resolve.
  useEffect(() => {
    if (document.documentElement.lang !== lang) {
      document.documentElement.lang = lang;
      window.dispatchEvent(new CustomEvent("appseal-lang"));
    }
  }, [lang]);
  // smart suggestions inside the hero input: empty query shows all examples,
  // typing narrows them by substring ("akul" -> akulenok-tmz.ru)
  const [suggestOpen, setSuggestOpen] = useState(false);
  const suggestionMatches = useMemo(() => {
    const q = url.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "");
    if (!q) return demoChips;
    return demoChips.filter((c) => c.target.toLowerCase().includes(q));
  }, [url, demoChips]);
  // live terminal: engine stage strings timestamped as the scan advances
  const [termLines, setTermLines] = useState<string[]>([]);
  const scanStartedAt = useRef(0);
  const lastTermStage = useRef("");
  const [faqOpen, setFaqOpen] = useState<number[]>([]);
  // collapsed consent accordion under the hero form (T-04: the full 152-FZ
  // text unfolds on demand instead of sitting between CTA and the fold)
  const [consentOpen, setConsentOpen] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const heroVideoRef = useRef<HTMLVideoElement>(null);

  // the hero loop is the LCP competitor: the poster paints from the SSR HTML,
  // the 524KB mp4 attaches only after the window load event (plus an idle
  // frame) so the fetch never races the render-critical window
  useEffect(() => {
    const video = heroVideoRef.current;
    if (!video || video.getAttribute("src")) return;
    const start = () => {
      requestAnimationFrame(() => {
        video.setAttribute("src", "/video/Radar_pulse.mp4");
        video.play().catch(() => {
          /* autoplay blocked (data saver, low-power): the poster stays */
        });
      });
    };
    if (document.readyState === "complete") {
      const id = window.setTimeout(start, 80);
      return () => window.clearTimeout(id);
    }
    window.addEventListener("load", start, { once: true });
    return () => window.removeEventListener("load", start);
  }, []);

  // grade showcase walks the ranks on its own every 5s
  useEffect(() => {
    if (cycleHold) return;
    const id = window.setInterval(() => {
      setShowGrade((cur) => GRADE_ORDER[(GRADE_ORDER.indexOf(cur) + 1) % GRADE_ORDER.length]);
    }, 5000);
    return () => window.clearInterval(id);
  }, [cycleHold, cycleSeed]);

  const toggleFaq = (i: number) =>
    setFaqOpen((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]));

  // admin quota bypass: opening the site once with /?admin=<key> stores the
  // key in this browser, after which every scan skips the daily free quota.
  // The key is wiped from the address bar immediately so it cannot leak
  // through copied links; without a stored key the request field stays empty
  const [adminKey] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("admin");
      if (fromUrl) {
        localStorage.setItem("appseal-admin-key", fromUrl);
        window.history.replaceState(null, "", window.location.pathname);
        return fromUrl;
      }
      return localStorage.getItem("appseal-admin-key") ?? "";
    } catch {
      return "";
    }
  });

  // saved language wins over the server seed; without a saved choice the SSR
  // header detection stays authoritative (no navigator re-check - it would
  // only duplicate it and risk a flash of the other language)
  // saved language wins over the server seed; without a saved choice the SSR
  // header detection stays authoritative (no navigator re-check - it would
  // only duplicate it and risk a flash of the other language)

  // keep <html lang> in sync with the active UI language (layout is static)
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // deep link from the registry Fix CTA: /?domain=example.com prefills the
  // scanner input so the owner is one click from the re-scan (deferred to a
  // macrotask: the sync setState in the effect body cascades a render)
  useEffect(() => {
    const id = window.setTimeout(() => {
      const d = new URLSearchParams(window.location.search).get("domain");
      if (d && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(d.trim())) {
        setUrl(d.trim());
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const switchLang = (l: Lang) => {
    try {
      localStorage.setItem("appseal-lang", l);
      document.cookie = `appseal-lang=${l}; path=/; max-age=31536000; samesite=lax`;
      window.dispatchEvent(new CustomEvent("appseal-lang", { detail: l }));
    } catch {
      /* private mode */
    }
  };

  // append a timestamped terminal line whenever the engine reports a new stage
  useEffect(() => {
    const stage = scan?.stage?.[lang];
    if (!stage || lastTermStage.current === stage) return;
    lastTermStage.current = stage;
    const secs = scanStartedAt.current ? Math.round((Date.now() - scanStartedAt.current) / 1000) : 0;
    setTermLines((prev) => [...prev.slice(-14), `[${String(secs).padStart(2, "0")}s] ${stage}`]);
  }, [scan, lang]);

  // server error strings -> human text (the API answers with bare codes like
  // "invalid url"; showing those raw reads as a bug in a product that sells
  // "findings in plain language")
  const serverErrorText = useCallback(
    (msg: string) => {
      const m = msg.toLowerCase();
      if (m.includes("invalid url") || m.includes("url required") || m.includes("url")) {
        return t(lang, "errInvalidUrl");
      }
      return msg;
    },
    [lang],
  );

  const startScan = useCallback(
    async (target: string) => {
      setError("");
      setQuotaHit(false);
      setPrivateHit(false);
      setPrivateFallback(false);
      setScan(null);
      setScanId(null);
      setPhase("scanning");
      setTermLines([]);
      scanStartedAt.current = Date.now();
      lastTermStage.current = "";
      track("scan_submit", { demo: target.startsWith("demo://"), lang });
      ymGoal("scan_submit", { demo: target.startsWith("demo://") });
      const submit = async (withPrivate: boolean): Promise<void> => {
        const res = await fetch("/api/scan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            url: target,
            lang,
            adminKey,
            // Pass-only option: keep this scan out of the public registry
            ...(withPrivate ? { private: true } : {}),
          }),
        });
        if (res.status === 429) {
          setQuotaHit(true);
          setPhase("error");
          return;
        }
        if (res.status === 402) {
          // the API rejects private scans without an active pass on the
          // domain: fall back to the public scan instead of dead-ending the
          // visitor who only wanted privacy - the regular scan stays free
          if (withPrivate) {
            setPrivateFallback(true);
            await submit(false);
            return;
          }
          setPrivateHit(true);
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
      };
      try {
        await submit(privateScan);
      } catch (e) {
        setError(serverErrorText(e instanceof Error ? e.message : String(e)));
        setPhase("error");
      }
    },
    [lang, adminKey, privateScan, serverErrorText],
  );

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

  useEffect(() => {
    if (!scanId) return;
    let alive = true;
    // hard cap: without it a dead network or a wedged scan polls forever and
    // the only way out is a page reload
    const MAX_POLLS = 120;
    let polls = 0;
    const tick = async () => {
      if (!alive) return;
      polls += 1;
      if (polls > MAX_POLLS) {
        setError(t(lang, "pollTimeout"));
        setPhase("error");
        return;
      }
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

  // stop watching the scan without losing the typed URL: the scan itself
  // continues server-side (public results land in the registry), this only
  // ends the polling view
  const cancelScan = () => {
    setScanId(null);
    setScan(null);
    setPhase("form");
    setPrivateFallback(false);
  };

  const reset = () => {
    setPhase("form");
    setScan(null);
    setScanId(null);
    setRkey(null);
    setUrl("");
    setPrivateFallback(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip text-slate-100">
      {/* no ambient layer here: the body bg.webp stays clean like inner pages */}

      {/* header: the shared site header - transparent at rest, collapses into
          a small left logo-pill on scroll, quick-links mini-panel + RU/EN */}
      <SiteHeader lang={lang} onSwitchLang={switchLang} />

      <main className="relative z-10 mx-auto w-full max-w-5xl flex-1 px-4 sm:px-6">
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

        {/* hero + scanner (id="scan": the 404 page's "Проверить сайт" CTA
            lands here, at the top of the landing) */}
        <section
          id="scan"
          className="relative z-10 isolate pb-14 pt-14 sm:pt-20"
          aria-label="Scanner"
        >
          {/* looping hero backdrop: radar sweep behind the headline; pulled up
              under the transparent sticky header (-top-20 = header height) so
              the video starts at the very top of the page, and the mask fades
              it into the page background so text stays readable. Full-bleed:
              the section is trapped in the max-w-5xl main, so the video
              centers itself on 100vw and overflows the container; the root
              overflow-x-clip eats the scrollbar-width overshoot. The src is
              NOT in the SSR HTML: preload="metadata" is ignored under
              autoplay, so a live src fetched the whole 524KB loop inside the
              LCP window and the video's first frame became the LCP element
              (~5.8s on throttled mobile). The poster paints from the SSR HTML,
              the loop attaches only after the window load event - LCP settles
              on the poster while the video fills in behind it */}
          <video
            ref={heroVideoRef}
            poster="/img/hero-poster.jpg"
            preload="none"
            loop
            muted
            playsInline
            aria-hidden
            className="pointer-events-none absolute left-1/2 -top-20 -z-10 h-[600px] w-screen max-w-none -translate-x-1/2 object-cover opacity-35 [mask-image:linear-gradient(to_bottom,black_25%,transparent_90%)]"
          />
          {/* React Bits preview: particle drift over the radar video; canvas
              pauses off-screen and respects prefers-reduced-motion internally */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-[5] [mask-image:linear-gradient(to_bottom,transparent,black_28%,black_72%,transparent)]"
          >
            <Particles
              particleCount={70}
              particleColors={["#38BDF8", "#34D399", "#94A3B8"]}
              particleBaseSize={60}
              sizeRandomness={1}
              speed={0.08}
              glow={0.3}
              twinkle={0.45}
              hoverEffect="parallax"
              particleHoverFactor={0.5}
              clickBurst={false}
              opacity={0.5}
            />
          </div>
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-sky-400">
              {t(lang, "tagline")}
            </p>
            <h1 className="font-display mt-4 text-[2rem] font-extrabold leading-[1.15] tracking-tight text-slate-50 sm:text-5xl">
              {/* plain SSR text, no scramble: the headline is the LCP element,
                  and a post-hydration reveal pinned LCP to the JS timeline */}
            {t(lang, "heroTitle")}{" "}
              <span className="appseal-gradient-text">{t(lang, "heroTitleAccent")}</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-slate-300">
              {t(lang, "heroSub")}
            </p>
          </div>

          {phase === "form" && (
            <div className="mx-auto mt-8 max-w-2xl">
              {/* relative wrapper anchors the suggestions dropdown; it lives
                  OUTSIDE .appseal-ring because the ring clips overflow */}
              <div className="relative">
                <Reveal>
                  <div className="appseal-ring">
                    <div className="appseal-glass-outer rounded-[15px] p-3">
                      <form
                        className="flex flex-col gap-3 sm:flex-row"
                        onSubmit={(e) => {
                          e.preventDefault();
                          setSuggestOpen(false);
                          const value = url.trim();
                          if (!value || !consent) return;
                          // client-side guard: "мой сайт" used to travel to the
                          // API and come back as a raw "invalid url" string
                          if (!/^https?:\/\/.+/i.test(value) && !/^([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(value)) {
                            setError(t(lang, "errInvalidUrl"));
                            setPhase("error");
                            return;
                          }
                          void startScan(value);
                        }}
                      >
                        <Input
                          value={url}
                          onChange={(e) => setUrl(e.target.value)}
                          onFocus={() => setSuggestOpen(true)}
                          onBlur={() => window.setTimeout(() => setSuggestOpen(false), 140)}
                          placeholder={t(lang, "inputPlaceholder")}
                          className="h-12 w-full flex-1 border-white/10 bg-white/[0.03] text-base text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] placeholder:text-slate-500 focus-visible:border-sky-400/50 focus-visible:ring-sky-400/[0.08]"
                          inputMode="url"
                          aria-label={lang === "ru" ? "Адрес приложения" : "App URL"}
                          data-scan-input
                          autoComplete="off"
                          required
                        />
                        <Button
                          type="submit"
                          disabled={!consent}
                          className="btn-premium h-12 px-6 text-base font-bold text-[#090d16]"
                        >
                          <Zap className="h-4 w-4" />
                          {t(lang, "scanBtn")}
                        </Button>
                      </form>
                    </div>
                  </div>
                </Reveal>
                {/* smart suggestions: live-grade examples, substring-filtered
                    by what the user is typing; items fire on mousedown so the
                    blur-delay never swallows the click */}
                {suggestOpen && suggestionMatches.length > 0 && (
                  <div
                    className="appseal-dropdown absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl"
                    role="listbox"
                    aria-label={t(lang, "suggestTitle")}
                  >
                    <p className="px-3.5 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                      {t(lang, "suggestTitle")}
                    </p>
                    {suggestionMatches.map((c) => (
                      <button
                        key={c.target}
                        type="button"
                        role="option"
                        aria-selected={false}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSuggestOpen(false);
                          track("chip_scan", { target: c.target });
                          ymGoal("chip_scan", { target: c.target });
                          void startScan(c.target);
                        }}
                        className="appseal-chip flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-semibold text-slate-300 hover:bg-slate-800/70"
                        style={{ "--grade-color": GRADE_META[c.grade].color } as CSSProperties}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: GRADE_META[c.grade].color }} />
                        <span className="font-mono">{c.target}</span>
                        <span className="ml-auto flex shrink-0 items-center gap-2 font-mono text-xs">
                          {/* the demo target intentionally scores 0: a bare
                              "E · 0" reads as a broken chip, so the demo shows
                              the note instead of the score */}
                          {c.target === "demo://app" ? (
                            <span style={{ color: GRADE_META[c.grade].color }}>{c.grade}</span>
                          ) : (
                            <span style={{ color: GRADE_META[c.grade].color }}>
                              {c.grade} · {c.score}
                            </span>
                          )}
                          {c.target === "demo://app" && (
                            <span className="text-[11px] font-medium text-slate-500 sm:hidden">
                              {t(lang, "suggestDemoNote")}
                            </span>
                          )}
                          {c.target === "demo://app" && (
                            <span className="hidden text-[11px] font-medium text-slate-500 sm:inline">
                              {t(lang, "suggestDemoNote")}
                            </span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* live hint: what the engine will actually scan */}
              {url.trim().length > 0 && !/^https?:\/\//i.test(url.trim()) && (
                <p className="mt-2 px-1 text-left text-[11px] text-slate-500">
                  {t(lang, "urlHint")}{" "}
                  <span className="font-mono text-slate-400">https://{url.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "")}</span>
                </p>
              )}

              {/* consent: collapsed accordion row (T-04) - the short line sits
                  under the CTA, the full 152-FZ text unfolds on demand */}
              <div className="mt-3.5 px-1">
                <div className="flex items-center gap-2.5">
                  <ConsentCheck
                    checked={consent}
                    onToggle={() => setConsent((v) => !v)}
                    label={lang === "ru" ? "Подтверждение прав на проверку сайта" : "Ownership confirmation"}
                  />
                  <button
                    type="button"
                    onClick={() => setConsentOpen((v) => !v)}
                    aria-expanded={consentOpen}
                    className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded text-left"
                  >
                    <span className="truncate text-[13px] font-medium text-slate-400">
                      {t(lang, "consentShort")}
                    </span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform duration-300 ${
                        consentOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                </div>
                {/* smooth height via the grid-rows trick (same as the FAQ) */}
                <div
                  className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                    consentOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="pt-2 text-[11px] leading-relaxed text-slate-500">
                      {lang === "ru"
                        ? "Запуская проверку, вы подтверждаете, что являетесь владельцем/разработчиком ресурса или действуете с его разрешения. Скан выполняется в пассивном режиме чтения публичных HTTP-ответов."
                        : "By starting the scan, you confirm that you are the owner/developer of the resource or have authorization. The scan runs in passive mode reading public HTTP responses."}
                    </p>
                  </div>
                </div>
              </div>

              {/* private scan opt-out: quiet chip-toggle instead of a second
                  checkbox row (Pass-only, mirrors the Pro card feature list) */}
              <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={privateScan}
                  aria-label={t(lang, "privateScanLabel")}
                  onClick={() => setPrivateScan((v) => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    privateScan
                      ? "border-sky-400/50 bg-sky-400/10 text-sky-300"
                      : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-slate-200"
                  }`}
                >
                  <Lock className={`h-3.5 w-3.5 ${privateScan ? "text-sky-400" : "text-slate-500"}`} />
                  {t(lang, "privateScanLabel")}
                </button>
                <span className="text-[11px] text-slate-500">{t(lang, "privateScanNote")}</span>
              </div>

              {/* trust strip: quiet pill badges under the CTA (premium SaaS
                  pattern) - icons page-local, strings from trustPills */}
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                {list(lang, "trustPills").map((p, i) => {
                  const PillIcon = [ShieldHeaders, Activity, Lock, FileCheck2][i]!;
                  return (
                    <span
                      key={p}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-slate-400"
                    >
                      <PillIcon className="h-3.5 w-3.5 text-sky-400/80" />
                      {p}
                    </span>
                  );
                })}
              </div>

              {/* empty-state filler (T-16): fresh live grades from the same
                  server-resolved chips source - clickable to re-scan */}
              <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">
                  {t(lang, "recentLabel")}
                </span>
                {demoChips
                  .filter((c) => c.target !== "demo://app")
                  .map((c) => (
                    <button
                      key={c.target}
                      type="button"
                      onClick={() => {
                        track("chip_scan", { target: c.target });
                        ymGoal("chip_scan", { target: c.target });
                        void startScan(c.target);
                      }}
                      className="appseal-chip inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 font-mono text-[11px] text-slate-500 hover:text-slate-300"
                      style={{ "--grade-color": GRADE_META[c.grade].color } as CSSProperties}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: GRADE_META[c.grade].color }} />
                      {c.target}
                      <span className="font-bold" style={{ color: GRADE_META[c.grade].color }}>
                        {c.grade}
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          )}

          {phase === "scanning" && (
            <div className="appseal-card mx-auto mt-8 max-w-2xl overflow-hidden rounded-2xl p-6 sm:p-8">
              <img
                src="/img/scan-field.webp"
                alt=""
                aria-hidden
                loading="lazy"
                decoding="async"
                className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-30"
              />
              <div className="relative">
              <div className="flex items-center gap-3">
                <span className="appseal-pulse flex h-3 w-3 rounded-full bg-sky-400" />
                <p className="font-semibold text-slate-100">{t(lang, "scanning")}</p>
                <span className="ml-auto font-mono text-sm text-sky-400">{scan?.progress ?? 0}%</span>
              </div>
              {privateFallback && (
                <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] leading-snug text-amber-300">
                  {t(lang, "privateFallbackNote")}
                </p>
              )}
              <Button
                variant="outline"
                onClick={cancelScan}
                className="mt-3 h-8 border-slate-700 bg-transparent px-3 text-[11px] font-semibold text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                {t(lang, "scanCancel")}
              </Button>
              <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[rgba(9,13,22,0.8)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${scan?.progress ?? 4}%`,
                    background: "linear-gradient(90deg, #0ea5e9 0%, #38bdf8 60%, #7dd3fc 100%)",
                    boxShadow: "0 0 12px rgba(56, 189, 248, 0.4)",
                  }}
                />
              </div>
              <p className="mt-3 text-sm text-slate-400">
                {scan?.stage?.[lang] ?? "…"}{" "}
                <span className="font-mono text-slate-500">{url ? url.replace(/^https?:\/\//, "") : "demo-app"}</span>
              </p>
              {termLines.length > 0 && (
                <div
                  className="appseal-scroll mt-3 max-h-28 overflow-auto rounded-md bg-[#090d16]/90 p-2.5 font-mono text-[11px] leading-relaxed text-slate-500"
                  aria-live="polite"
                >
                  {termLines.map((l, i) => (
                    <p key={i} className={i === termLines.length - 1 ? "text-slate-300" : ""}>
                      {l}
                    </p>
                  ))}
                </div>
              )}
              {/* live radar: categories click through as the scan advances -
                  all five of them, trust included (the differentiator the
                  copy promises) */}
              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {[
                  { key: "secrets" as const, from: 8, to: 30, Icon: KeyRound },
                  { key: "headers" as const, from: 30, to: 50, Icon: ShieldHeaders },
                  { key: "admin" as const, from: 50, to: 68, Icon: Lock },
                  { key: "liveness" as const, from: 68, to: 86, Icon: Activity },
                  { key: "trust" as const, from: 86, to: 100, Icon: Sparkles },
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
          ) : phase === "error" && privateHit ? (
            <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-amber-900/60 bg-amber-500/5 p-6 text-center">
              <Lock className="mx-auto h-8 w-8 text-amber-400" />
              <p className="mt-3 font-semibold text-amber-300">{t(lang, "privateHitTitle")}</p>
              <p className="mt-1 text-sm text-slate-400">{t(lang, "privateHitText")}</p>
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

        {/* ticker: real check names drifting by (decorative, duplicated for the
            loop); taller padding + glowing dots so it reads as an instrument
            strip instead of a hairline */}
        <div className="appseal-fade-x border-y border-slate-800/60 py-4 sm:py-5" aria-hidden>
          <div className="appseal-marquee">
            {[0, 1].map((copy) => (
              <ul
                key={copy}
                className="flex shrink-0 items-center gap-7 pr-7 font-mono text-[11px] text-slate-500"
              >
                {CHECK_TICKER.map((name) => (
                  <li key={name} className="flex items-center gap-7">
                    {name}
                    <span className="h-[3px] w-[3px] rounded-full bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.55)]" />
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>

        {/* stats */}
        <section className="appseal-sect relative py-14" aria-label={t(lang, "statsTitle")}>
          <SectionHead eyebrow={EYEBROWS.stats[lang]} title={t(lang, "statsTitle")} count="01" />
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {STATS.map((s, i) => {
              // stat1 = live apps counter (same Redis source as /stats, never
              // resets); the two percentage cards keep the static mass-run
              // snapshot with its fixed date
              const value = s.label === "stat1" ? (initialTotals?.hosts ?? s.value) : s.value;
              return (
                <Reveal key={s.label} delay={i * 0.08} className="h-full">
                  <div className="appseal-card h-full rounded-2xl p-6 text-center">
                    <p className="font-display text-5xl font-extrabold">
                      <Stat
                        value={value}
                        suffix={s.suffix}
                        decimals={s.decimals}
                        delay={0.1 + i * 0.1}
                        className="appseal-gradient-text"
                      />
                    </p>
                    {/* live dot by the caption: the numbers read as a live feed,
                        not a static screenshot */}
                    <p className="mt-2 flex items-center justify-center text-[13px] leading-relaxed text-slate-300">
                      <span
                        aria-hidden
                        className="appseal-live mr-2"
                        style={{ "--live-color": "#38bdf8", width: "6px", height: "6px" } as CSSProperties}
                      />
                      {t(lang, s.label)}
                    </p>
                  </div>
                </Reveal>
              );
            })}
          </div>
          <p className="mt-5 text-center text-xs leading-relaxed text-slate-500">
            {t(lang, "statsSource").replace(
              "{date}",
              new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-US", {
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "Asia/Yekaterinburg",
              }).format(new Date(HARVEST_TS)),
            )}{" "}
            <a
              href="/stats"
              className="text-sky-400 underline decoration-slate-700 underline-offset-2 transition hover:text-sky-300"
            >
              {t(lang, "navStats")} →
            </a>
          </p>
        </section>

        {/* how it works */}
        <section className="appseal-sect relative py-14" aria-label={t(lang, "howTitle")}>
          <SectionHead eyebrow={EYEBROWS.how[lang]} title={t(lang, "howTitle")} count="02" />
          <div className="mt-8 grid gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:gap-3">
            {[
              { icon: <Globe className="h-5 w-5" />, n: "01", ti: t(lang, "how1Title"), tx: t(lang, "how1Text"), chips: [] as string[] },
              { icon: <Zap className="h-5 w-5" />, n: "02", ti: t(lang, "how2Title"), tx: t(lang, "how2Text"), chips: list(lang, "how2Chips") },
              { icon: <FileCheck2 className="h-5 w-5" />, n: "03", ti: t(lang, "how3Title"), tx: t(lang, "how3Text"), chips: [] as string[] },
            ].map((x, i) => (
              <div key={x.n} className="contents">
                {i > 0 && (
                  <Reveal delay={i * 0.08 + 0.04} className="hidden md:block">
                    <div className="flex h-full items-center justify-center text-slate-600" aria-hidden>
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  </Reveal>
                )}
                <Reveal delay={i * 0.08} className="h-full">
                  {/* appseal-corners: monoline HUD brackets in all four corners */}
                  <div className="appseal-card appseal-corners relative flex h-full flex-col overflow-hidden rounded-2xl p-6">
                    <span
                      aria-hidden
                      className="appseal-step-num pointer-events-none absolute right-5 top-2 select-none font-mono text-5xl font-extrabold"
                    >
                      {x.n}
                    </span>
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-400/10 text-sky-400">
                      {x.icon}
                    </span>
                    <h3 className="font-display mt-4 text-base font-bold text-slate-100">{x.ti}</h3>
                    <p className="mt-2 text-[13px] leading-relaxed text-slate-300">{x.tx}</p>
                    {/* compact translucent tags keep card 02 the same visual
                        weight as its shorter neighbours */}
                    {x.chips.length > 0 && (
                      <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
                        {x.chips.map((chip) => (
                          <span
                            key={chip}
                            className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-[11px] text-slate-400"
                          >
                            {chip}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </Reveal>
              </div>
            ))}
          </div>
        </section>

        {/* grade showcase: what each rank means (out of the hero, its own beat) */}
        <section className="appseal-sect relative py-14" aria-label={t(lang, "showcaseHint")}>
          <SectionHead eyebrow={EYEBROWS.grades[lang]} title={t(lang, "showcaseHint")} count="03" />
          <Reveal className="mt-8">
            <div
              className="appseal-card mx-auto max-w-2xl overflow-hidden rounded-2xl p-5 sm:p-6"
              onMouseEnter={() => setHoverHold(true)}
              onMouseLeave={() => setHoverHold(false)}
              onFocus={() => setFocusHold(true)}
              onBlur={() => setFocusHold(false)}
            >
              <img
                src="/img/scan-field.webp"
                alt=""
                aria-hidden
                loading="lazy"
                decoding="async"
                className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40"
              />
              <div className="relative">
                <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-6">
                  <div className="relative flex shrink-0 items-center justify-center">
                    {/* soft radial glow behind the trophy, follows the active grade */}
                    <motion.span
                      aria-hidden
                      className="absolute h-36 w-36 rounded-full blur-2xl"
                      initial={false}
                      animate={{ backgroundColor: `${GRADE_META[showGrade].color}24` }}
                      transition={{ duration: 0.6 }}
                      style={{ backgroundColor: `${GRADE_META["A+"].color}24` }}
                    />
                    <motion.img
                      key={showGrade}
                      src={getTrophyPath(showGrade)}
                      alt={`AppSeal grade ${showGrade}`}
                      width={112}
                      height={112}
                      // the trophy sits below the fold (grade showcase);
                      // lazy drops the SSR preload link React emits for eager
                      // imgs, so the file no longer races the hero for
                      // bandwidth; decoding=async moves decode off the
                      // main thread - the fade/scale animation is untouched
                      loading="lazy"
                      decoding="async"
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1, filter: `drop-shadow(0 0 22px ${GRADE_META[showGrade].color}66)` }}
                      transition={{ duration: 0.35 }}
                      className="relative h-28 w-28 object-contain"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap justify-center gap-1.5 sm:justify-start">
                      {GRADE_ORDER.map((g) => {
                        const m = GRADE_META[g];
                        const active = g === showGrade;
                        return (
                          <button
                            key={g}
                            onClick={() => {
                              setShowGrade(g);
                              setCycleSeed((s) => s + 1);
                            }}
                            className="rounded-lg border px-2.5 py-1 font-display text-sm font-extrabold transition"
                            style={
                              active
                                ? { color: m.color, borderColor: `${m.color}66`, backgroundColor: `${m.color}14` }
                                : { color: "#64748b", borderColor: "rgba(30,41,59,0.8)" }
                            }
                            aria-pressed={active}
                            aria-label={
                              lang === "ru"
                                ? `Показать описание класса ${g}`
                                : `Show the description of grade ${g}`
                            }
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
            </div>
          </Reveal>
        </section>

        {/* first real case */}
        <section className="appseal-sect relative py-14" aria-label={t(lang, "caseTitle")}>
          <SectionHead eyebrow={EYEBROWS.case[lang]} title={t(lang, "caseTitle")} sub={t(lang, "caseSub")} count="04" />
          <Reveal className="mt-8">
            <div className="appseal-ring mx-auto max-w-3xl">
              <div className="appseal-glass-outer rounded-[15px] p-6 sm:p-8">
                {/* timeline: lime 86 -> emerald 91, revealed step by step */}
                <div className="grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
                  {[
                    {
                      d: 0,
                      cls: "rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 text-center",
                      t: "caseStep1t" as const,
                      n: "caseStep1n" as const,
                      nc: "text-lime-400",
                      dKey: "caseStep1d" as const,
                    },
                    {
                      d: 0.06,
                      cls: "rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 text-center",
                      t: "caseStep2t" as const,
                      n: "caseStep2n" as const,
                      nc: "text-slate-300",
                      dKey: "caseStep2d" as const,
                    },
                    {
                      d: 0.12,
                      cls: "appseal-case-win relative rounded-xl border border-white/[0.06] p-5 text-center",
                      t: "caseStep3t" as const,
                      n: "caseStep3n" as const,
                      nc: "text-emerald-400",
                      dKey: "caseStep3d" as const,
                    },
                  ].flatMap((step, idx) => [
                    idx > 0 && (
                      <Reveal key={`arrow-${idx}`} delay={step.d - 0.03}>
                        <div className="hidden h-full items-center justify-center text-slate-600 sm:flex" aria-hidden>
                          <ArrowRight className="h-4 w-4" />
                        </div>
                      </Reveal>
                    ),
                    <Reveal key={step.t} delay={step.d} className="h-full">
                      <div className={`h-full ${step.cls}`}>
                        {idx === 2 && <span aria-hidden className="appseal-glow-once" />}
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t(lang, step.t)}</p>
                        <p className={`font-display mt-2 text-2xl font-extrabold ${step.nc}`}>{t(lang, step.n)}</p>
                        <p className="mt-2 text-[13px] leading-relaxed text-slate-400">{t(lang, step.dKey)}</p>
                      </div>
                    </Reveal>,
                  ])}
                </div>

            {/* mini-terminal with the real fix-prompt fragment: deep charcoal
                pane reads as a recessed screen inside the glass panel, the
                striped scanline raster is dropped - it shimmered over text */}
            <div className="relative mt-6 overflow-hidden rounded-xl border border-white/[0.06] bg-[#020408]/85">
              <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-4 py-2.5">
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
                  className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-400 transition hover:border-sky-500/50 hover:text-sky-400"
                >
                  {caseCopied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  {caseCopied ? t(lang, "copied") : t(lang, "copyBtn")}
                </button>
              </div>
              <pre className="overflow-x-auto p-4 font-mono text-[11px] leading-relaxed text-slate-300">
                {t(lang, "casePrompt")}
              </pre>
            </div>

            <p className="mt-6 text-[13px] leading-relaxed text-slate-300">{t(lang, "caseBody")}</p>
                <p className="font-display mt-4 text-sm font-bold text-sky-300">{t(lang, "caseQuote")}</p>
                <a
                  href={`/report/${CASE_REPORT_ID}`}
                  target="_blank"
                  rel="noopener"
                  className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-sky-400 underline decoration-dotted underline-offset-4 transition hover:text-sky-300"
                >
                  {t(lang, "caseReportLink")}
                </a>
              </div>
            </div>
          </Reveal>
        </section>

        {/* public registry: prominent placement after the proof case */}
        <section className="appseal-sect relative py-14" aria-label={t(lang, "issue2Title")}>
          <Reveal>
            <div className="appseal-ring mx-auto max-w-3xl">
              <div className="appseal-glass-outer rounded-[15px] p-6 sm:p-10">
                <div className="flex flex-col items-center gap-7 sm:flex-row sm:gap-9">
                  <div className="min-w-0 flex-1 text-center sm:text-left">
                    <h2 className="font-display text-2xl font-bold text-slate-100">
                      {t(lang, "issue2Title")}
                    </h2>
                    <p className="mx-auto mt-3 max-w-xl text-[13px] leading-relaxed text-slate-300 sm:mx-0">
                      {t(lang, "issue2Sub")}
                    </p>
                    <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap sm:justify-start">
                      <Button
                        className="rounded-[10px] bg-sky-400 px-5 text-sm font-bold text-[#090d16] hover:bg-sky-300"
                        onClick={() => {
                          window.scrollTo({ top: 0, behavior: "smooth" });
                          document.querySelector<HTMLInputElement>('input[data-scan-input]')?.focus();
                        }}
                      >
                        <Zap className="h-4 w-4" />
                        {t(lang, "issue2CtaScan")}
                      </Button>
                      <a
                        href="/registry"
                        className="rounded-[10px] border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-sky-500/50 hover:text-sky-400"
                      >
                        {t(lang, "issue2CtaRegistry")} →
                      </a>
                    </div>
                  </div>
                  {/* trust seal artwork: no box inside the box - the hologram
                      floats in the glass, edges melt out via a radial mask */}
                  <div aria-hidden className="relative hidden h-60 w-60 shrink-0 sm:block md:h-72 md:w-72">
                    <img
                      src="/img/seal.webp"
                      alt=""
                      loading="lazy"
                      // intrinsic size + async decode: the ratio hint costs
                      // nothing (h-full w-full still controls the box) and the
                      // 1000x1000 png decodes off the main thread while scrolling
                      width={1000}
                      height={1000}
                      decoding="async"
                      className="h-full w-full object-cover [mask-image:radial-gradient(circle,black_48%,transparent_72%)]"
                    />
                  </div>
                </div>

                {/* live registry hint: glass pills with real grades from the
                    same server-resolved source as the hero chips - the demo
                    fixture is a suggestion chip, not a registry entry */}
                <div className="mx-auto mt-8 flex max-w-md flex-wrap items-center justify-center gap-2 font-mono text-[11px]">
                  {demoChips
                    .filter((c) => c.target !== "demo://app")
                    .map((c) => (
                    <span
                      key={c.target}
                      className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-slate-400"
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: GRADE_META[c.grade].color }} />
                      <span>{c.target}</span>
                      <span className="font-bold" style={{ color: GRADE_META[c.grade].color }}>
                        {c.grade}
                      </span>
                    </span>
                  ))}
                  <span className="inline-flex items-center rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-slate-600">
                    ···
                  </span>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* what we check */}
        <section className="appseal-sect relative py-14" aria-label={t(lang, "checksTitle")}>
          <SectionHead eyebrow={EYEBROWS.engine[lang]} title={t(lang, "checksTitle")} sub={t(lang, "checksSub")} count="05" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {CHECK_CATEGORIES.map((c, i) => (
              <Reveal
                key={c.key}
                delay={(i % 2) * 0.08}
                className={`h-full ${c.key === "trust" ? "sm:col-span-2" : ""}`}
              >
                <div className="appseal-card flex h-full flex-col overflow-hidden rounded-2xl p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-400/10 text-sky-400">
                      {c.icon}
                    </span>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                      {CATEGORY_META[c.key].title[lang]}
                    </h3>
                    <span className="appseal-count-badge ml-auto shrink-0 rounded border border-slate-700 bg-[#090d16] px-2 py-0.5 font-mono text-[11px] font-semibold text-sky-400">
                      [{c.count[lang]}]
                    </span>
                  </div>
                  <ul className="mt-4 space-y-2">
                    {c.items[lang].split("|").map((item) => (
                      <li key={item} className="flex items-start gap-2 text-[13px] text-slate-300">
                        <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400/70" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  {/* footer strip: one hairline across the card + a light
                      bottom shade instead of yet another bordered box */}
                  <div className="mt-auto border-t border-white/[0.06] bg-black/[0.25] px-6 pb-5 pt-3 -mx-6 -mb-6">
                    <p className="text-[11px] leading-relaxed text-slate-500">
                      {c.extra[lang]}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ecosystem: the tool belt that grew around the scanner - versus,
            fix guides, weekly digest, CI gate, Telegram bot and the JSON API.
            Whole cards are links, one honest sentence per card */}
        <section className="appseal-sect relative py-14" aria-label={t(lang, "ecoTitle")}>
          <SectionHead eyebrow={EYEBROWS.eco[lang]} title={t(lang, "ecoTitle")} sub={t(lang, "ecoSub")} count="06" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                { href: "/versus", icon: Scale, tKey: "ecoVersusT", dKey: "ecoVersusD" },
                { href: "/fixes", icon: FileCheck2, tKey: "ecoFixesT", dKey: "ecoFixesD" },
                { href: "/digest", icon: Activity, tKey: "ecoDigestT", dKey: "ecoDigestD" },
                { href: "/ci", icon: GitBranch, tKey: "ecoCiT", dKey: "ecoCiD" },
                { href: "/bot", icon: Send, tKey: "ecoBotT", dKey: "ecoBotD" },
                { href: "/api", icon: CodeXml, tKey: "ecoApiT", dKey: "ecoApiD" },
              ] as const
            ).map((c, i) => (
              <Reveal key={c.tKey} delay={(i % 3) * 0.08} className="h-full">
                <a
                  href={c.href}
                  className="appseal-card group flex h-full flex-col rounded-2xl p-6"
                >
                  {/* one uniform glass tile + cold white icon with a faint sky
                      glow: the six-card grid reads as a single instrument
                      panel instead of a color patchwork */}
                  <span className="appseal-glass-tile flex h-9 w-9 items-center justify-center rounded-lg text-slate-200">
                    <c.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-sm font-bold leading-snug text-slate-100">{t(lang, c.tKey)}</h3>
                  <p className="mt-2 flex-1 text-[13px] leading-relaxed text-slate-300">{t(lang, c.dKey)}</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-sky-400">
                    {t(lang, "ecoCardCta")}
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                </a>
              </Reveal>
            ))}
          </div>
        </section>

        {/* pricing */}
        <section
          id="pricing"
          className="appseal-sect scroll-mt-16 relative isolate overflow-hidden py-14"
          aria-label={t(lang, "pricingTitle")}
        >
          {/* light streak behind the plans: premium beat, lazy-loaded and
              only playing while on screen */}
          <BackdropVideo
            src="/video/Light_refracting.mp4"
            className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover opacity-40 [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_82%,transparent)]"
          />
          <SectionHead eyebrow={EYEBROWS.pricing[lang]} title={t(lang, "pricingTitle")} sub={t(lang, "pricingSub")} count="07" />
          <p className="mx-auto mt-4 max-w-2xl text-center text-sm leading-relaxed text-slate-300">
            {t(lang, "planHeroLine")}
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {/* Free plan */}
            <Reveal className="h-full">
              <SpotlightCard
                className="appseal-plan-calm flex h-full flex-col rounded-2xl p-6"
                spotlightColor="rgba(148,163,184,0.35)"
                intensity={0.45}
                spotlightSize={280}
              >
                {/* name + "free forever" tag: the plan needs its own anchor,
                    otherwise the calm card reads as an empty stub */}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">{t(lang, "planFree")}</p>
                  <span className="rounded-full border border-sky-400/25 bg-sky-400/[0.07] px-2.5 py-0.5 text-[10px] font-bold text-sky-300">
                    {t(lang, "planFreeTag")}
                  </span>
                </div>
                <p className="font-display mt-4 text-4xl font-extrabold text-slate-100">{t(lang, "planFreePrice")}</p>
                <div className="my-5 h-px bg-white/5" />
                <ul className="space-y-2.5">
                  {list(lang, "planFreeFeats").map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[13px] leading-snug text-slate-300">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-sky-400/70" strokeWidth={2.5} />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-5">
                  <p className="mb-2.5 text-center text-[11px] text-slate-500">{t(lang, "planFreeNote")}</p>
                  <Button
                    className="h-11 w-full rounded-xl border border-white/[0.15] bg-white/[0.05] text-[13px] font-bold text-slate-100 shadow-none hover:bg-white/[0.09]"
                    onClick={() => {
                      window.scrollTo({ top: 0, behavior: "smooth" });
                      document.querySelector<HTMLInputElement>('input[data-scan-input]')?.focus();
                    }}
                  >
                    <ArrowUp className="h-4 w-4" />
                    {t(lang, "planFreeCta")}
                  </Button>
                </div>
              </SpotlightCard>
            </Reveal>
            {/* Launch Pass: static neon emerald frame, featured center card */}
            <Reveal delay={0.08} className="h-full">
              <div className="relative h-full">
                <span className="absolute -top-3.5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-emerald-200/40 bg-emerald-400 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[#090d16] shadow-[0_0_26px_-2px_rgba(52,211,153,0.8)]">
                  {t(lang, "planMostPopular")}
                </span>
                <div className="appseal-glass-panel flex h-full flex-col rounded-2xl border border-emerald-400/60 p-6 shadow-[0_0_32px_-8px_rgba(52,211,153,0.55),0_0_90px_-28px_rgba(52,211,153,0.4)]">
                  <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-2xl bg-emerald-400/[0.05]" />
                  <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">{t(lang, "planLP")}</p>
                  <p className="font-display mt-4 text-5xl font-extrabold text-emerald-400 drop-shadow-[0_0_16px_rgba(52,211,153,0.35)]">{t(lang, "planLPPrice")}</p>
                  <p className="mt-2 text-[11px] leading-snug text-slate-400">{t(lang, "planLPSub")}</p>
                  <div className="my-5 h-px bg-white/5" />
                  <ul className="space-y-2.5">
                    {list(lang, "planLPFeats").map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-[13px] leading-snug text-slate-300">
                        <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-emerald-400">
                          <Check className="h-2.5 w-2.5 text-[#090d16]" strokeWidth={3.5} />
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-5">
                    <p className="mb-2.5 text-center text-[11px] text-slate-400">{t(lang, "planPaidNote")}</p>
                    {/* the whole funnel lives in the bot: it asks for the domain
                        and the receipt email in the chat (start=ru-lp falls
                        through to the greeting menu with the plan buttons) */}
                    <a
                      href={`https://t.me/AppSeal_Monitor_Bot?start=${lang === "en" ? "en" : "ru"}-lp`}
                      onClick={() => {
                        track("checkout_bot", { lang });
                        ymGoal("checkout_bot", { lang });
                      }}
                      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 text-[13px] font-bold text-[#090d16] shadow-[0_10px_28px_-10px_rgba(52,211,153,0.55)] transition hover:bg-emerald-300"
                    >
                      <Zap className="h-4 w-4" />
                      {t(lang, "planLPCta")}
                    </a>
                  </div>
                </div>
              </div>
            </Reveal>

            {/* Pro Pass: 30 days one-time, violet beat between LP and Agency */}
            <Reveal delay={0.16} className="h-full">
              <SpotlightCard
                className="appseal-plan-calm flex h-full flex-col rounded-2xl p-6"
                spotlightColor="rgba(148,163,184,0.35)"
                intensity={0.45}
                spotlightSize={280}
              >
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">{t(lang, "planPro")}</p>
                <p className="font-display mt-4 text-4xl font-extrabold text-slate-100">
                  {t(lang, "planProPrice")}{" "}
                  <span className="whitespace-nowrap text-sm font-semibold text-slate-400">{t(lang, "planProPer")}</span>
                </p>
                {/* Pro and Agency share one price - the per-day math gives Pro
                    its own value anchor instead of looking like a duplicate */}
                <span className="mt-2.5 inline-flex w-fit items-center rounded-full border border-sky-400/25 bg-sky-400/[0.07] px-2.5 py-0.5 font-mono text-[11px] font-semibold text-sky-300">
                  {t(lang, "planProDeal")}
                </span>
                <p className="mt-2 text-[11px] leading-snug text-slate-400">{t(lang, "planProSub")}</p>
                <div className="my-5 h-px bg-white/5" />
                <ul className="space-y-2.5">
                  {list(lang, "planProFeats").map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[13px] leading-snug text-slate-300">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-sky-400/70" strokeWidth={2.5} />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-5">
                  <p className="mb-2.5 text-center text-[11px] text-slate-400">{t(lang, "planPaidNote")}</p>
                  <a
                    href={`https://t.me/AppSeal_Monitor_Bot?start=${lang === "en" ? "en" : "ru"}-pro`}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/[0.15] bg-white/[0.05] text-[13px] font-bold text-slate-100 transition hover:bg-white/[0.09]"
                  >
                    <Send className="h-4 w-4" />
                    {t(lang, "planProCta")}
                  </a>
                </div>
              </SpotlightCard>
            </Reveal>

            {/* Agency Pack: wholesale passes for studios, same one-time bot flow */}
            <Reveal delay={0.24} className="h-full">
              <SpotlightCard
                className="appseal-plan-calm flex h-full flex-col rounded-2xl p-6"
                spotlightColor="rgba(148,163,184,0.35)"
                intensity={0.45}
                spotlightSize={280}
              >
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">{t(lang, "planAgencyTitle")}</p>
                <p className="font-display mt-4 text-4xl font-extrabold text-slate-100">
                  {t(lang, "planAgencyPrice")}{" "}
                  <span className="whitespace-nowrap text-sm font-semibold text-slate-400">{t(lang, "planAgencyPer")}</span>
                </p>
                {/* value badge with the per-project math - the deal is the
                    reason this card exists, so it gets weight (T-09) */}
                <span className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/[0.12] px-3 py-1 text-[11px] font-bold text-emerald-300 shadow-[0_0_14px_-4px_rgba(52,211,153,0.5)]">
                  <span aria-hidden className="font-mono">↓</span>
                  {t(lang, "planAgencyDeal")}
                </span>
                <p className="mt-2 text-[11px] leading-snug text-slate-400">{t(lang, "planAgencySub")}</p>
                <div className="my-5 h-px bg-white/5" />
                <ul className="space-y-2.5">
                  {list(lang, "planAgencyFeats").map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[13px] leading-snug text-slate-300">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-sky-400/70" strokeWidth={2.5} />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-5">
                  <p className="mb-2.5 text-center text-[11px] text-slate-400">{t(lang, "planPaidNote")}</p>
                  <a
                    href={`https://t.me/AppSeal_Monitor_Bot?start=${lang === "en" ? "en" : "ru"}-pack5`}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/[0.15] bg-white/[0.05] text-[13px] font-bold text-slate-100 transition hover:bg-white/[0.09]"
                  >
                    <Send className="h-4 w-4" />
                    {t(lang, "planAgencyCta")}
                  </a>
                </div>
              </SpotlightCard>
            </Reveal>
          </div>
          {/* quiet refund promise: one calm line, no badge */}
          <p className="mt-6 text-center text-xs leading-relaxed text-slate-500">
            {t(lang, "planRefundNote")}
          </p>
          {/* platform: wide contact bar under the plans */}
          <Reveal className="mt-5">
            <div className="appseal-card appseal-glass rounded-2xl p-5 sm:p-6">
              <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-100">
                    Platform · <span className="font-normal text-slate-400">{t(lang, "planPlatformPrice")}</span>
                  </p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-slate-300">{t(lang, "platformRowText")}</p>
                </div>
                <a
                  href="https://t.me/peexthree"
                  target="_blank"
                  rel="noopener"
                  className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-white/[0.15] bg-white/[0.05] px-6 text-[13px] font-bold text-slate-100 transition hover:bg-white/[0.09]"
                >
                  <Send className="h-4 w-4" />
                  {t(lang, "telegramCta")}
                </a>
              </div>
            </div>
          </Reveal>
        </section>

        {/* reviews: moderated user testimonials straight from Supabase -
            social proof stays honest, nothing shows until a moderator clicks */}
        <section className="appseal-sect relative py-14" aria-label={t(lang, "reviewsTitle")}>
          <SectionHead
            eyebrow={EYEBROWS.reviews[lang]}
            title={t(lang, "reviewsTitle")}
            sub={t(lang, "reviewsSubtitle")}
            count="08"
          />
          <LandingReviews lang={lang} />
          <Reveal className="mt-8 text-center">
            <a
              href="/reviews"
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-sky-500/50 hover:text-sky-400"
            >
              {t(lang, "reviewsCta")}
              <ArrowRight className="h-4 w-4" />
            </a>
          </Reveal>
        </section>

        {/* FAQ */}
        <section className="appseal-sect relative py-14" aria-label={t(lang, "faqTitle")}>
          <SectionHead eyebrow={EYEBROWS.faq[lang]} title={t(lang, "faqTitle")} count="09" />
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
                ["faq9Q", "faq9A"],
              ] as const
            ).map(
              ([q, a], i) => {
                const open = faqOpen.includes(i);
                return (
                  <Reveal key={q} delay={Math.min(i * 0.04, 0.2)}>
                    <div className="appseal-card rounded-xl p-5">
                      <button
                        onClick={() => toggleFaq(i)}
                        aria-expanded={open}
                        className="flex w-full items-start gap-3 text-left text-sm font-semibold text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
                      >
                        <ChevronDown
                          className={`mt-0.5 h-4 w-4 shrink-0 text-sky-400 transition-transform duration-300 ${
                            open ? "rotate-180" : ""
                          }`}
                        />
                        <span>{t(lang, q)}</span>
                      </button>
                      {/* smooth height via the grid-rows trick */}
                      <div
                        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                        }`}
                      >
                        <div className="overflow-hidden">
                          <p className="pl-7 pt-3 text-[13px] leading-relaxed text-slate-300">{t(lang, a)}</p>
                        </div>
                      </div>
                    </div>
                  </Reveal>
                );
              },
            )}
          </div>
        </section>
      </main>

      {/* footer */}
      <footer className="relative z-10 mt-auto bg-[#070b13]">
        {/* gradient top edge, mirrors the header */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/40 to-transparent"
        />
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-5 px-4 py-10 text-center sm:flex-row sm:px-6 sm:text-left">
          <div className="space-y-1.5">
            <p className="text-xs text-slate-500">
              © {new Date().getFullYear()} AppSeal · {t(lang, "footerText")}
            </p>
            <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 py-1 font-mono text-[11px] text-slate-700 sm:justify-start">
              <span>{t(lang, "footerEngine")}</span>
              <span>·</span>
              {list(lang, "footerNav").map((label, i) => (
                <span key={FOOTER_NAV_HREFS[i]} className="inline-flex items-center gap-2">
                  {i > 0 && <span>·</span>}
                  {/* py padding grows the tap target: 10px type with a 6px
                      gap made footer links ~14px tall on phones */}
                  <a href={FOOTER_NAV_HREFS[i]} className="px-0.5 py-1 transition hover:text-slate-400">
                    {label}
                  </a>
                </span>
              ))}
              <span>·</span>
              <a href="https://t.me/AppSeal_Monitor_Bot" target="_blank" rel="noopener" className="px-0.5 py-1 transition hover:text-slate-400">
                bot
              </a>
              <span>·</span>
              <a href="https://t.me/peexthree" target="_blank" rel="noopener" className="px-0.5 py-1 transition hover:text-slate-400">
                telegram
              </a>
              <span>·</span>
              <span
                className={
                  sysOk === false
                    ? "inline-flex items-center gap-1.5 text-amber-500/90"
                    : sysOk === true
                      ? "inline-flex items-center gap-1.5 text-emerald-500/90"
                      : "inline-flex items-center gap-1.5 text-slate-600"
                }
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    sysOk === false ? "bg-amber-400" : sysOk === true ? "appseal-pulse bg-emerald-400" : "bg-slate-600"
                  }`}
                />
                {t(lang, sysOk === false ? "footerStatusDeg" : sysOk === true ? "footerStatus" : "footerStatusCheck")}
              </span>
            </p>
          </div>
          <div className="shrink-0 text-center">
            <a
              href="/verified/appseal.online"
              target="_blank"
              rel="noopener"
              title="AppSeal Security Verified - live grade"
              className="inline-block transition-transform hover:scale-[1.02]"
            >
              <img
                src="/api/badge?host=appseal.online"
                alt="AppSeal Verified"
                width={228}
                height={44}
                // footer badge below the fold: lazy removes the eager SSR
                // preload/fetch that competed with the hero, async decode
                // keeps it off the main thread; 228x44 attrs already pin
                // the box, so there is no layout shift either way
                loading="lazy"
                decoding="async"
                className="h-[44px] w-[228px] drop-shadow-[0_4px_16px_rgba(192,132,252,0.18)]"
              />
            </a>
            <p className="mt-1.5 max-w-[228px] text-[11px] leading-snug text-slate-600">
              {t(lang, "footerBadgeNote")}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
