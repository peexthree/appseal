"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { Lang } from "@/lib/scanner/types";
import { t } from "@/lib/i18n";
import {
  Activity, ChevronDown, CodeXml, FileCheck2, GitBranch, Globe, Menu, Scale, Send, ShieldCheck, X, Zap,
} from "@/components/icons/appseal-icons";

// The one header tool for the whole site: the landing passes its live lang +
// switchLang, inner pages render it standalone (lang seeds from the same
// appseal-lang localStorage key). Identical behavior everywhere: fully
// transparent at rest, collapses on scroll into a small left logo-pill whose
// tap opens the grouped quick-links mini-panel.
const NAV_SECTIONS = [
  { href: "/", key: "navHome", icon: Globe, group: "main" },
  { href: "/registry", key: "navRegistry", icon: FileCheck2, group: "main" },
  { href: "/stats", key: "navStats", icon: Activity, group: "main" },
  { href: "/versus", key: "navVersus", icon: Scale, group: "tools" },
  { href: "/fixes", key: "navFixes", icon: FileCheck2, group: "tools" },
  { href: "/digest", key: "navDigest", icon: Activity, group: "tools" },
  { href: "/ci", key: "navCi", icon: GitBranch, group: "tools" },
  { href: "/bot", key: "navBot", icon: Send, group: "tools" },
  { href: "/api", key: "navApi", icon: CodeXml, group: "tools" },
] as const;

// tail lives outside the groups, like on the landing panel
const NAV_TAIL = [
  { href: "/#pricing", key: "navPricing", icon: Zap },
  { href: "/legal", key: "navLegal", icon: ShieldCheck },
] as const;

// desktop at-rest row: two product pages, the tools dropdown, pricing
const NAV_ROW = [
  { href: "/registry", key: "navRegistry" },
  { href: "/stats", key: "navStats" },
] as const;

const NAV_ROW_TOOLS = [
  { href: "/versus", key: "navVersus", icon: Scale },
  { href: "/fixes", key: "navFixes", icon: FileCheck2 },
  { href: "/digest", key: "navDigest", icon: Activity },
  { href: "/ci", key: "navCi", icon: GitBranch },
  { href: "/bot", key: "navBot", icon: Send },
  { href: "/api", key: "navApi", icon: CodeXml },
] as const;

const pillIdle = "text-slate-300 hover:bg-white/5 hover:text-white";
const pillActive = "bg-sky-400/10 text-sky-400";

/** module-level so the component body never writes to document globals */
function persistLangCookie(l: Lang): void {
  document.cookie = `appseal-lang=${l}; path=/; max-age=31536000; samesite=lax`;
}

export function SiteHeader({
  lang: langProp,
  onSwitchLang,
}: {
  /** landing supplies its SSR-seeded lang; standalone pages fall back to localStorage */
  lang?: Lang;
  onSwitchLang?: (l: Lang) => void;
} = {}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // standalone pages seed the language from the same cookie/localStorage the
  // switcher writes, via a store subscription instead of a sync setState in
  // an effect (no cascading renders; SSR snapshot "" keeps server output)
  const storedLang = useSyncExternalStore(
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
  const reduceMotion = useReducedMotion();
  const headerRef = useRef<HTMLElement>(null);
  const pathname = usePathname();

  const lang = langProp ?? (storedLang === "ru" || storedLang === "en" ? storedLang : "ru");
  const router = useRouter();
  const switchLang = (l: Lang) => {
    if (onSwitchLang) {
      onSwitchLang(l);
    } else {
      try {
        localStorage.setItem("appseal-lang", l);
        // inner pages render server-side in the cookie language: persist the
        // choice and refresh the RSC tree so the whole page switches, not
        // just the navbar; client views also get the instant event
        persistLangCookie(l);
        window.dispatchEvent(new CustomEvent("appseal-lang", { detail: l }));
        router.refresh();
      } catch {
        /* private mode */
      }
    }
  };

  // compact header once the page is scrolled a bit (rAF-throttled)
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        setScrolled(window.scrollY > 8);
        raf = 0;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // close the quick-links panel or tools dropdown on an outside pointer or Escape
  useEffect(() => {
    if (!menuOpen && !toolsOpen) return;
    const onDown = (e: PointerEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setToolsOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setToolsOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, toolsOpen]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const toolsActive = NAV_ROW_TOOLS.some((i) => isActive(i.href));

  return (
    <header ref={headerRef} className="sticky top-0 z-40 w-full">
      <div
        className={`flex items-center justify-between transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
          scrolled
            ? "ml-4 mt-3 h-12 md:ml-6"
            : "ml-[calc((100%_-_min(100%,64rem))/2)] h-20 w-full max-w-5xl px-4 sm:px-6"
        }`}
      >
        <a
          href="/"
          onClick={(e) => {
            if (scrolled) {
              e.preventDefault();
              setMenuOpen((v) => !v);
            }
          }}
          className="group flex shrink-0 items-center gap-3"
          aria-label="AppSeal home"
          aria-expanded={scrolled ? menuOpen : undefined}
        >
          <img
            src="/ico.png"
            alt="AppSeal"
            width={56}
            height={56}
            className={`object-contain drop-shadow-[0_0_14px_rgba(56,189,248,0.4)] transition-all duration-500 ${
              scrolled ? "h-7 w-7" : "h-14 w-14"
            }`}
          />
          <span
            className={`font-display font-extrabold tracking-tight transition-all duration-500 ${
              scrolled ? "text-lg" : "text-2xl"
            }`}
          >
            AppSeal
          </span>
          <span
            className={`grid place-items-center transition-all duration-300 ${
              scrolled ? "h-6 w-6 opacity-100" : "h-0 w-0 opacity-0"
            }`}
          >
            <ChevronDown
              className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-300 ${menuOpen ? "rotate-180" : ""}`}
            />
          </span>
        </a>

        <nav
          className={`hidden items-center gap-1 md:flex transition-all duration-300 ${
            scrolled ? "pointer-events-none w-0 overflow-hidden opacity-0" : "opacity-100"
          }`}
          aria-label="Site"
        >
          {NAV_ROW.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
                isActive(item.href) ? pillActive : pillIdle
              }`}
            >
              {t(lang, item.key)}
            </Link>
          ))}
          {/* tools dropdown: the six instruments that grew around the scanner */}
          <div className="relative">
            <button
              onClick={() => setToolsOpen((v) => !v)}
              aria-expanded={toolsOpen}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
                toolsActive ? pillActive : pillIdle
              }`}
            >
              {t(lang, "navTools")}
              <ChevronDown
                className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-300 ${toolsOpen ? "rotate-180" : ""}`}
              />
            </button>
            <AnimatePresence>
              {toolsOpen && (
                <motion.nav
                  key="tools-panel"
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.97 }}
                  transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }}
                  style={{ transformOrigin: "top left" }}
                  className="absolute left-0 top-[calc(100%+8px)] z-50 w-64 rounded-2xl border border-white/10 bg-black/85 p-2 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.7)] backdrop-blur-2xl"
                  aria-label={t(lang, "navTools")}
                >
                  {NAV_ROW_TOOLS.map((item) => (
                    <Link
                      key={item.key}
                      href={item.href}
                      onClick={() => setToolsOpen(false)}
                      className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition hover:bg-white/5 hover:text-white ${
                        isActive(item.href) ? "text-sky-400" : "text-slate-300"
                      }`}
                    >
                      <item.icon
                        className={`h-4 w-4 shrink-0 transition ${
                          isActive(item.href) ? "text-sky-400" : "text-slate-500 group-hover:text-sky-400"
                        }`}
                      />
                      {t(lang, item.key)}
                    </Link>
                  ))}
                </motion.nav>
              )}
            </AnimatePresence>
          </div>
          <a
            href="/#pricing"
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${pillIdle}`}
          >
            {t(lang, "navPricing")}
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <nav
            className={`hidden items-center rounded-full border border-white/10 bg-white/5 p-0.5 transition-all duration-300 sm:flex ${
              scrolled ? "pointer-events-none w-0 overflow-hidden opacity-0" : "opacity-100"
            }`}
            aria-label="Language"
          >
            {(["ru", "en"] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => switchLang(l)}
                className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase transition ${
                  lang === l ? "bg-sky-400 text-[#090d16]" : "text-slate-400 hover:text-slate-200"
                }`}
                aria-pressed={lang === l}
              >
                {l}
              </button>
            ))}
          </nav>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10 md:hidden"
            aria-expanded={menuOpen}
            aria-label="Menu"
          >
            {menuOpen ? <X className="h-4.5 w-4.5" /> : <Menu className="h-4.5 w-4.5" />}
          </button>
        </div>
      </div>

      {/* quick-links mini panel: shared by the mobile burger and the collapsed
          desktop header - a small glass sheet anchored under the logo */}
      <AnimatePresence>
        {menuOpen && (
          <motion.nav
            key="menu-panel"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: "top left" }}
            className={`absolute left-4 z-50 w-64 rounded-2xl border border-white/10 bg-black/85 p-2 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.7)] backdrop-blur-2xl md:left-6 ${
              scrolled ? "top-[64px]" : "top-[86px]"
            }`}
            aria-label="Menu"
          >
            {(["main", "tools"] as const).map((g) => (
              <div key={g}>
                <p className="px-3 pb-1 pt-2 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-slate-600">
                  {t(lang, g === "main" ? "navGroupMain" : "navGroupTools")}
                </p>
                {NAV_SECTIONS.filter((item) => item.group === g).map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition hover:bg-white/5 hover:text-white ${
                      isActive(item.href) ? "text-sky-400" : "text-slate-300"
                    }`}
                  >
                    <item.icon
                      className={`h-4 w-4 shrink-0 transition ${
                        isActive(item.href) ? "text-sky-400" : "text-slate-500 group-hover:text-sky-400"
                      }`}
                    />
                    {t(lang, item.key)}
                  </Link>
                ))}
              </div>
            ))}
            {/* tail: pricing and legal, kept out of the main groups */}
            <div className="mt-1 border-t border-white/5 pt-1">
              {NAV_TAIL.map((item) => (
                <a
                  key={item.key}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-slate-400 transition hover:bg-white/5 hover:text-white"
                >
                  <item.icon className="h-4 w-4 shrink-0 text-slate-600 transition group-hover:text-sky-400" />
                  {t(lang, item.key)}
                </a>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-center gap-1 border-t border-white/5 pt-2">
              {(["ru", "en"] as Lang[]).map((l) => (
                <button
                  key={l}
                  onClick={() => switchLang(l)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold uppercase transition ${
                    lang === l ? "bg-sky-400 text-[#090d16]" : "text-slate-400 hover:text-slate-200"
                  }`}
                  aria-pressed={lang === l}
                >
                  {l}
                </button>
              ))}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
