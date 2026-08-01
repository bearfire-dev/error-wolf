import { captureException } from "@sentry/core"
import { createRouter as createTanStackRouter } from "@tanstack/react-router"

import { initBrowserSentry } from "@/lib/sentry/browser"

import { routeTree } from "./routeTree.gen"

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    // Browser view transitions reject overlapping updates with an unhandled
    // InvalidStateError. Route changes remain ordinary React transitions.
    defaultViewTransition: false,
    // Fires from the router's CatchBoundary `componentDidCatch`, which is what
    // renders `AppError`. `captureException` comes from `@sentry/core` rather
    // than `@sentry/react` so this import does not pull the browser SDK into
    // the Worker bundle.
    defaultOnCatch: (error, errorInfo) => {
      captureException(error, {
        mechanism: { type: "tanstack-router", handled: true },
        // Scope data has to travel under `captureContext`: the hint type
        // rejects a mix of `EventHint` and scope fields at the top level.
        captureContext: {
          contexts: { react: { componentStack: errorInfo.componentStack } },
        },
      })
    },
  })

  // Sentry initializes here rather than in `client.tsx` because the TanStack
  // router integration needs the instance. `@sentry/react` is `sideEffects:
  // false` and `import.meta.env.SSR` is a build-time literal, so the Worker
  // build drops the browser SDK entirely.
  if (!import.meta.env.SSR) initBrowserSentry(router)

  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
