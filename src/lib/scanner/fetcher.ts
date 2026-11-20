/**
 * Safe HTTP fetcher for the scanner engine.
 * - hard timeouts per request
 * - body size limit
 * - never throws (returns error object instead)
 * - SSRF: every hop (entry URL + each redirect target) is resolved,
 *   range-checked and PINNED: the connection is made to the exact IP the
 *   guard validated (node:http/https transport, SNI + Host carry the real
 *   hostname). A second, independent DNS resolution inside the HTTP client -
 *   the DNS-rebinding window of native fetch - no longer exists.
 */
import { assertPublicFetchTarget, resolvePublicTarget, type ResolvedRecord } from "./guard.ts";
import { DEMO_HOST } from "./url.ts";
import { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

const MAX_BODY = 600 * 1024; // 600 KB per response
const DEFAULT_TIMEOUT = 7000;
const MAX_REDIRECTS = 5;

/* ------------------------------------------------------------------ */
/* IP-pinned transport (anti DNS-rebinding)                            */
/* ------------------------------------------------------------------ */

/** Minimal Response-like shape readResponse and the redirect loop need -
 *  native Response and the pinned transport both satisfy it. */
interface FetchLike {
  ok: boolean;
  status: number;
  statusText: string;
  headers: { get(k: string): string | null; forEach(cb: (value: string, key: string) => void): void };
  url: string;
  body: ReadableStream<Uint8Array> | null;
}

/** Case-insensitive header view over node raw headers; repeated set-cookie
 *  lines are joined with \n exactly like the old undici handling in
 *  readResponse expected. */
class HeaderView {
  private map = new Map<string, string>();
  add(k: string, v: string): void {
    const key = k.toLowerCase();
    if (key === "set-cookie") {
      const prev = this.map.get(key);
      this.map.set(key, prev ? prev + "\n" + v : v);
    } else {
      this.map.set(key, v);
    }
  }
  get(k: string): string | null {
    return this.map.get(k.toLowerCase()) ?? null;
  }
  forEach(cb: (value: string, key: string) => void): void {
    for (const [k, v] of this.map) cb(v, k);
  }
}

/** The demo fixture is first-party; comparing origins (never string prefixes)
 *  keeps userinfo tricks like http://127.0.0.1:3210@evil/ from matching. */
function isDemoTarget(url: string): boolean {
  try {
    return new URL(url).origin === DEMO_HOST;
  } catch {
    return false;
  }
}

/** Prefer IPv4 (Vercel/worker egress always has it); fall back to the first
 *  record for IPv6-only targets. */
function pickAddress(records: ResolvedRecord[]): ResolvedRecord {
  return records.find((r) => r.family === 4) ?? records[0];
}

interface PinnedInit {
  method: string;
  body?: string;
  headers: Record<string, string>;
  signal: AbortSignal;
  /** remaining whole-chain budget for the socket timeout */
  budgetMs: number;
}

interface PinnedResponse extends FetchLike {
  statusText: string;
}

/** Native fetch decoded content-encoding transparently; node:http does not.
 *  The body readers get plaintext like before, while the content-encoding
 *  header stays intact in the view (the compression probe judges by it). */
function decodedBody(
  res: import("node:http").IncomingMessage,
  view: HeaderView,
): ReadableStream<Uint8Array> {
  const enc = (view.get("content-encoding") ?? "").toLowerCase().trim();
  let target: import("node:stream").Readable = res;
  try {
    if (enc === "gzip" || enc === "x-gzip") target = res.pipe(createGunzip());
    else if (enc === "deflate") target = res.pipe(createInflate());
    else if (enc === "br") target = res.pipe(createBrotliDecompress());
  } catch {
    target = res; // decompressor setup failed - fall back to raw bytes
  }
  return Readable.toWeb(target) as unknown as ReadableStream<Uint8Array>;
}

/**
 * One HTTP request over node:http/https, connected to a guard-validated IP.
 * - resolvePublicTarget does the ONLY DNS lookup: the address the guard
 *   checked is the address the socket opens (no re-resolution anywhere).
 * - servername keeps TLS SNI and certificate identity on the real hostname
 *   while the TCP/TLS connection itself goes to the pinned IP.
 * - agent:false disables socket pooling: a pooled socket is bound to the
 *   SNI of its first request and shared-hosting/CDN IPs would mismatch.
 * - userinfo is stripped; Host is rewritten to the original authority so
 *   name-based virtual hosting keeps working.
 */
async function pinnedRequest(target: URL, init: PinnedInit): Promise<PinnedResponse> {
  const records = await resolvePublicTarget(target.hostname);
  const addr = pickAddress(records);
  const isHttps = target.protocol === "https:";
  const mod = (isHttps ? await import("node:https") : await import("node:http")) as typeof import("node:http");

  const headers: Record<string, string> = { ...init.headers };
  headers.host = target.host; // original authority (hostname[:port])
  const payload = init.method === "POST" && init.body !== undefined ? Buffer.from(init.body, "utf-8") : undefined;
  if (payload) headers["content-length"] = String(payload.byteLength);

  const options = {
    host: addr.address,
    family: addr.family,
    port: target.port ? Number(target.port) : isHttps ? 443 : 80,
    path: `${target.pathname}${target.search}`,
    method: init.method,
    headers,
    agent: false,
    servername: isHttps ? target.hostname : undefined,
  } as import("node:http").RequestOptions;

  return await new Promise<PinnedResponse>((resolve, reject) => {
    const req = mod.request(options, (res) => {
      const view = new HeaderView();
      const rh = res.rawHeaders;
      for (let i = 0; i + 1 < rh.length; i += 2) view.add(rh[i], rh[i + 1]);
      resolve({
        ok: (res.statusCode ?? 500) >= 200 && (res.statusCode ?? 500) < 300,
        status: res.statusCode ?? 0,
        statusText: res.statusMessage ?? "",
        headers: view,
        url: target.toString(),
        body: decodedBody(res, view),
      });
    });
    const abort = () => {
      const err = new Error("This operation was aborted");
      err.name = "AbortError";
      req.destroy(err);
    };
    const onAbort = () => abort();
    if (init.signal.aborted) {
      onAbort();
    } else {
      init.signal.addEventListener("abort", onAbort, { once: true });
      req.on("close", () => init.signal.removeEventListener("abort", onAbort));
    }
    req.setTimeout(Math.max(1000, init.budgetMs), onAbort);
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Read at most maxBytes from the response, aborting the stream afterwards */
async function readCapped(
  res: { body: ReadableStream<Uint8Array> | null },
  maxBytes: number,
): Promise<{ chunks: Uint8Array; total: number }> {
  const reader = res.body?.getReader();
  if (!reader) return { chunks: new Uint8Array(0), total: 0 };
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        parts.push(value);
        total += value.byteLength;
      }
    }
  } catch {
    /* stream error - keep what we have */
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
  }
  const chunks = new Uint8Array(Math.min(total, maxBytes));
  let off = 0;
  for (const p of parts) {
    if (off >= chunks.length) break;
    chunks.set(p.subarray(0, chunks.length - off), off);
    off += p.byteLength;
  }
  return { chunks, total };
}

export interface FetchOutcome {
  ok: boolean;
  error?: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  bodyBytes: number;
  url: string; // final URL after redirects
  contentType: string;
  durationMs: number;
}

/** Read the final response of a safeFetch chain into the outcome object */
async function readResponse(
  res: FetchLike,
  finalUrl: string,
  startedAt: number,
  skipBody: boolean,
  maxBody: number,
): Promise<FetchOutcome> {
  let body = "";
  let bodyBytes = 0;
  if (!skipBody) {
    const clen = parseInt(res.headers.get("content-length") ?? "0", 10);
    const isTextual = /^(text\/|application\/(json|javascript|xhtml|xml))/.test(
      res.headers.get("content-type") ?? "",
    );
    // never download more than maxBody bytes
    const capped = await readCapped(res, maxBody);
    bodyBytes = capped.total; // actual bytes seen (or content-length if larger known)
    if (clen > bodyBytes) bodyBytes = clen;
    if (isTextual) {
      body = new TextDecoder("utf-8", { fatal: false }).decode(capped.chunks.subarray(0, maxBody));
    } else if (bodyBytes > 0) {
      body = "BIN:" + bodyBytes;
    }
  }
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    const key = k.toLowerCase();
    // undici yields every Set-Cookie separately; join so none are lost
    if (key === "set-cookie") {
      headers[key] = headers[key] ? headers[key] + "\n" + v : v;
    } else {
      headers[key] = v;
    }
  });
  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    headers,
    body,
    bodyBytes,
    url: res.url || finalUrl,
    contentType: res.headers.get("content-type") ?? "",
    durationMs: Date.now() - startedAt,
  };
}

export async function safeFetch(
  url: string,
  opts: {
    method?: "GET" | "HEAD" | "OPTIONS" | "POST";
    body?: string;
    timeoutMs?: number;
    headers?: Record<string, string>;
    maxBody?: number;
  } = {},
): Promise<FetchOutcome> {
  const t0 = Date.now();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const maxBody = opts.maxBody ?? MAX_BODY;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const baseHeaders = {
    "user-agent": "Mozilla/5.0 (compatible; AppSeal-Scanner/0.3; +https://appseal.online/bot)",
    accept: "*/*",
    ...(opts.headers ?? {}),
  };
  try {
    // redirects are followed manually so every hop passes the fetch-level
    // guard; a public site must not bounce probes to private addresses
    let current = url;
    let method = opts.method ?? "GET";
    let res: FetchLike;
    for (let hop = 0; ; hop += 1) {
      if (isDemoTarget(current)) {
        // the demo fixture is first-party: native fetch, no guard
        res = await fetch(current, {
          method,
          body: method === "POST" ? opts.body : undefined,
          redirect: "manual",
          signal: ctrl.signal,
          headers: baseHeaders,
        });
      } else {
        // public targets: guard + connect share ONE DNS resolution (the
        // records validatePublicTarget returns feed the socket), so the
        // rebinding window between "check" and "fetch" is gone; the target
        // URL never carries userinfo (assertPublicFetchTarget rejects it)
        await assertPublicFetchTarget(current);
        res = await pinnedRequest(new URL(current), {
          method,
          body: opts.body,
          headers: baseHeaders,
          signal: ctrl.signal,
          budgetMs: timeoutMs - (Date.now() - t0),
        });
      }
      if (res.status < 300 || res.status >= 400) break;
      const loc = res.headers.get("location");
      try {
        await res.body?.cancel();
      } catch {
        /* ignore */
      }
      if (!loc || hop >= MAX_REDIRECTS) break;
      let next: URL;
      try {
        next = new URL(loc, current);
      } catch {
        break;
      }
      if (next.protocol !== "http:" && next.protocol !== "https:") break;
      // 301/302/303 switch the re-request to GET; 307/308 keep the method
      method = res.status === 307 || res.status === 308 ? method : "GET";
      current = next.toString();
    }
    return await readResponse(res, current, t0, method === "HEAD", maxBody);
  } catch (e) {
    const msg = e instanceof Error ? (e.name === "AbortError" ? "timeout" : e.message) : String(e);
    return {
      ok: false,
      error: msg,
      status: 0,
      statusText: "",
      headers: {},
      body: "",
      bodyBytes: 0,
      url,
      contentType: "",
      durationMs: Date.now() - t0,
    };
  } finally {
    clearTimeout(t);
  }
}

export interface TlsInfo {
  available: boolean;
  protocol?: string;
  validTo?: string;
  daysLeft?: number;
  issuer?: string;
  error?: string;
}

export async function tlsInfo(host: string, port = 443): Promise<TlsInfo> {
  const tls = await import("node:tls");
  return new Promise<TlsInfo>((resolve) => {
    try {
      const socket = tls.connect(
        { host, port, servername: host, rejectUnauthorized: false, timeout: 6000 },
        () => {
          try {
            const cert = socket.getPeerCertificate();
            const validTo = cert?.valid_to;
            const daysLeft = validTo
              ? Math.round((new Date(validTo).getTime() - Date.now()) / 86400000)
              : undefined;
            resolve({
              available: true,
              protocol: socket.getProtocol() ?? undefined,
              validTo,
              daysLeft,
              issuer: (Array.isArray(cert?.issuer?.O) ? cert?.issuer?.O[0] : cert?.issuer?.O) ??
                (Array.isArray(cert?.issuer?.CN) ? cert?.issuer?.CN[0] : cert?.issuer?.CN) ??
                undefined,
            });
          } finally {
            socket.destroy();
          }
        },
      );
      socket.on("error", (e) => resolve({ available: false, error: e.message }));
      socket.on("timeout", () => {
        socket.destroy();
        resolve({ available: false, error: "timeout" });
      });
    } catch (e) {
      resolve({ available: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
}

/** Extract same-origin JS bundle URLs from an HTML document */
export function extractScripts(html: string, baseOrigin: string, limit = 8): string[] {
  const out: string[] = [];
  const re = /<script[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && out.length < limit) {
    try {
      const u = new URL(m[1], baseOrigin);
      if (u.origin === baseOrigin) out.push(u.toString());
    } catch {
      /* skip invalid */
    }
  }
  return out;
}

/** Extract same-origin page links from an HTML document */
export function extractLinks(html: string, baseOrigin: string, limit = 12): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /<a[^>]+href=["']([^"'#]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && out.length < limit) {
    try {
      const u = new URL(m[1], baseOrigin);
      if (u.origin !== baseOrigin) continue;
      u.hash = "";
      const s = u.toString();
      if (s === baseOrigin + "/" || seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    } catch {
      /* skip invalid */
    }
  }
  return out;
}

export function truncate(s: string, n = 160): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n) + "…" : one;
}

export function maskSecret(s: string, keep = 4): string {
  const t = s.trim();
  if (t.length <= keep * 2) return "*".repeat(t.length);
  return t.slice(0, keep) + "…" + "*".repeat(Math.min(12, t.length - keep * 2)) + t.slice(-keep);
}

/* ------------------------------------------------------------------ */
/* v0.2 heuristics                                                     */
/* ------------------------------------------------------------------ */

/** Shannon entropy in bits per character - a random key looks high, a
 *  marketing word or doc example looks low. */
export function shannonEntropy(s: string): number {
  if (!s.length) return 0;
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const count of freq.values()) {
    const p = count / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/** Collapse whitespace and take a bounded prefix for body-to-body compares. */
function normalizedBody(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 4000);
}

/** Two 200-bodies that are essentially the same page (soft-404 detection). */
export function bodiesEquivalent(a: string, b: string): boolean {
  const na = normalizedBody(a);
  const nb = normalizedBody(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // a real page behind the same template differs from the error page in the
  // middle - its normalized length diverges. If the bodies diverge in size
  // by more than 25% they are different pages even when header and footer
  // (the first/last 300 chars) match, e.g. an SPA shell vs a dashboard.
  const lenGap = Math.abs(na.length - nb.length) / Math.max(na.length, nb.length);
  if (lenGap > 0.25) return false;
  // allow minor template noise: compare the first 300 chars both ways
  return na.slice(0, 300) === nb.slice(0, 300) || na.slice(-300) === nb.slice(-300);
}

/** A value that reads like a documentation example rather than a real key. */
export function looksLikeDocExample(s: string, context: string): boolean {
  if (/(?:your|example|sample|dummy|fake|test|demo|placeholder|xxx|abcd|123456|000000)/i.test(s)) {
    return true;
  }
  // context smells like docs, code samples, or the scanner's own copy
  if (
    /(?:your[_-]?(?:api[_-]?)?key|doc(?:umentation|s)?|example|sample code|<code|<pre|readme|getting started|документ|пример|докум)/i.test(
      context,
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Detects a client-side render shell: a known SPA mount node with almost no
 * static content - the DOM the user sees is built by JS, which plain fetch
 * cannot execute (v0.3: JS-rendering engine).
 */
export function isClientRenderShell(html: string): boolean {
  const hasMount = /<div[^>]+id=["'](?:root|app|__next|__nuxt|q-app|__astro-root)["'][^>]*>/i.test(html);
  const visible = html
    .replace(/<(?:script|style|noscript|template)[\s\S]*?<\/(?:script|style|noscript|template)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;?/g, " ")
    .trim();
  return hasMount && visible.length < 200;
}

/* ------------------------------------------------------------------ */
/* Site description for the public registry                            */
/* ------------------------------------------------------------------ */

/** multi-part public suffixes where DMARC lives on three labels */
const MULTIPART_TLDS = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "co.jp", "co.in", "co.nz", "co.za",
  "com.au", "net.au", "org.au", "com.br", "com.mx", "com.ar", "com.tr",
  "com.cn", "com.tw", "com.hk", "com.sg", "com.my", "co.th", "com.ph",
  "co.id", "co.kr", "com.pl", "co.il", "com.ua",
]);

/** Last two (or three for co.uk-style) labels: where DMARC actually lives. */
export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const last2 = parts.slice(-2).join(".");
  if (MULTIPART_TLDS.has(last2) && parts.length >= 3) return parts.slice(-3).join(".");
  return last2;
}

/** Unescape the handful of entities meta/og attributes actually contain. */
function unescapeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Best public description of the site, in falling priority: meta description,
 * og:description, twitter:description, then <title>. Powers the one-line
 * description shown under a registry entry (plain text, max 160 chars).
 */
export function extractSiteDesc(html: string): string {
  const metaContent = (nameRe: RegExp): string => {
    const m =
      html.match(new RegExp(`<meta\\b[^>]+(?:${nameRe.source})[^>]*content=["']([^"']*)["']`, "i")) ??
      html.match(new RegExp(`<meta\\b[^>]+content=["']([^"']*)["'][^>]*${nameRe.source}`, "i"));
    return m ? unescapeHtmlEntities(m[1]) : "";
  };
  const desc = metaContent(/name=["']description["']/);
  if (desc) return desc.slice(0, 160);
  const og = metaContent(/property=["']og:description["']/);
  if (og) return og.slice(0, 160);
  const tw = metaContent(/name=["']twitter:description["']/);
  if (tw) return tw.slice(0, 160);
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const t = title ? unescapeHtmlEntities(title[1].replace(/<[^>]+>/g, " ")) : "";
  return t.slice(0, 160);
}
