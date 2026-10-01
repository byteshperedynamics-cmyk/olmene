import type { MetadataRoute } from "next";
import { APP_URL } from "@/lib/config";

// Published because our own free diagnosis flagged /sitemap.xml as unreachable.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const page = (path: string, changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"], priority: number) => ({
    url: `${APP_URL}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  });
  return [
    page("/", "weekly", 1),
    page("/pricing/", "monthly", 0.9),
    page("/sample-report/", "monthly", 0.8),
    page("/open/", "daily", 0.6),
    page("/login/", "yearly", 0.3),
    page("/legal/terms/", "yearly", 0.2),
    page("/legal/privacy/", "yearly", 0.2),
  ];
}
