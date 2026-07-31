import handler, { createServerEntry } from "@tanstack/react-start/server-entry"
import type { ServerEntry } from "@tanstack/react-start/server-entry"

/**
 * Worker entry. It only forwards to the TanStack Start handler.
 *
 * `wrangler.jsonc` points `main` here rather than straight at
 * `@tanstack/react-start/server-entry`, so there is one place to wrap the
 * handler when the app needs request middleware or error reporting.
 */
const fetch: ServerEntry["fetch"] = (request, opts) =>
  handler.fetch(request, opts)

export default createServerEntry({ fetch })
