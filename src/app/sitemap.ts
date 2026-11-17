import type { MetadataRoute } from "next";
import { getRegistryEntries } from "@/lib/scanner/store";
import { dedupeRegistry } from "@/lib/registry";
import { FIX_GUIDES } from "@/lib/fixes-content";

export const dynamic = "force-dynamic";

/** hreflang pair for a clean path: ru is the default, en lives under /en/ */
function langs(baseUrl: string, path: string): MetadataRoute.Sitemap[number]["alternates"] {
  return {
    languages: {
      ru: `${baseUrl}${path === "/" ? "" : path}`,
      en: `${baseUrl}/en${path === "/" ? "" : path}`,
      "x-default": `${baseUrl}${path === "/" ? "" : path}`,
    },
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://appseal.online";
  const L = (path: string) => langs(baseUrl, path);
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
      alternates: L("/"),
    },
    {
      url: `${baseUrl}/registry`,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 0.9,
      alternates: L("/registry"),
    },
    {
      url: `${baseUrl}/stats`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
      alternates: L("/stats"),
    },
    {
      url: `${baseUrl}/fixes`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
      alternates: L("/fixes"),
    },
    ...FIX_GUIDES.map(
      (g): MetadataRoute.Sitemap[number] => ({
        url: `${baseUrl}/fixes/${g.slug}`,
        lastModified: now,
        changeFrequency: "monthly" as const,
        priority: 0.7,
        alternates: L(`/fixes/${g.slug}`),
      }),
    ),
    {
      url: `${baseUrl}/versus`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
      alternates: L("/versus"),
    },
    {
      url: `${baseUrl}/digest`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
      alternates: L("/digest"),
    },
    {
      url: `${baseUrl}/ci`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
      alternates: L("/ci"),
    },
    {
      url: `${baseUrl}/api`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
      alternates: L("/api"),
    },
    {
      url: `${baseUrl}/bot`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
      alternates: L("/bot"),
    },
    {
      url: `${baseUrl}/legal`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
      alternates: L("/legal"),
    },
  ];

  try {
    const raw = await getRegistryEntries();
    const entries = dedupeRegistry(raw).slice(0, 150);
    const dynamicRoutes: MetadataRoute.Sitemap = entries.map((e) => ({
      url: `${baseUrl}/report/${e.id}`,
      lastModified: new Date(e.ts),
      changeFrequency: "weekly",
      priority: e.grade === "A+" || e.grade === "A" ? 0.8 : 0.6,
    }));
    // A/A+ domain profiles: indexable proof pages that rank on brand searches
    const verifiedRoutes: MetadataRoute.Sitemap = dedupeRegistry(raw)
      .filter((e) => e.grade === "A+" || e.grade === "A")
      .slice(0, 60)
      .map((e) => ({
        url: `${baseUrl}/verified/${e.host}`,
        lastModified: new Date(e.ts),
        changeFrequency: "daily" as const,
        priority: 0.7,
        alternates: L(`/verified/${e.host}`),
      }));
    return [...staticRoutes, ...dynamicRoutes, ...verifiedRoutes];
  } catch {
    return staticRoutes;
  }
}
