import type { ScanResult } from "./types";
import { promises as fs } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

/**
 * Store for scan results: one JSON record per scan.
 *
 * Backends, selected automatically by environment:
 *  - Upstash Redis (REST) when UPSTASH_REDIS_REST_URL + TOKEN are set  → prod/serverless
 *  - local files under db/scans otherwise                              → dev/docker
 *
 * The API surface (saveScan/getScan/updateScan/newId) is the contract from
 * the MVP spec: swapping backends must not change callers.
 */

const SCAN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days retention on the shared store
const KEY_PREFIX = "appmot:scan:";

interface RedisCfg {
  url: string;
  token: string;
}

function redisConfig(): RedisCfg | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function redis(cfg: RedisCfg, command: unknown[]): Promise<unknown> {
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cfg.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  const data = (await res.json()) as { result?: unknown; error?: string };
  if (data.error) throw new Error(`redis: ${data.error}`);
  return data.result ?? null;
}

const DIR = path.join(process.cwd(), "db", "scans");

async function ensureDir() {
  await fs.mkdir(DIR, { recursive: true });
}

export async function saveScan(scan: ScanResult): Promise<void> {
  const cfg = redisConfig();
  if (cfg) {
    await redis(cfg, [
      "SET",
      KEY_PREFIX + scan.id,
      JSON.stringify(scan),
      "EX",
      String(SCAN_TTL_SECONDS),
    ]);
    return;
  }
  await ensureDir();
  await fs.writeFile(path.join(DIR, `${scan.id}.json`), JSON.stringify(scan), "utf-8");
}

export async function getScan(id: string): Promise<ScanResult | null> {
  if (!/^[a-z0-9-]{6,40}$/i.test(id)) return null;
  const cfg = redisConfig();
  if (cfg) {
    try {
      const raw = (await redis(cfg, ["GET", KEY_PREFIX + id])) as string | null;
      return raw ? (JSON.parse(raw) as ScanResult) : null;
    } catch {
      return null;
    }
  }
  try {
    const raw = await fs.readFile(path.join(DIR, `${id}.json`), "utf-8");
    return JSON.parse(raw) as ScanResult;
  } catch {
    return null;
  }
}

export async function updateScan(
  id: string,
  patch: Partial<ScanResult>,
): Promise<ScanResult | null> {
  const cur = await getScan(id);
  if (!cur) return null;
  const next = { ...cur, ...patch };
  await saveScan(next);
  return next;
}

export function newId(): string {
  return `${Date.now().toString(36)}-${randomBytes(5).toString("hex")}`;
}
