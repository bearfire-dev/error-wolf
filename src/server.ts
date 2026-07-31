import handler, { createServerEntry } from "@tanstack/react-start/server-entry"
import { env } from "cloudflare:workers"
import type { ServerEntry } from "@tanstack/react-start/server-entry"

// Relative, not `@/`: the Cloudflare plugin loads this entry through its own
// module runner, which does not apply the tsconfig path alias.
import { captureServerException, type PostHogEnv } from "./lib/server/posthog"

/**
 * Worker entry. This replaces the `Sentry.withSentry` wrapper. PostHog ships no
 * equivalent handler wrapper for Cloudflare, so the entry catches, reports, and
 * rethrows on its own.
 *
 * The Start `fetch` signature is `(request, opts)` and carries no Worker
 * bindings, so the `vars` from wrangler.jsonc come from `cloudflare:workers`.
 *
 * The report is awaited before the error propagates. A Worker can be torn down
 * before an un-awaited flush completes, which loses the exception.
 */
const fetch: ServerEntry["fetch"] = async (request, opts) => {
  try {
    return await handler.fetch(request, opts)
  } catch (error) {
    await captureServerException(env as PostHogEnv, error, request)
    throw error
  }
}

export default createServerEntry({ fetch })
