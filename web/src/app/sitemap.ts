import type { MetadataRoute } from "next";
import { getKnownPageSlugs } from "@/lib/config/server";
import { SITE_URL } from "@/lib/env";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slugs = await getKnownPageSlugs();
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/pricing`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/login`, changeFrequency: "monthly", priority: 0.5 },
    ...slugs.map((slug) => ({ url: `${SITE_URL}/p/${slug}`, changeFrequency: "monthly" as const, priority: 0.4 })),
  ];
}
