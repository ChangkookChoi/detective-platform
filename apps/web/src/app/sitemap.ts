import type { MetadataRoute } from "next";

import { listPublicOfficeSitemapEntries } from "@/modules/directory/public-office-repository";
import { getAbsoluteUrl } from "@/modules/shared/site-url";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const offices = await listPublicOfficeSitemapEntries();
  const staticPages: MetadataRoute.Sitemap = [
    { url: getAbsoluteUrl("/"), changeFrequency: "weekly", priority: 1 },
    {
      url: getAbsoluteUrl("/offices"),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: getAbsoluteUrl("/guide"),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: getAbsoluteUrl("/privacy"),
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: getAbsoluteUrl("/advertising"),
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];

  return [
    ...staticPages,
    ...offices.map(
      (office): MetadataRoute.Sitemap[number] => ({
        url: getAbsoluteUrl(`/offices/${office.slug}`),
        lastModified: office.lastModified,
        changeFrequency: "monthly",
        priority: 0.8,
      }),
    ),
  ];
}
