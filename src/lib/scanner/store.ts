import type { ScanResult } from "./types";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * File-backed store for scan results.
 * MVP-grade: one JSON file per scan under /home/z/my-project/db/scans.
 * Swap for Postgres/Redis in production (see spec § Architecture).
 */

const DIR = path.join(process.cwd(), "db", "scans");

async function ensureDir() {
  await fs.mkdir(DIR, { recursive: true });
}

export async function saveScan(scan: ScanResult): Promise<void> {
  await ensureDir();
  await fs.writeFile(path.join(DIR, `${scan.id}.json`), JSON.stringify(scan), "utf-8");
}

export async function getScan(id: string): Promise<ScanResult | null> {
  if (!/^[a-z0-9-]{6,40}$/i.test(id)) return null;
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
  const rand = Math.random().toString(36).slice(2, 8);
  return `${Date.now().toString(36)}-${rand}`;
}
