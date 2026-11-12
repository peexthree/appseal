/**
 * Public registry of scanned hosts (issue #2 GTM): grade-A hosts get an
 * indexable (dofollow) link from the catalog, lower grades are nofollow.
 * Pure logic only - storage lives in scanner/store.ts.
 */

export interface RegistryEntry {
  host: string;
  grade: string;
  score: number;
  ts: number;
  id: string;
}

export const REGISTRY_MAX = 200;

/** Keep the newest scan per host, newest first. */
export function dedupeRegistry(entries: RegistryEntry[]): RegistryEntry[] {
  const byHost = new Map<string, RegistryEntry>();
  for (const e of entries) {
    const prev = byHost.get(e.host);
    if (!prev || e.ts > prev.ts) byHost.set(e.host, e);
  }
  return [...byHost.values()].sort((a, b) => b.ts - a.ts);
}

/** Grade A earns a dofollow link, everything else stays nofollow. */
export function isDofollow(e: RegistryEntry): boolean {
  return e.grade === "A";
}
