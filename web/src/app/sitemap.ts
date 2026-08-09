import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/config";

// Served at /sitemap.xml. Only the public landing page is indexable; the workspace and
// auth screens are gated/noindex, so they are intentionally omitted.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
