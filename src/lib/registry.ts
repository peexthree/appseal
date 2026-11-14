/**
 * Public registry of scanned hosts (issue #2 GTM): every finished scan is
 * listed, grade-A hosts get an indexable (dofollow) link from the catalog,
 * lower grades are blurred in the UI and not linked at all - the catalog
 * advertises only the hosts that earned the badge. Pure logic only - storage
 * lives in scanner/store.ts.
 */

export interface RegistryEntry {
  host: string;
  grade: string;
  score: number;
  ts: number;
  id: string;
  /** short public description taken from the site's <title>; optional (old entries) */
  desc?: string;
}

export const REGISTRY_MAX = 1000;

/**
 * Hosts stored and displayed in canonical (www-less, lowercase) form: a scan
 * of www.example.com and example.com is one catalog entry, not two.
 */
export function canonicalHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

/**
 * Mega-sites that land in the catalog through demo scans of well-known
 * domains. They are not AI-built apps, so "YouTube - Vulnerable" next to
 * indie projects undermines the grading algorithm's credibility: reference
 * hosts are kept in storage (the stats stay untouched) but never rendered.
 */
const REFERENCE_HOSTS = new Set([
  "google.com", "youtube.com", "facebook.com", "instagram.com", "x.com",
  "twitter.com", "github.com", "gitlab.com", "wikipedia.org", "reddit.com",
  "medium.com", "stackoverflow.com", "amazon.com", "netflix.com",
  "linkedin.com", "tiktok.com", "apple.com", "microsoft.com", "mozilla.org",
  "cloudflare.com", "vercel.com", "netlify.com", "upstash.com", "supabase.com",
  "notion.so", "figma.com", "openai.com", "chatgpt.com", "claude.ai",
  "anthropic.com", "telegram.org", "discord.com", "spotify.com", "twitch.tv",
  "ebay.com", "yandex.ru", "vk.com", "ozon.ru", "wildberries.ru", "habr.com",
  "npmjs.com", "wordpress.org",
]);

/** True when the host is a mega reference site, not an AI-built project. */
export function isReferenceSite(host: string): boolean {
  return REFERENCE_HOSTS.has(canonicalHost(host));
}

/**
 * Keep the newest scan per canonical host, newest first. The www. prefix is
 * folded here, so legacy rows stored as www.example.com merge into the
 * example.com entry on read - no data migration needed.
 */
export function dedupeRegistry(entries: RegistryEntry[]): RegistryEntry[] {
  const byHost = new Map<string, RegistryEntry>();
  for (const e of entries) {
    const host = canonicalHost(e.host);
    const normalized = host === e.host ? e : { ...e, host };
    const prev = byHost.get(host);
    if (!prev || e.ts > prev.ts) byHost.set(host, normalized);
  }
  return [...byHost.values()].sort((a, b) => b.ts - a.ts);
}

/** Grade A+ and A earn a dofollow link, everything else stays nofollow. */
export function isDofollow(e: RegistryEntry): boolean {
  return e.grade === "A+" || e.grade === "A";
}
