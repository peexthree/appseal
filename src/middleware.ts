import { NextRequest, NextResponse } from "next/server";

/**
 * Path-based language variants: /en/... and /ru/... serve the same page with
 * the language pinned - no redirects, so hreflang pairs point at real,
 * crawlable URLs. The server pages read the request cookie (pageLang), the
 * client views read document.cookie (useLang), so both get it. ?lang=ru|en
 * stays as a convenience entry: sets the cookie and strips the param.
 */
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
  if (prefix) {
    const lang = prefix[1].toLowerCase();
    const rest = pathname.slice(prefix[1].length + 1) || "/";
    const url = req.nextUrl.clone();
    url.pathname = rest;
    req.cookies.set("appseal-lang", lang);
    const res = NextResponse.rewrite(url, { request: { headers: req.headers } });
    res.cookies.set("appseal-lang", lang, { path: "/", maxAge: 31536000, sameSite: "lax" });
    return res;
  }

  return NextResponse.next();
}

export const config = {
  // everything except the API and Next internals; file requests (dots in the
  // last segment) pass through inside middleware
  matcher: ["/((?!api|_next).*)"],
};
