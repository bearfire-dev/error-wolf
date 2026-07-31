import { createFileRoute } from "@tanstack/react-router"

import { getSiteUrl } from "@/lib/site-url"

/** Replaces `app/robots.ts`. Kept as a route so the origin still comes from
 * `VITE_SITE_URL` instead of being hardcoded in a static file. */
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () => {
        const origin = getSiteUrl().origin
        const body = [
          "User-Agent: *",
          "Allow: /",
          "",
          `Sitemap: ${origin}/sitemap.xml`,
          "",
        ].join("\n")

        return new Response(body, {
          headers: { "content-type": "text/plain; charset=utf-8" },
        })
      },
    },
  },
})
