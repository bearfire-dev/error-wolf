import {
  breadcrumbsIntegration,
  init,
  tanstackRouterBrowserTracingIntegration,
} from "@sentry/react"

import { browserSentryOptions } from "@/lib/sentry/options"

/**
 * The only module that imports `@sentry/react` at runtime. `src/router.tsx`
 * calls it behind `if (!import.meta.env.SSR)`, which — together with the
 * package's `sideEffects: false` — keeps the browser SDK out of the Worker
 * bundle entirely.
 *
 * `router` is typed `unknown` rather than the concrete router type so this
 * module does not have to import the route tree.
 */
export function initBrowserSentry(router: unknown): void {
  init({
    ...browserSentryOptions,
    integrations: (defaults) => [
      ...defaults.filter(
        (integration) =>
          // Replaced below with console capture off.
          integration.name !== "Breadcrumbs" &&
          // Locale and timezone are fingerprinting surface.
          integration.name !== "CultureContext"
      ),
      tanstackRouterBrowserTracingIntegration(router, { enableInp: true }),
      /**
       * Console breadcrumbs are the biggest leak vector in this app: the
       * OpenRouter client logs malformed stream frames, which are raw model
       * output. DOM breadcrumbs stay on — they record CSS selectors, not text.
       */
      breadcrumbsIntegration({ console: false }),
    ],
  })
}
