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

/** The requester IP as the platform edge reported it: CF header first
 *  (present when Cloudflare proxies), then Vercel's x-real-ip, then the
 *  first well-formed entry of x-forwarded-for. A client-supplied chain is
 *  never trusted - only entries that parse as real IPs are considered, and
 *  garbage falls back to "unknown" instead of an attacker-chosen string. */
export function getClientIp(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip");
  if (cf && ipToBigInt(cf) !== null) return cf.trim();
  const real = headers.get("x-real-ip");
  if (real && ipToBigInt(real) !== null) return real.trim();
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    for (const part of xff.split(",")) {
      if (ipToBigInt(part) !== null) return part.trim();
    }
  }
  return "unknown";
}

/** IP allowlist check; "*" or an empty list disables the filter. */
export function ipAllowed(ip: string, allowlist: string[]): boolean {
  if (!allowlist.length || allowlist.includes("*")) return true;
  return allowlist.some((entry) => ipInCidr(ip, entry));
}
