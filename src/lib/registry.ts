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
  /** builder platform detected by the engine at scan time ("Lovable",
   *  "Replit", "Bolt.new", "Framer", "v0/Vercel", "Base44", "Firebase
   *  Hosting"); optional - legacy entries and suffix matching still work */
  platform?: string;
}

/**
 * Upper bound of the public registry list. The 16k+ host mass runs must not
 * be trimmed away: every push LPUSHes one entry and LTRIMs the list to this
 * length (newest first). ~30k entries is roughly 2MB of JSON - reads go
 * through the 120s in-process cache, so a page view pays it once per cache
 * lifetime, not per request.
 */
export const REGISTRY_MAX = 30000;

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
  // IANA reserved and engine self-test hosts
  "example.com", "example.org", "appmot.vercel.app",
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

/** Chip key of the /registry filter row: the two special chips plus the five
 *  platform buckets. Shared by the page (URL param) and the client list. */
export type RegistryChipKey = PlatformKey | "all" | "top";

export const REGISTRY_CHIP_KEYS: RegistryChipKey[] = [
  "all", "top", "custom", "lovable", "github", "vercel", "other",
];

/** True when a raw ?platform= query param is a valid chip key. */
export function isRegistryChipKey(v: string | undefined | null): v is RegistryChipKey {
  return !!v && (REGISTRY_CHIP_KEYS as string[]).includes(v);
}

/**
 * Pure filter behind the /registry chips and search: platform/top chip plus a
 * www-insensitive query over host and description. Pure so the server page and
 * the unit tests run the exact same matching.
 */
export function filterRegistryEntries(
  entries: RegistryEntry[],
  opts: { chip?: RegistryChipKey; q?: string } = {},
): RegistryEntry[] {
  let list = entries;
  if (opts.chip === "top") list = list.filter((e) => isDofollow(e));
  else if (opts.chip && opts.chip !== "all") {
    list = list.filter((e) => platformBucketOf(e) === opts.chip);
  }
  const q = (opts.q ?? "").trim().toLowerCase().replace(/^www\./, "");
  if (q) {
    list = list.filter(
      (e) =>
        e.host.toLowerCase().replace(/^www\./, "").includes(q) ||
        (e.desc ?? "").toLowerCase().includes(q),
    );
  }
  return list;
}

/** platform buckets for the quick-filter chips (suffix = hosting subdomain) */
export type PlatformKey = "custom" | "lovable" | "github" | "vercel" | "other";

export function platformOf(host: string): PlatformKey {
  const h = host.toLowerCase();
  if (h.endsWith(".lovable.app")) return "lovable";
  if (h.endsWith(".vercel.app")) return "vercel";
  if (h.endsWith(".github.io")) return "github";
  const otherPlatform = [
    ".replit.app", ".replit.dev", ".repl.co", ".railway.app", ".pages.dev",
    ".netlify.app", ".onrender.com", ".bolt.host", ".workers.dev", ".fly.dev",
    ".glitch.me", ".web.app", ".firebaseapp.com", ".amplifyapp.com",
    ".azurestaticapps.net", ".gitlab.io", ".deno.dev",
  ].some((s) => h.endsWith(s));
  return otherPlatform ? "other" : "custom";
}

/**
 * The engine labels a scan with the builder platform it detected in the page
 * body (detectPlatform): a Lovable build served from a custom domain still
 * counts as Lovable. Engine names map onto the same five buckets the chips
 * use; entries without the field fall back to the host suffix.
 */
const ENGINE_PLATFORM_BUCKETS: Record<string, PlatformKey> = {
  "Lovable": "lovable",
  "v0/Vercel": "vercel",
  "Replit": "other",
  "Bolt.new": "other",
  "Framer": "other",
  "Base44": "other",
  "Firebase Hosting": "other",
};

export function platformBucketOf(entry: { host: string; platform?: string }): PlatformKey {
  const mapped = entry.platform ? ENGINE_PLATFORM_BUCKETS[entry.platform] : undefined;
  return mapped ?? platformOf(entry.host);
}

export const PLATFORM_LABELS: Record<PlatformKey, { ru: string; en: string }> = {
  custom: { ru: "Свой домен", en: "Custom domain" },
  lovable: { ru: "Lovable", en: "Lovable" },
  github: { ru: "GitHub Pages", en: "GitHub Pages" },
  vercel: { ru: "Vercel", en: "Vercel" },
  other: { ru: "Другие платформы", en: "Other platforms" },
};
