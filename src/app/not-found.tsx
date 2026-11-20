import Link from "next/link";

/**
 * Custom 404. Kept fully static: calling headers() here made Next 16 pull
 * the not-found boundary into every ISR runtime (re)generation - regenerating
 * any prerendered route then hard-failed with "Page changed from static to
 * dynamic, reason: headers". That was the /verified/[host] 500 (the only
 * route with no cached copy, so the only one erroring out loud; every other
 * ISR page just silently kept serving stale cache since 19.11). The ld+json
 * block below is data-only (never executed), so it stays valid without a
 * nonce even under the strict script-src CSP.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 text-center">
      <p className="text-6xl font-bold tracking-tight text-white/90">404</p>
      <h1 className="mt-4 text-xl font-semibold text-white/80">
        Страница не найдена
      </h1>
      <p className="mt-1 text-sm text-white/60">
        Page not found
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-xl bg-white/10 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/20"
        >
          К сканеру
        </Link>
        <a
          href="https://t.me/AppSeal_Monitor_Bot"
          className="rounded-xl bg-white/10 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/20"
        >
          Telegram-бот
        </a>
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
  );
}
