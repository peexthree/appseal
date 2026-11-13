import type { MetadataRoute } from "next";
import { getRegistryEntries } from "@/lib/scanner/store";
import { dedupeRegistry } from "@/lib/registry";

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
      url: `${baseUrl}/bot`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  try {
    const raw = await getRegistryEntries();
    const entries = dedupeRegistry(raw).slice(0, 150);
    const dynamicRoutes: MetadataRoute.Sitemap = entries.map((e) => ({
      url: `${baseUrl}/?report=${e.id}`,
      lastModified: new Date(e.ts),
      changeFrequency: "weekly",
      priority: e.grade === "A+" || e.grade === "A" ? 0.8 : 0.6,
    }));
    return [...staticRoutes, ...dynamicRoutes];
  } catch {
    return staticRoutes;
  }
}
