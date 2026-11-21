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

            {/* destruction sprites: one crack group per eaten life, revealed
                by the engine (data-nf-crack) */}
            <svg
              className="nf-crack pointer-events-none absolute right-0 top-0 z-[5]"
              width="240"
              height="150"
              viewBox="0 0 240 150"
              fill="none"
              data-nf-crack="1"
              aria-hidden="true"
              style={{ display: "none" }}
            >
              <path
                d="M 240 0 L 196 8 L 208 26 L 186 34 L 200 52 L 240 48 Z"
                fill="#0a0d16"
                stroke="rgba(239,68,68,0.5)"
                strokeWidth="1.5"
              />
              <path
                d="M 196 8 L 168 22 L 176 30 M 186 34 L 150 44 L 142 60 M 200 52 L 178 70 L 184 88"
                stroke="rgba(153,27,27,0.75)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path d="M 208 26 L 230 44" stroke="rgba(153,27,27,0.5)" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <svg
              className="nf-crack pointer-events-none absolute left-0 bottom-0 z-[5]"
              width="220"
              height="140"
              viewBox="0 0 220 140"
              fill="none"
              data-nf-crack="2"
              aria-hidden="true"
              style={{ display: "none" }}
            >
              <path
                d="M 0 140 L 40 128 L 30 112 L 52 106 L 42 88 L 0 92 Z"
                fill="#0a0d16"
                stroke="rgba(239,68,68,0.5)"
                strokeWidth="1.5"
              />
              <path
                d="M 40 128 L 70 116 L 62 106 M 52 106 L 86 96 L 94 80 M 42 88 L 66 72 L 60 56"
                stroke="rgba(153,27,27,0.75)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>

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
