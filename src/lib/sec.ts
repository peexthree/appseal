/**
 * Shared security primitives: constant-time secret compares, client IP
 * extraction with format validation, and CIDR allowlist matching (used by
 * the YooKassa webhook IP filter).
 */

import { createHash, timingSafeEqual } from "node:crypto";

/** Length-independent, timing-safe secret comparison: both sides are hashed
 *  first (fixed 32-byte size), then compared with timingSafeEqual. */
export function secretsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

const V32 = BigInt("0xffffffff"); // full IPv4 mask
const V4_END = BigInt("0x100000000"); // 2^32 - IPv4 addresses live below it

/** Parse an IPv4/IPv6 string into a bigint, or null when malformed.
 *  IPv4-mapped IPv6 (::ffff:a.b.c.d) is normalized to plain IPv4 so allowlist
 *  entries stay IPv4 CIDRs regardless of how the edge reports the client. */
export function ipToBigInt(ip: string): bigint | null {
  const s = ip.trim();
  if (!s) return null;
  if (!s.includes(":")) {
    const p = s.split(".");
    if (p.length !== 4) return null;
    let v = BigInt(0);
    for (const part of p) {
      if (!/^\d{1,3}$/.test(part)) return null;
      const n = Number(part);
      if (n > 255) return null;
      v = (v << BigInt(8)) | BigInt(n);
    }
    return v;
  }
  // IPv6: at most one "::" keeps the zero-run unambiguous
  const dbl = s.replace(/^\[|\]$/g, "").split("::");
  if (dbl.length > 2) return null;
  const groupsOf = (side: string): string[] | null => {
    if (!side) return [];
    const out: string[] = [];
    for (const g of side.split(":")) {
      if (g.includes(".")) {
        // embedded IPv4 tail (RFC 4291 2.5.5) -> two hex groups
        const v4 = ipToBigInt(g);
        if (v4 === null) return null;
        out.push(
          ((v4 >> BigInt(16)) & V32).toString(16),
          (v4 & V32).toString(16),
        );
      } else {
        if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
        out.push(g.toLowerCase());
      }
    }
    return out;
  };
  const head = groupsOf(dbl[0]);
  const tail = dbl.length === 2 ? groupsOf(dbl[1]) : [];
  if (!head || !tail) return null;
  const fill = 8 - head.length - tail.length;
  if (dbl.length === 2 ? fill < 0 : fill !== 0) return null;
  const groups = dbl.length === 2 ? [...head, ...Array<string>(fill).fill("0"), ...tail] : head;
  let v = BigInt(0);
  for (const g of groups) {
    v = (v << BigInt(16)) | BigInt(parseInt(g, 16));
  }
  // ::ffff:0:0/96 is the v4-mapped range - fold it back to IPv4
  if (v >> BigInt(32) === BigInt("0xffff") && v < BigInt("0x1000000000000000000000000")) {
    return v & V32;
  }
  return v;
}

const isV4 = (v: bigint) => v < V4_END;

/** True when ip falls inside cidr ("a.b.c.d/nn" or a bare address = /32). */
export function ipInCidr(ip: string, cidr: string): boolean {
  const [net, bitsStr] = cidr.trim().split("/");
  const ipV = ipToBigInt(ip);
  const netV = ipToBigInt(net ?? "");
  if (ipV === null || netV === null || isV4(ipV) !== isV4(netV)) return false;
  if (bitsStr === undefined) return ipV === netV;
  const bits = Number(bitsStr);
  const maxBits = isV4(ipV) ? 32 : 128;
  if (!Number.isInteger(bits) || bits < 0 || bits > maxBits) return false;
  const shift = BigInt(maxBits - bits);
  return ipV >> shift === netV >> shift;
}

/** Cloudflare edge networks (https://www.cloudflare.com/ips/). */
const CF_RANGES = [
  // IPv4
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
  // IPv6
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
];

/** True when the platform-reported connecting peer (x-real-ip) is a
 *  Cloudflare edge IP. cf-connecting-ip means anything only when the
 *  connection demonstrably arrived through Cloudflare: with DNS-only
 *  (grey-cloud) DNS the header is client-supplied and MUST be ignored,
 *  otherwise a forged header forges the caller's quota identity. */
function behindCloudflare(headers: Headers): boolean {
  const peer = headers.get("x-real-ip");
  if (!peer) return false;
  return CF_RANGES.some((cidr) => ipInCidr(peer.trim(), cidr));
}

/** Connection IP as the nearest trusted proxy reported it: x-real-ip first
 *  (set by the platform edge, a client cannot keep a spoofed value there),
 *  then the LAST well-formed entry of x-forwarded-for - the one appended by
 *  the closest proxy, which a spoofing client cannot overwrite - then the
 *  first well-formed entry. Garbage falls back to "unknown" instead of an
 *  attacker-chosen string. */
function connIp(headers: Headers): string {
  const real = headers.get("x-real-ip");
  if (real && ipToBigInt(real) !== null) return real.trim();
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim());
    const last = parts[parts.length - 1] ?? "";
    if (last && ipToBigInt(last) !== null) return last;
    for (const part of parts) {
      if (ipToBigInt(part) !== null) return part;
    }
  }
  return "unknown";
}

/** The requester IP for quotas and locks: cf-connecting-ip is honored only
 *  when the request demonstrably arrived from a Cloudflare edge (peer in
 *  the CF ranges); everything else defers to the platform-reported
 *  connection IP. */
export function getClientIp(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip");
  if (cf && ipToBigInt(cf) !== null && behindCloudflare(headers)) return cf.trim();
  return connIp(headers);
}

/** IP allowlist check; "*" or an empty list disables the filter. */
export function ipAllowed(ip: string, allowlist: string[]): boolean {
  if (!allowlist.length || allowlist.includes("*")) return true;
  return allowlist.some((entry) => ipInCidr(ip, entry));
}

/** Connection IP for our own edge topology (no Cloudflare in front): same
 *  rule as getClientIp minus the CF header branch. */
export function getConnIp(headers: Headers): string {
  return connIp(headers);
}

/** 152-FZ: the raw client IP is personal data, so owner notifications never
 *  carry it - the coarse edge-derived country replaces it. The value comes
 *  from x-vercel-ip-country, which the Vercel edge sets itself (client-supplied
 *  x-vercel-* headers are stripped, so it cannot be forged); no external geo
 *  API is involved. A strict ISO 3166-1 alpha-2 check keeps any malformed
 *  value out of the alert; without a usable country the line is empty.
 *  Returns the ready-to-append alert line ("📡 Регион: XX") or "". */
export function regionLine(headers: Headers): string {
  const country = (headers.get("x-vercel-ip-country") ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(country) ? `📡 Регион: ${country}` : "";
}

/** Cron-tick gate: when a TICK_SECRET is configured, every call must present
 *  it via the x-tick-secret header or a ?secret= query parameter (both are
 *  compared constant-time). Without the env var the endpoint stays public -
 *  backward compatible with deployments that rely on the lock-based throttle.
 *  Pure function over the request's Headers and URL, so it is trivially
 *  testable without a running server. */
export function tickSecretOk(headers: Headers, url: string, configured: string | undefined | null): boolean {
  const secret = (configured ?? "").trim();
  if (!secret) return true;
  if (secretsMatch(headers.get("x-tick-secret") ?? "", secret)) return true;
  let querySecret = "";
  try {
    querySecret = new URL(url).searchParams.get("secret") ?? "";
  } catch {
    querySecret = "";
  }
  return secretsMatch(querySecret, secret);
}
