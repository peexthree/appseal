import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { CyberBugEasterEgg } from "@/components/not-found/CyberBugEasterEgg";

/**
 * Custom 404 with the cyber-disinsection easter egg. Kept fully static:
 * calling headers() here made Next 16 pull the not-found boundary into every
 * ISR runtime (re)generation - regenerating any prerendered route then
 * hard-failed with "Page changed from static to dynamic, reason: headers".
 * That was the /verified/[host] 500 (the only route with no cached copy, so
 * the only one erroring out loud; every other ISR page just silently kept
 * serving stale cache since 19.11). No dynamic APIs, no nonce needed: the
 * middleware serves this cached page with the legacy CSP, so hydration
 * works without a per-request nonce.
 *
 * Language is the dual-line pattern of the old page (static RU + EN line);
 * the interactive layer (toasts, HUD, reaction clouds) reads the same
 * appseal-lang cookie client-side and switches instantly.
 *
 * The ld+json block below is data-only (never executed), so it stays valid
 * under script-src. React 19 hoists the <title>/<meta> tags into <head>.
 */
export default function NotFound() {
  return (
    <>
      {/* React 19 hoists these into <head> even from a body component */}
      <title>404 - страница не найдена | AppSeal</title>
      <meta name="robots" content="noindex, follow" />

      <SiteHeader />

      <CyberBugEasterEgg />

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-4 py-20 text-center">
        <div
          data-nf-card
          data-nf-shake
          className="appseal-glass-card relative w-full rounded-3xl px-6 py-12 sm:px-10 sm:py-16"
        >
          {/* status badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 font-mono text-[11px] font-bold tracking-[0.18em] text-slate-300">
            <span className="appseal-pulse h-2 w-2 rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.9)]" />
            DIAGNOSTIC_ERR&nbsp;//&nbsp;ROUTE_NOT_FOUND
          </div>

          {/* big 404, site gradient + soft neon */}
          <p
            aria-hidden="true"
            className="appseal-gradient-text font-display mt-6 text-[96px] font-extrabold leading-none tracking-tight drop-shadow-[0_0_26px_rgba(56,189,248,0.35)] sm:text-[132px]"
          >
            404
          </p>

          <h1 className="font-display mt-4 text-xl font-semibold text-white/90 sm:text-2xl">
            Страница не найдена
          </h1>
          <p className="mt-1 text-sm text-white/50">Page not found</p>

          <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-white/70">
            Такой страницы нет - но сканер работает в штатном режиме. Запусти
            техосмотр своего приложения или вернись на главную.
          </p>
          <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-white/45">
            This page doesn&apos;t exist - but the scanner is up and running.
            Run a check on your app or head back home.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/"
              data-cta-home
              className="inline-flex h-12 items-center justify-center rounded-xl bg-sky-400 px-6 text-sm font-bold text-[#090d16] shadow-[0_0_30px_-5px_rgba(56,189,248,0.5)] transition hover:bg-sky-300"
            >
              На главную
            </Link>
            <Link
              href="/#scan"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-6 text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
            >
              Проверить сайт
            </Link>
          </div>
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
      </main>
    </>
  );
}
