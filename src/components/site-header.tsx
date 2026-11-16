"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { t } from "@/lib/i18n";
import {
  Activity, ChevronDown, CodeXml, FileCheck2, GitBranch, Globe, Menu, Scale, Send, ShieldCheck, X, Zap,
} from "@/components/icons/appseal-icons";

// The landing header (scanner-page.tsx) owns its own transparent/collapsing
// chrome; this one is the consistent tool for every inner page so navigation
// never disappears outside the home. Same items, same grouping.
const NAV_SECTIONS = [
  { href: "/", key: "navHome", icon: Globe },
  { href: "/registry", key: "navRegistry", icon: FileCheck2 },
  { href: "/stats", key: "navStats", icon: Activity },
] as const;

const NAV_TOOLS = [
  { href: "/versus", key: "navVersus", icon: Scale },
  { href: "/fixes", key: "navFixes", icon: FileCheck2 },
  { href: "/digest", key: "navDigest", icon: Activity },
  { href: "/ci", key: "navCi", icon: GitBranch },
  { href: "/bot", key: "navBot", icon: Send },
  { href: "/api", key: "navApi", icon: CodeXml },
] as const;

const NAV_TAIL = [
  { href: "/#pricing", key: "navPricing", icon: Zap },
  { href: "/legal", key: "navLegal", icon: ShieldCheck },
] as const;

const pill = "rounded-full px-3.5 py-1.5 text-[13px] font-medium transition";
const pillIdle = "text-slate-300 hover:bg-white/5 hover:text-white";
const pillActive = "bg-sky-400/10 text-sky-400";

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  // close panels on an outside pointer or Escape (same contract as the landing header)
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
  const toolsActive = NAV_TOOLS.some((i) => isActive(i.href));

  return (
    <header ref={headerRef} className="sticky top-0 z-40 border-b border-slate-800/70 bg-[#090d16]/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="AppSeal home">
          <img
            src="/ico.png"
            alt="AppSeal"
            width={28}
            height={28}
            className="h-7 w-7 object-contain drop-shadow-[0_2px_8px_rgba(56,189,248,0.4)] transition-transform hover:scale-105"
          />
          <span className="font-display text-lg font-extrabold tracking-tight">AppSeal</span>
        </Link>

        {/* desktop row: mirrors the landing rest state */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Site">
          {NAV_SECTIONS.slice(1).map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={`${pill} ${isActive(item.href) ? pillActive : pillIdle}`}
            >
              {t("ru", item.key)}
            </Link>
          ))}
          <div className="relative">
            <button
              onClick={() => setToolsOpen((v) => !v)}
              aria-expanded={toolsOpen}
              className={`flex items-center gap-1.5 ${pill} ${toolsActive ? pillActive : pillIdle}`}
            >
              {t("ru", "navTools")}
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
                  aria-label={t("ru", "navTools")}
                >
                  {NAV_TOOLS.map((item) => (
                    <Link
                      key={item.key}
                      href={item.href}
                      onClick={() => setToolsOpen(false)}
                      className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition hover:bg-white/5 hover:text-white ${
                        isActive(item.href) ? "text-sky-400" : "text-slate-300"
                      }`}
                    >
                      <item.icon
                        className={`h-4 w-4 shrink-0 transition ${isActive(item.href) ? "text-sky-400" : "text-slate-500 group-hover:text-sky-400"}`}
                      />
                      {t("ru", item.key)}
                    </Link>
                  ))}
                </motion.nav>
              )}
            </AnimatePresence>
          </div>
          {/* cross-page anchor: full navigation keeps the browser hash scroll honest */}
          <a href="/#pricing" className={`${pill} ${pillIdle}`}>
            {t("ru", "navPricing")}
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="hidden rounded-full bg-sky-400 px-4 py-1.5 text-[13px] font-bold text-[#090d16] transition hover:bg-sky-300 sm:inline-block"
          >
            Проверить свой
          </Link>
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

      {/* mobile panel: grouped exactly like the landing mini-panel */}
      <AnimatePresence>
        {menuOpen && (
          <motion.nav
            key="site-menu-panel"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: "top left" }}
            className="absolute left-4 top-[60px] z-50 w-64 rounded-2xl border border-white/10 bg-black/85 p-2 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.7)] backdrop-blur-2xl"
            aria-label="Menu"
          >
            {(
              [
                ["navGroupMain", NAV_SECTIONS],
                ["navGroupTools", NAV_TOOLS],
              ] as const
            ).map(([groupKey, items]) => (
              <div key={groupKey}>
                <p className="px-3 pb-1 pt-2 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-slate-600">
                  {t("ru", groupKey)}
                </p>
                {items.map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition hover:bg-white/5 hover:text-white ${
                      isActive(item.href) ? "text-sky-400" : "text-slate-300"
                    }`}
                  >
                    <item.icon
                      className={`h-4 w-4 shrink-0 transition ${isActive(item.href) ? "text-sky-400" : "text-slate-500 group-hover:text-sky-400"}`}
                    />
                    {t("ru", item.key)}
                  </Link>
                ))}
              </div>
            ))}
            <div className="mt-1 border-t border-white/5 pt-1">
              {NAV_TAIL.map((item) => (
                <a
                  key={item.key}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-slate-400 transition hover:bg-white/5 hover:text-white"
                >
                  <item.icon className="h-4 w-4 shrink-0 text-slate-600 transition group-hover:text-sky-400" />
                  {t("ru", item.key)}
                </a>
              ))}
            </div>
            <Link
              href="/"
              onClick={() => setMenuOpen(false)}
              className="mt-2 block rounded-xl bg-sky-400 px-3 py-2.5 text-center text-[13px] font-bold text-[#090d16] transition hover:bg-sky-300"
            >
              Проверить свой
            </Link>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
