import type { Metadata } from "next";
import { headers } from "next/headers";
import { ScannerPage } from "@/components/scanner-page";
import { JsonLd } from "@/components/json-ld";
import { DICT } from "@/lib/i18n";
import { getLiveTotals, getLatestHostEntry } from "@/lib/scanner/store";
import { canonicalHost } from "@/lib/registry";
import type { Grade, Lang } from "@/lib/scanner/types";

/**
 * Language is resolved on the server, not after hydration: crawlers (Google,
 * X, Product Hunt) hit appseal.online without localStorage, and until now the
 * SSR HTML was always Russian with ₽ prices. Country and Accept-Language
 * decide the seed: RU audience gets ru, everyone else gets en + USD.
 */
function detectInitialLang(h: Headers): Lang {
  // explicit choice wins: the appseal-lang cookie is set by the switcher and
  // by the /en|/ru middleware rewrite - SSR must match what the client store
  // resolves to, or hydration flips the language visibly
  const cookie = h.get("cookie") ?? "";
  const m = cookie.match(/(?:^|;\s*)appseal-lang=(ru|en)/);
  if (m) return m[1] as Lang;
  const country = (h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry") ?? "").toUpperCase();
  if (country === "RU") return "ru";
  const al = (h.get("accept-language") ?? "").toLowerCase();
  if (country && country !== "RU") return al.startsWith("ru") ? "ru" : "en";
  // no country header (local dev, bots): fall back to language preference
  return al.startsWith("ru") || al.startsWith("*") || !al ? "ru" : "en";
}

// per-request language detection reads request headers, which opts the page
// out of ISR entirely - dynamic rendering also removes the old static-seed
// problem that revalidate=120 worked around (stale CORS-allow-origin header
// from the prerendered file kept our own CORS check failing)
export const dynamic = "force-dynamic";

const META = {
  ru: {
    title: "AppSeal - техосмотр для приложений, собранных с ИИ",
    description:
      "AppSeal сканирует живое приложение на утечки секретов, открытые базы, дырявые админки и признаки заброшенности. Оценка A+-E и бейдж доверия за минуту.",
  },
  en: {
    title: "AppSeal - the trust seal for AI-built apps",
    description:
      "Scan your AI-built app for leaked secrets, open databases, exposed admin panels and abandonment. A+-E grade in a minute.",
  },
} as const;

// report links moved to /report/<id> with ISR - see next.config redirects
export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const lang = detectInitialLang(h);
  return {
    title: META[lang].title,
    description: META[lang].description,
    openGraph: {
      title: META[lang].title,
      description: META[lang].description,
      type: "website",
      images: ["/OG1.jpg"],
    },
    twitter: {
      card: "summary_large_image",
      title: META[lang].title,
      description: META[lang].description,
      images: ["/OG1.jpg"],
    },
    alternates: {
      canonical: "/",
      languages: {
        ru: "/",
        en: "/en",
        "x-default": "/",
      },
    },
  };
}

/**
 * Live grades for the hero demo chips, straight from the registry (the same
 * source /api/verify answers from). A stale chip claiming "A+ · 97" next to a
 * live profile showing "A · 88" reads as dishonesty - so chips follow the
 * registry, falling back to the static snapshot when Redis is unavailable.
 */
async function getLiveChips(): Promise<{ target: string; grade: Grade; score: number }[] | null> {
  const hosts = ["akulenok-tmz.ru", "appseal.online"];
  try {
    const chips = await Promise.all(
      hosts.map(async (host) => {
        const entry = await getLatestHostEntry(canonicalHost(host));
        return entry ? { target: host, grade: entry.grade as Grade, score: entry.score } : null;
      }),
    );
    // the vulnerable demo fixture is static - it never comes from the registry
    return chips.every((c) => c !== null) ? [...chips, { target: "demo://app", grade: "E" as Grade, score: 0 }] : null;
  } catch {
    return null;
  }
}

/**
 * JSON-LD Product with the paid offers: prices are parsed from the same i18n
 * strings the pricing section renders - a single source of truth, the markup
 * never drifts from the visible tariffs. Language-aware: an EN render with
 * $ prices must not ship RUB offers. Static dict data only, no user input
 * ever reaches this JSON (safe for dangerouslySetInnerHTML).
 */
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://appseal.online";

/** "1 490 ₽" -> "1490", "$6" -> "6": digits-only price extraction */
function priceValue(v: string): string {
  return v.replace(/\D+/g, "") || "0";
}

function productLd(lang: Lang) {
  const currency = lang === "en" ? "USD" : "RUB";
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "AppSeal Security Check",
    url: BASE_URL,
    description: DICT.tagline[lang],
    offers: [
      {
        "@type": "Offer",
        name: DICT.planLP[lang],
        price: priceValue(DICT.planLPPrice[lang]),
        priceCurrency: currency,
        availability: "https://schema.org/InStock",
        url: `${BASE_URL}/#pricing`,
      },
      {
        "@type": "Offer",
        name: DICT.planPro[lang],
        price: priceValue(DICT.planProPrice[lang]),
        priceCurrency: currency,
        availability: "https://schema.org/InStock",
        url: `${BASE_URL}/#pricing`,
      },
      {
        "@type": "Offer",
        name: DICT.planAgencyTitle[lang],
        price: priceValue(DICT.planAgencyPrice[lang]),
        priceCurrency: currency,
        availability: "https://schema.org/InStock",
        url: `${BASE_URL}/#pricing`,
      },
    ],
  };
}

export default async function Home() {
  const h = await headers();
  const lang = detectInitialLang(h);
  // strict-dynamic CSP (middleware): inline <script> needs the per-request
  // nonce even when it never executes - without it the browser strips the
  // JSON-LD block and crawlers miss the structured data
  const nonce = h.get("x-nonce") ?? undefined;
  // live monotonic counters from the same Redis source /stats renders from -
  // the landing stats card must never disagree with the stats page
  const [totals, chips] = await Promise.all([getLiveTotals(), getLiveChips()]);
  return (
    <>
      <JsonLd nonce={nonce} />
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(productLd(lang)) }} />
      <ScannerPage initialScan={null} initialLang={lang} initialTotals={totals} initialChips={chips} />
    </>
  );
}
