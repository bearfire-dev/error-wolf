/**
 * Project DSN for `Sentry.init`: an HTTPS ingest URL from Sentry (Client Keys), not a CLI token.
 * Unset disables Sentry. In the browser use `NEXT_PUBLIC_SENTRY_DSN` — `SENTRY_DSN` alone is not inlined client-side.
 */
export function getSentryDsn(): string | undefined {
  const dsn =
    process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || process.env.SENTRY_DSN?.trim()
  return dsn || undefined
}

/**
 * Environment name in Sentry (Issues filter). Use your own value when forking so events
 * stay out of the original maintainer project unless you share a DSN.
 * Falls back to Vercel or Node environment.
 */
export function getSentryInitEnvironment(): string {
  return (
    process.env.SENTRY_ENVIRONMENT?.trim() ||
    process.env.VERCEL_ENV?.trim() ||
    process.env.NODE_ENV ||
    "development"
  )
}
