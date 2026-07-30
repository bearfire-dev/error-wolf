/**
 * Project DSN for `Sentry.init`: an HTTPS ingest URL from Sentry (Client Keys), not a CLI token.
 * Unset disables Sentry. Vite inlines `VITE_*` into both the browser bundle and
 * the Worker bundle at build time, so one variable serves both sides. A DSN is
 * public by design — it is not a secret.
 */
export function getSentryDsn(): string | undefined {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim()
  return dsn || undefined
}

/**
 * Environment name in Sentry (Issues filter). Use your own value when forking so events
 * stay out of the original maintainer project unless you share a DSN.
 * Falls back to the Vite mode (`development` or `production`).
 */
export function getSentryInitEnvironment(): string {
  return (
    import.meta.env.VITE_SENTRY_ENVIRONMENT?.trim() ||
    import.meta.env.MODE ||
    "development"
  )
}
