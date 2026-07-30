import { createFileRoute } from "@tanstack/react-router"

import { getSiteUrl } from "@/lib/site-url"

type SitemapEntry = {
  path: string
  changeFrequency: "weekly" | "monthly"
  priority: number
}

/** Same three paths, change frequencies, and priorities as `app/sitemap.ts`. */
const ENTRIES: readonly SitemapEntry[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/hunt", changeFrequency: "weekly", priority: 0.9 },
  { path: "/privacy", changeFrequency: "monthly", priority: 0.5 },
]

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () => {
        const base = getSiteUrl()
        const lastModified = new Date().toISOString()

        const urls = ENTRIES.map(({ path, changeFrequency, priority }) =>
          [
            "  <url>",
            `    <loc>${new URL(path, base).href}</loc>`,
            `    <lastmod>${lastModified}</lastmod>`,
            `    <changefreq>${changeFrequency}</changefreq>`,
            `    <priority>${priority}</priority>`,
            "  </url>",
          ].join("\n")
        ).join("\n")

        const body = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          urls,
          "</urlset>",
          "",
        ].join("\n")

        return new Response(body, {
          headers: { "content-type": "application/xml; charset=utf-8" },
        })
      },
    },
  },
})
