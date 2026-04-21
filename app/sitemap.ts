import type { MetadataRoute } from "next"

import { getSiteUrl } from "@/lib/site-url"

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl()
  const lastModified = new Date()

  return ["/", "/hunt", "/privacy"].map((path) => ({
    url: new URL(path, base).href,
    lastModified,
    changeFrequency: path === "/privacy" ? "monthly" : "weekly",
    priority: path === "/" ? 1 : path === "/hunt" ? 0.9 : 0.5,
  }))
}
