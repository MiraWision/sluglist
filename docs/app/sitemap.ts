import type { MetadataRoute } from "next";
import { COMPARE_PAGES } from "@/lib/compare";
import { DOC_PAGES } from "@/lib/docs";
import { SITE_URL } from "@/lib/site";
import { USE_CASES } from "@/lib/use-cases";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/docs/`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    ...DOC_PAGES.map((d) => ({
      url: `${SITE_URL}/docs/${d.slug}/`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    { url: `${SITE_URL}/for/`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    ...USE_CASES.map((c) => ({
      url: `${SITE_URL}/for/${c.slug}/`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...COMPARE_PAGES.map((c) => ({
      url: `${SITE_URL}/compare/${c.slug}/`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    { url: `${SITE_URL}/changelog/`, lastModified, changeFrequency: "weekly", priority: 0.5 },
  ];
}
