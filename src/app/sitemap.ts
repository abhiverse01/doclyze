import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://doclyze-web.vercel.app";

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${baseUrl}/dashboard`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/analyzer`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.9,
    },
    // NOTE: /analyzer/[docId] routes are deliberately EXCLUDED from the sitemap
    // because they are ephemeral, localStorage-backed pages. Each user's
    // document history is device-specific and non-persistent — a crawler
    // cannot access meaningful content at these URLs, and the same URL on
    // a different device would show a "not found" fallback. These routes
    // are also marked noindex via their route-level metadata robots config.
  ];
}
