import { StartClient } from "@tanstack/react-start/client"
import { StrictMode, startTransition } from "react"
import { hydrateRoot } from "react-dom/client"

import { initBrowserPostHog } from "./integrations/posthog.client"

// Before hydration, so `capture_exceptions` is armed for an error thrown during
// the first render. `router.tsx` cannot do this: the server build imports it,
// and posthog-js must not reach the Worker bundle.
initBrowserPostHog()

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>
  )
})
