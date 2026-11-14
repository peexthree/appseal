import { promises as dns } from "node:dns";

/**
 * Target guard: the scanner only talks to public http(s) hosts.
 * Blocks loopback, private, link-local and reserved ranges (SSRF hardening).
 * The demo fixture (127.0.0.1:3210) is first-party and explicitly allowed
 * via the allowLoopback flag.
 */

// dotted-quad CIDR blocks that must never be scanned
const FORBIDDEN_V4: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  // NOTE: 198.18.0.0/15 is deliberately NOT blocked - it is the fake-IP pool
  // of local proxy clients (Clash/mihomo fake-ip DNS mode); blocking it would
  // break every scan made through such a tunnel, with no real SSRF benefit
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3], // multicast + reserved (224.0.0.0 - 255.255.255.255)
];

const FORBIDDEN_V6 = [
  "::",
  "::1",
  "fc00::/7",
  "fe80::/10",
  "ff00::/8",
];

function v4ToNum(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let num = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255 || !/^\d{1,3}$/.test(p)) return null;
    num = num * 256 + v;
  }
  return num >>> 0;
}

function cidrMatch(ip: number, base: string, bits: number): boolean {
  const baseNum = v4ToNum(base);
  if (baseNum === null) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ip & mask) === (baseNum & mask);
}

export function isForbiddenIp(ip: string): boolean {
  // IPv4-mapped IPv6 (::ffff:a.b.c.d)
  const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const v4 = mapped ? mapped[1] : ip;

  if (v4.includes(".")) {
    const num = v4ToNum(v4);
    if (num === null) return true; // malformed → deny
    return FORBIDDEN_V4.some(([base, bits]) => cidrMatch(num, base, bits));
  }

  // IPv6
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7
  if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true; // fe80::/10
  if (lower.startsWith("ff")) return true; // ff00::/8
  return false;
}

/**
 * Resolves the hostname and verifies all resolved addresses are public.
 * Literal IPs are checked directly. Throws when the target is forbidden.
 */
export async function assertPublicTarget(hostname: string): Promise<void> {
  // literal IP fast-path
  const literal = v4ToNum(hostname);
  if (literal !== null) {
    if (isForbiddenIp(hostname)) {
      throw new Error("target is not a public address");
    }
    return;
  }

  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".internal") || hostname.endsWith(".local")) {
    throw new Error("target is not a public host");
  }

  let records;
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("cannot resolve target host");
  }
  if (!records.length) throw new Error("cannot resolve target host");

  for (const r of records) {
    if (isForbiddenIp(r.address)) {
      throw new Error("target resolves to a non-public address");
    }
  }
}

/**
 * Fetch-level guard: validates an absolute http(s) URL immediately before a
 * request. Literal IPs are checked directly; hostnames are resolved and every
 * resolved record must be public. safeFetch re-runs this per redirect hop, so
 * a public site cannot bounce a probe to a private address (DNS rebinding /
 * redirect-to-localhost attacks).
 */
export async function assertPublicFetchTarget(url: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("invalid URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("only http/https targets are allowed");
  }
  await assertPublicTarget(u.hostname);
}
