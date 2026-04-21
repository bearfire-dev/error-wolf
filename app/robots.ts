import type { MetadataRoute } from "next"

import { getSiteUrl } from "@/lib/site-url"

export default function robots(): MetadataRoute.Robots {
  const origin = getSiteUrl().origin

  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${origin}/sitemap.xml`,
  }
}
