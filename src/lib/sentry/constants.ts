/**
 * Sentry identifiers. No imports and no `import.meta` on purpose: `vite.config.ts`
 * reads this file at config-load time, so the org and the project have one home.
 */

/**
 * Public by design. A DSN only grants permission to send events, so it ships in
 * the browser bundle either way and there is nothing to protect. The one real
 * secret is `SENTRY_AUTH_TOKEN`, which is build-time only.
 */
export const SENTRY_DSN =
  "https://5acd315994aa7dbf371fc6690440205e@o4510046563663872.ingest.us.sentry.io/4511827764445184"

export const SENTRY_ORG = "bearfire"

export const SENTRY_PROJECT = "error-wolf"

/**
 * Path of the first-party envelope proxy. The browser posts here instead of
 * posting to Sentry, and the Worker forwards it. The name is opaque on purpose:
 * an ad blocker matches on "sentry". Changing it breaks reporting for every
 * browser still running an older bundle.
 */
export const SENTRY_TUNNEL_PATH = "/wdyd"
