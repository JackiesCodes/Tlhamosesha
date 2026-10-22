import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Public pages are indexable; the app itself is per-user and has nothing to index.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/privacy", "/terms"], disallow: ["/api/", "/projects/", "/upload", "/settings", "/downloads", "/analytics", "/labs"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
