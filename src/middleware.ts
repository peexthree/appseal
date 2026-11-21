import { NextRequest, NextResponse } from "next/server";
import cspStyleHashes from "./generated/csp-style-hashes.json";

/**
 * Path-based language variants: /en/... and /ru/... serve the same page with
 * the language pinned - no redirects, so hreflang pairs point at real,
 * crawlable URLs. The server pages read the request cookie (pageLang), the
 * client views read document.cookie (useLang), so both get it. ?lang=ru|en
 * stays as a convenience entry: sets the cookie and strips the param.
 */

/**
 * Strict script CSP: on dynamically rendered routes script-src drops
 * 'unsafe-inline' and becomes 'nonce-<random>' 'strict-dynamic'. The nonce is
 * forwarded to the server render via the request CSP header - Next.js reads it
 * back (getScriptNonceFromHeader) and stamps its own SSR bootstrap/flight
 * scripts, so hydration works without 'unsafe-inline'. 'strict-dynamic' also
 * lets client-injected scripts through (Vercel Analytics, the Metrica snippet
 * inserted by next/script); the host allowlist stays for CSP2-only browsers,
 * which ignore 'strict-dynamic'.
 *
 * Statically cached routes keep the legacy script-src: their prerendered HTML
 * has no per-request nonce baked in, so a nonce-only CSP would block every
 * inline bootstrap script there (documented Next.js limitation - a middleware
 * nonce only applies to dynamically rendered routes). That list is the ISR/SSG
 * pages below; everything else - including future pages - gets the strict CSP,
 * which is safe as long as the route renders per request.
 *
 * style-src has two tiers:
 *  - the landing (the page our own scanner grades) is fully strict: its
 *    inline styles are deterministic per build (next/font fallback blocks and
 *    framer-motion initial attribute strings), so 'unsafe-hashes' + sha256
 *    hashes of every value replace 'unsafe-inline' completely. The hash list
 *    lives in src/generated/csp-style-hashes.json - regenerate with
 *    scripts/csp-style-sync.mjs after landing style changes and verify with
 *    its --check mode (a drifted list silently blocks the landing styles).
 *  - every other page keeps 'unsafe-inline': their styles carry per-request
 *    data (the /stats bars render scan counts into style attributes), which
 *    cannot be enumerated into a hash list.
 */

const SCRIPT_SRC_LEGACY = `'self' 'unsafe-inline' https://mc.yandex.ru https://va.vercel-scripts.com`;
const scriptSrcStrict = (nonce: string) =>
  `'self' 'nonce-${nonce}' 'strict-dynamic' https://mc.yandex.ru https://va.vercel-scripts.com`;

// landing style-src: 'unsafe-hashes' unlocks hashed style ATTRIBUTES (the
// framer-motion initial strings), plain hashes cover the <style> elements
// (next/font fallback blocks). No 'unsafe-inline' left anywhere on this page.
const STYLE_SRC_LANDING = `'self' 'unsafe-hashes' ${[
  ...cspStyleHashes.styleHashes,
  ...cspStyleHashes.attrHashes,
].join(" ")} https://mc.yandex.ru`;
const STYLE_SRC_DEFAULT = `'self' 'unsafe-inline' https://mc.yandex.ru`;

// prerendered (ISR/SSG) routes - served from cache, no nonce in their HTML.
// /registry used to be ISR but is dynamic now (URL-driven facets over the
// 16k+-host catalog), so it moved to the strict nonce policy
const PRERENDERED_ROUTES = /^\/(ci|digest|fixes|report|verified)(?:\/|$)/i;

// routes that render per request and therefore can consume the middleware
// nonce. Everything OUTSIDE this list - including every unmatched path,
// which serves the cached static not-found page - must get the legacy
// policy: the cached 404 HTML has no per-request nonce baked in, so a
// nonce-only script-src would block its inline bootstrap scripts and kill
// hydration there (the interactive 404 easter egg lives on that page).
// Inverting the default is safe: over-assigning legacy only weakens CSP on
// a forgotten future route, over-assigning strict hard-breaks its render.
const DYNAMIC_ROUTES = /^\/($|stats|registry|legal|bot|versus|reviews|myscans)(?:\/|$)/i;

function contentSecurityPolicy(scriptSrc: string, styleSrc: string): string {
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    "img-src 'self' data: blob: https://mc.yandex.ru",
    "font-src 'self' data:",
    "connect-src 'self' https://mc.yandex.ru",
    "frame-src https://mc.yandex.ru",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/** 128-bit random nonce as base64 - the charset Next's nonce extraction regex
 *  ([A-Za-z0-9+/_-]+=) accepts, generated per request in the edge runtime. */
function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // convenience: /?lang=en pins the cookie and lands on the clean URL
  const langParam = searchParams.get("lang")?.toLowerCase();
  if (langParam === "ru" || langParam === "en") {
    const url = req.nextUrl.clone();
    url.searchParams.delete("lang");
    const res = NextResponse.redirect(url, 308);
    res.cookies.set("appseal-lang", langParam, { path: "/", maxAge: 31536000, sameSite: "lax" });
    return res;
  }

  // /en/... /ru/...: rewrite to the clean path with the language pinned
  const prefix = pathname.match(/^\/(en|ru)(?=\/|$)/i);
  let lang: string | null = null;
  let effectivePath = pathname;
  if (prefix) {
    lang = prefix[1].toLowerCase();
    effectivePath = pathname.slice(prefix[1].length + 1) || "/";
  }

  // first visit without a cookie: seed the language from Accept-Language so
  // the landing's country/language detection does not fork from everything
  // else - inner pages (pageLang), the client views (useLang) and the cookie
  // banner all read the same appseal-lang cookie, and without a seed they
  // defaulted to RU while the landing rendered EN. The request-level seed is
  // applied further down ONLY for strict (per-request) routes - forwarding a
  // modified request to a prerendered route de-opts its ISR regeneration.
  const seededLang = !prefix && !req.cookies.has("appseal-lang")
    ? (req.headers.get("accept-language") ?? "").toLowerCase().split(",")[0]?.trim().startsWith("en")
      ? "en"
      : "ru"
    : null;

  const nonce = randomNonce();
  const strict = !PRERENDERED_ROUTES.test(effectivePath) && DYNAMIC_ROUTES.test(effectivePath);
  // the landing is the page our own scanner grades - its CSP must be free of
  // 'unsafe-inline' in EVERY directive, style-src included (hash-based, see
  // STYLE_SRC_LANDING)
  const isLanding = effectivePath === "/";
  if (lang && strict) {
    // pinned language for the dynamic render; prerendered routes render
    // statically (their SSR language stays RU, the client view re-reads the
    // cookie) and must not see a modified request at all - see below
    req.cookies.set("appseal-lang", lang);
  } else if (seededLang && strict) {
    // same rule for the Accept-Language seed: only dynamic renders see it
    // in-request, the response cookie below persists it for everything else
    req.cookies.set("appseal-lang", seededLang);
  }
  const policy = contentSecurityPolicy(
    strict ? scriptSrcStrict(nonce) : SCRIPT_SRC_LEGACY,
    isLanding ? STYLE_SRC_LANDING : STYLE_SRC_DEFAULT,
  );

  // Request headers are forwarded to the render ONLY for dynamically rendered
  // routes. Forwarding modified request headers to an ISR/prerendered route
  // de-opts its runtime (re)generation into dynamic rendering, which Next 16
  // hard-fails with "Page changed from static to dynamic, reason: headers" -
  // that was the /verified/[host] 500 (the only route with no cached copy, so
  // the only one erroring out loud; every other ISR page just silently kept
  // serving stale cache). Prerendered routes get the unmodified request: their
  // CSP is the legacy policy set on the response below.
  const requestHeaders = new Headers(req.headers);
  if (strict) {
    // the server render nonces its own scripts from the request CSP header and
    // server components read the plain nonce for inline JSON-LD blocks
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", policy);
  }

  let res: NextResponse;
  if (lang) {
    const url = req.nextUrl.clone();
    url.pathname = effectivePath;
    res = strict
      ? NextResponse.rewrite(url, { request: { headers: requestHeaders } })
      : NextResponse.rewrite(url);
    res.cookies.set("appseal-lang", lang, { path: "/", maxAge: 31536000, sameSite: "lax" });
  } else {
    res = strict ? NextResponse.next({ request: { headers: requestHeaders } }) : NextResponse.next();
  }
  if (seededLang && !lang) {
    // persist the Accept-Language seed: inner pages, the client views and the
    // cookie banner all read this cookie on the next navigation
    res.cookies.set("appseal-lang", seededLang, { path: "/", maxAge: 31536000, sameSite: "lax" });
  }
  res.headers.set("Content-Security-Policy", policy);
  return res;
}

export const config = {
  // everything except the API, Next internals and the static asset files -
  // mp4/webp/png/svg/mp3/txt used to run through the nonce-CSP middleware on
  // every request (edge invocations + CSP headers no document ever reads).
  // Dotted dynamic paths stay inside: /verified/myapp.com, /report/<rkey>.
  matcher: [
    "/((?!api|_next|video/|img/|sound/|favicon\\.ico|robots\\.txt|sitemap\\.xml|site\\.webmanifest|llms\\.txt|indexnow-key\\.txt|yandex_[0-9a-f]+\\.html|OG1\\.(?:png|jpg)|ico\\.(?:svg|png)|apple(?:-touch-)?\\.png|logo\\.svg|[A-E](?:plus)?\\.(?:png|webp)).*)",
  ],
};
