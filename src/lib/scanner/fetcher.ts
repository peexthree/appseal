/**
 * Safe HTTP fetcher for the scanner engine.
 * - hard timeouts per request
 * - body size limit
 * - never throws (returns error object instead)
 */

const MAX_BODY = 600 * 1024; // 600 KB per response
const DEFAULT_TIMEOUT = 7000;

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
    /* stream error — keep what we have */
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
}

export async function safeFetch(
  url: string,
  opts: {
    method?: "GET" | "HEAD";
    timeoutMs?: number;
    headers?: Record<string, string>;
    maxBody?: number;
  } = {},
): Promise<FetchOutcome> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const maxBody = opts.maxBody ?? MAX_BODY;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; AppMOT-Scanner/0.1; +https://appmot.io/bot)",
        accept: "*/*",
        ...(opts.headers ?? {}),
      },
    });
    let body = "";
    let bodyBytes = 0;
    if (opts.method !== "HEAD") {
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
      url: res.url || url,
      contentType: res.headers.get("content-type") ?? "",
    };
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
