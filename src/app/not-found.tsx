import { CyberBugLazy } from "@/components/not-found/game-lazy";

/**
 * Custom 404 - a full-screen game board. No navbar, no scroll: the central
 * card IS the HUD. The big 404 doubles as the lives meter (every bite dims
 * one digit), the stats grid below is painted live by the engine through
 * data-nf-* slots (SSR text stays intact for crawlers). Kept fully static:
 * no headers(), no dynamic APIs (see the /verified 500 incident) - the
 * middleware serves this cached page with the legacy CSP, so hydration works
 * without a per-request nonce.
 *
 * Language is the dual-line pattern (static RU + EN line); the interactive
 * layer (toasts, clouds, HUD) reads the appseal-lang cookie client-side.
 */
export default function NotFound() {
  return (
    <>
      {/* React 19 hoists these into <head> even from a body component */}
      <title>404 - страница не найдена | AppSeal</title>
      <meta name="robots" content="noindex, follow" />

      {/* fixed fullscreen board: nothing scrolls, nothing distracts */}
      <div className="fixed inset-0 z-10 select-none overflow-hidden overscroll-none">
        <CyberBugLazy />

        <main className="pointer-events-none relative z-10 flex h-full w-full flex-col items-center justify-center px-4 text-center">
          <div
            data-nf-card
            data-nf-shake
            data-nf-damage
            className="appseal-glass-card pointer-events-auto relative w-full max-w-2xl rounded-3xl px-6 py-7 sm:px-10 sm:py-8"
          >
            {/* SFX toggle is injected here by the game engine */}
            <div data-nf-sfx-slot className="absolute right-4 top-4" />

            {/* status badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 font-mono text-[11px] font-bold tracking-[0.18em] text-slate-300">
              <span className="appseal-pulse h-2 w-2 rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.9)]" />
              DIAGNOSTIC_ERR&nbsp;//&nbsp;ROUTE_NOT_FOUND
            </div>

            {/* the 404 doubles as the lives meter: every bite dims one digit */}
            <p
              aria-hidden="true"
              data-nf-lives
              className="nf-lives font-display mt-3 flex items-baseline justify-center gap-1 text-[72px] font-extrabold leading-none tracking-tight sm:text-[108px]"
            >
              <span data-nf-life="0">4</span>
              <span data-nf-life="1">0</span>
              <span data-nf-life="2">4</span>
            </p>

            <h1 className="font-display mt-2 text-lg font-semibold text-white/90 sm:text-xl">
              Страница не найдена
            </h1>
            <p className="mt-0.5 text-xs text-white/45">Page not found</p>

            {/* live game stats - the engine paints these through data slots */}
            <div className="mx-auto mt-4 grid w-full max-w-md grid-cols-4 gap-2 font-mono">
              <div className="rounded-xl border border-white/5 bg-white/[0.03] px-1 py-2">
                <div className="text-[9px] tracking-widest text-slate-500">БАГОВ</div>
                <div className="mt-0.5 text-[15px] font-bold text-emerald-400" data-nf-stat="kills">
                  0
                </div>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.03] px-1 py-2">
                <div className="text-[9px] tracking-widest text-slate-500">РЕКОРД</div>
                <div className="mt-0.5 text-[15px] font-bold text-sky-400" data-nf-stat="best">
                  0
                </div>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.03] px-1 py-2">
                <div className="text-[9px] tracking-widest text-slate-500">ВСЕГО</div>
                <div className="mt-0.5 text-[15px] font-bold text-violet-400" data-nf-stat="total">
                  0
                </div>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.03] px-1 py-2">
                <div className="text-[9px] tracking-widest text-slate-500">ВОЛНА</div>
                <div className="mt-0.5 text-[15px] font-bold text-amber-300" data-nf-stat="wave">
                  1
                </div>
              </div>
            </div>

            {/* shield power-up indicator, revealed by the engine */}
            <div className="mt-2.5 flex justify-center">
              <span
                data-nf-shield
                style={{ display: "none" }}
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 font-mono text-[10px] font-bold tracking-widest text-emerald-300"
              >
                🛡️ ЩИТ АКТИВЕН
              </span>
            </div>

            {/* de-personalized all-time record - the competition between players */}
            <p className="mt-1.5 font-mono text-[10px] tracking-widest text-slate-500">
              РЕКОРД ВСЕХ ИГРОКОВ:{" "}
              <span data-nf-world className="font-bold text-slate-300">
                —
              </span>
            </p>

            <p className="mx-auto mt-3.5 max-w-md text-[13px] leading-relaxed text-white/55">
              Такой страницы нет - но сканер работает в штатном режиме. Лови
              багов, пока они не съели страницу.
            </p>
            <p className="mx-auto mt-0.5 max-w-md text-[11px] leading-relaxed text-white/35">
              This page doesn&apos;t exist - but the scanner is up and running.
              Squash the bugs before they eat the page.
            </p>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <a
                href="/"
                data-cta-home
                className="inline-flex h-11 items-center justify-center rounded-xl bg-sky-400 px-6 text-sm font-bold text-[#090d16] shadow-[0_0_30px_-5px_rgba(56,189,248,0.5)] transition hover:bg-sky-300"
              >
                На главную
              </a>
              <a
                href="/#scan"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-6 text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
              >
                Проверить сайт
              </a>
            </div>
          </div>
        </main>
      </div>

      {/* data-only script: browsers never execute application/ld+json */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: "Page not found - AppSeal",
          }),
        }}
      />
    </>
  );
}
