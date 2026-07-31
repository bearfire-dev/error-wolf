import { handleTunnelRequest } from "@sentry/core"
import { createFileRoute } from "@tanstack/react-router"

import { SENTRY_DSN } from "@/lib/sentry/constants"

/**
 * Sentry envelope proxy. The browser SDK posts here instead of posting to
 * `ingest.us.sentry.io`, so an ad blocker sees a first-party request to a path
 * it does not recognize. The Worker then forwards the envelope.
 *
 * A side effect worth keeping: because the Worker re-issues the request, Sentry
 * receives it from Cloudflare and never sees a visitor IP.
 *
 * `handleTunnelRequest` validates the envelope header against `allowedDsns`, so
 * this cannot be used as an open relay to some other Sentry project.
 */

/** Envelopes are a few KB. This only bounds abuse. */
const MAX_ENVELOPE_BYTES = 512_000

/**
 * Anything other than POST. Without these the router has no handler for the
 * method, falls through to the SPA shell, and answers `GET /wdyd` with 200 and
 * the full app HTML — a phantom page that `robots.txt` (`Allow: /`) invites
 * crawlers to index.
 */
const methodNotAllowed = () =>
  new Response("Method not allowed", {
    status: 405,
    headers: { allow: "POST", "cache-control": "no-store" },
  })

export const Route = createFileRoute("/wdyd")({
  server: {
    handlers: {
      GET: methodNotAllowed,
      HEAD: methodNotAllowed,
      PUT: methodNotAllowed,
      PATCH: methodNotAllowed,
      DELETE: methodNotAllowed,
      OPTIONS: methodNotAllowed,
      POST: async ({ request }) => {
        const declaredLength = Number(
          request.headers.get("content-length") ?? 0
        )
        if (declaredLength > MAX_ENVELOPE_BYTES) {
          return new Response("Payload too large", { status: 413 })
        }

        const upstream = await handleTunnelRequest({
          request,
          allowedDsns: [SENTRY_DSN],
        })

        const headers = new Headers(upstream.headers)
        headers.set("cache-control", "no-store")
        return new Response(upstream.body, {
          status: upstream.status,
          headers,
        })
      },
    },
  },
})
