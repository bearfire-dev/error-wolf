import { StartClient } from "@tanstack/react-start/client"
import { StrictMode, startTransition } from "react"
import { hydrateRoot } from "react-dom/client"

import { initBrowserSentry } from "./integrations/sentry.client"
import { getRouter } from "./router"

// Before hydration, so an error thrown during the first render is captured.
// `router.tsx` cannot do this: it is imported by the server build too, and the
// browser SDK must not reach the Worker bundle.
initBrowserSentry(getRouter())

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>
  )
})
