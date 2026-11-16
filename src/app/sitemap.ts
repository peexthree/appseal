import type { MetadataRoute } from "next";
import { getRegistryEntries } from "@/lib/scanner/store";
import { dedupeRegistry } from "@/lib/registry";
import { FIX_GUIDES } from "@/lib/fixes-content";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://appseal.online";

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/registry`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/stats`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/fixes`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...FIX_GUIDES.map(
      (g): MetadataRoute.Sitemap[number] => ({
        url: `${baseUrl}/fixes/${g.slug}`,
        lastModified: new Date(),
        changeFrequency: "monthly" as const,
        priority: 0.7,
      }),
    ),
    {
      url: `${baseUrl}/versus`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/digest`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/ci`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/bot`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/legal`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.3,
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
      }));
    return [...staticRoutes, ...dynamicRoutes, ...verifiedRoutes];
  } catch {
    return staticRoutes;
  }
}
