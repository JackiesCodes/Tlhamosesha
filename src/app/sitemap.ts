import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const legal = new Date(BRAND.legalUpdated);
  return [
    { url: `${SITE_URL}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/privacy`, lastModified: legal, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: legal, changeFrequency: "yearly", priority: 0.3 },
  ];
}
