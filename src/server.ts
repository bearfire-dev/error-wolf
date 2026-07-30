import * as Sentry from "@sentry/cloudflare"
import handler, { createServerEntry } from "@tanstack/react-start/server-entry"
import type { ServerEntry } from "@tanstack/react-start/server-entry"

import { getSentryDsn, getSentryInitEnvironment } from "@/lib/sentry-dsn"

/**
 * Worker bindings this entry reads. Both are optional: with no DSN, Sentry is
 * off and the app still serves. They override the build-time `VITE_*` values,
 * which lets a deployed Worker point at a different Sentry project without a
 * rebuild.
 */
type RuntimeEnv = {
  SENTRY_DSN?: string
  SENTRY_ENVIRONMENT?: string
}

const fetch: ServerEntry["fetch"] = (...args) => handler.fetch(...args)

const serverEntry = createServerEntry({ fetch })

export default Sentry.withSentry((env: RuntimeEnv) => {
  const dsn = env.SENTRY_DSN?.trim() || getSentryDsn()

  if (!dsn) {
    return undefined
  }

  return {
    dsn,
    environment: env.SENTRY_ENVIRONMENT?.trim() || getSentryInitEnvironment(),
    tracesSampleRate: 1,
    enableLogs: true,
    // Anonymous mode: do not send cookies, IP, or other default PII.
    sendDefaultPii: false,
  }
}, serverEntry)
