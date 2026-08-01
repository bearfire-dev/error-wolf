import { withSentry } from "@sentry/cloudflare"
import handler, { createServerEntry } from "@tanstack/react-start/server-entry"
import type { ServerEntry } from "@tanstack/react-start/server-entry"

import { workerSentryOptions } from "@/lib/sentry/options"

/**
 * Worker entry. It forwards to the TanStack Start handler, wrapped so Sentry
 * sees every request.
 *
 * `wrangler.jsonc` points `main` here rather than straight at
 * `@tanstack/react-start/server-entry`, which is what makes the wrapping
 * possible.
 */
const fetch: ServerEntry["fetch"] = (request) => handler.fetch(request)

const entry = createServerEntry({ fetch })

/**
 * Two details make this typecheck with no cast:
 *
 * 1. The options callback takes no argument. `withSentry` infers `Env` from it,
 *    and `Env` defaults to the `cloudflare:workers` env type, which does not
 *    exist in CI — `worker-configuration.d.ts` is gitignored. A zero-argument
 *    callback is assignable for any `Env`, so nothing needs inferring. The DSN
 *    lives in code, so there is nothing to read from `env` anyway.
 * 2. `fetch` declares one parameter. Cloudflare calls `fetch(request, env, ctx)`
 *    while the Start entry takes `(request, opts)`, and `env` is not assignable
 *    to the all-optional `RequestOptions`. TypeScript never compares parameters
 *    a function does not declare.
 *
 * Nothing changes at runtime. `withSentry` replaces `fetch` with a proxy that
 * reads `(request, env, ctx)` off its own arguments for the options callback and
 * for `ctx.waitUntil(flush)`, then applies the original. Dropping `opts` is
 * safer than passing `env` into it, which is what this file used to do — every
 * `RequestOptions` field was absent, so it was a no-op that would have collided
 * had a binding ever been named `context`.
 */
export default withSentry(() => workerSentryOptions, {
  fetch: (request: Request) => entry.fetch(request),
})
