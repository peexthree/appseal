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
      headers[k.toLowerCase()] = v;
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
              issuer: cert?.issuer?.O ?? cert?.issuer?.CN ?? undefined,
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
