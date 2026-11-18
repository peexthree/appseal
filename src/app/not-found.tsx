import { headers } from "next/headers";
import Link from "next/link";

/**
 * Custom 404: the default prerendered not-found page renders without a
 * per-request nonce, so the strict script-src CSP would block its hydration.
 * Calling headers() makes this page dynamic - it renders per request, picks
 * up the middleware nonce (x-nonce) and hydrates like every other strict-CSP
 * route. Kept deliberately small: no client components, no data fetching.
 */
export default async function NotFound() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
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
      {/* static, non-executing: nonce keeps it valid under strict CSP */}
      <script
        type="application/ld+json"
        nonce={nonce}
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
