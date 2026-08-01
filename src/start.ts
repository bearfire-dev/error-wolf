import { captureException } from "@sentry/core"
import { createMiddleware, createStart } from "@tanstack/react-start"

import { SENTRY_TUNNEL_PATH } from "@/lib/sentry/constants"

/**
 * Global request middleware. TanStack Start discovers this file by name — there
 * is no config entry for it.
 *
 * It reports server-function throws and anything else that escapes a request
 * handler. The Worker `fetch` wrapper in `src/server.ts` catches what escapes
 * further still, and `defaultOnCatch` in `src/router.tsx` catches React render
 * errors in the browser. The three layers together are the coverage.
 *
 * `captureException` comes from `@sentry/core`, never `@sentry/cloudflare`.
 * This file is bundled into both the browser and the Worker, and
 * `@sentry/cloudflare` pulls in `node:async_hooks` and `cloudflare:workers`,
 * which would break the browser build. The core helper resolves whichever
 * client is on the current scope, so the same code reports through the
 * Cloudflare client on the server and the browser client on the client.
 */
const sentryRequestMiddleware = createMiddleware({ type: "request" }).server(
  async ({ next, pathname, handlerType }) => {
    // The tunnel reports its own failures through the Worker wrapper. Catching
    // them here too would file the same error twice under different tags.
    if (pathname.startsWith(SENTRY_TUNNEL_PATH)) return next()

    try {
      return await next()
    } catch (error) {
      captureException(error, {
        mechanism: { type: "tanstack-start.request", handled: false },
        // Tags have to travel under `captureContext`: the hint type rejects a
        // mix of `EventHint` and scope fields at the top level.
        captureContext: { tags: { handler_type: handlerType } },
      })
      throw error
    }
  }
)

export const startInstance = createStart(() => ({
  requestMiddleware: [sentryRequestMiddleware],
}))
