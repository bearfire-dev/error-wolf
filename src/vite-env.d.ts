/// <reference types="vite/client" />
/// <reference types="vite-imagetools/client" />

interface ImportMetaEnv {
  /** Canonical site origin, e.g. `https://errorwolf.dev`. Optional in development. */
  readonly VITE_SITE_URL?: string
  /** Sentry HTTPS Client Keys DSN. Unset disables Sentry. */
  readonly VITE_SENTRY_DSN?: string
  /** Environment tag in Sentry. Falls back to the Vite mode. */
  readonly VITE_SENTRY_ENVIRONMENT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
