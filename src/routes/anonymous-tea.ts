import { createFileRoute } from "@tanstack/react-router"

import { getSentryDsn } from "@/lib/sentry-dsn"
import {
  getSentryTunnelAllowlist,
  resolveSentryTunnelUpstreamUrl,
} from "@/lib/sentry-tunnel-allowlist"

/**
 * Sentry tunnel. `instrumentation-client` — now `src/integrations/sentry.client.ts`
 * — sets `tunnel` to this exact path, so the path must not change.
 *
 * BotID is gone with Vercel. The DSN allowlist below is the remaining guard: it
 * pins the upstream to this project's own ingest host and project id, so the
 * route cannot be used as an open proxy. It does not rate-limit.
 */
export const Route = createFileRoute("/anonymous-tea")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const allow = getSentryTunnelAllowlist(getSentryDsn())
        if (!allow) {
          return new Response(null, { status: 503 })
        }

        const url = new URL(request.url)
        const upstreamUrl = resolveSentryTunnelUpstreamUrl(
          allow,
          url.searchParams.get("o"),
          url.searchParams.get("p"),
          url.searchParams.get("r")
        )
        if (!upstreamUrl) {
          return new Response(null, { status: 400 })
        }

        const headers = new Headers()
        const ct = request.headers.get("content-type")
        if (ct) headers.set("content-type", ct)
        const auth = request.headers.get("x-sentry-auth")
        if (auth) headers.set("x-sentry-auth", auth)

        const body = await request.arrayBuffer()

        const upstream = await fetch(upstreamUrl, {
          method: "POST",
          headers,
          body,
        })

        const outHeaders = new Headers()
        const upstreamCt = upstream.headers.get("content-type")
        if (upstreamCt) outHeaders.set("content-type", upstreamCt)
        const retryAfter = upstream.headers.get("retry-after")
        if (retryAfter) outHeaders.set("retry-after", retryAfter)

        return new Response(upstream.body, {
          status: upstream.status,
          headers: outHeaders,
        })
      },
    },
  },
})
