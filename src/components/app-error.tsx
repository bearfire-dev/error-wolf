import { useEffect } from "react"

import { Button } from "@/components/ui/button"
import { captureBrowserException } from "@/lib/product-analytics"
import { clearAll } from "@/lib/wipe"

/**
 * One boundary replaces `app/error.tsx` and `app/global-error.tsx`. TanStack
 * renders `errorComponent` inside the root `shellComponent`, so the document
 * shell, the theme, and the font are already in place — the second copy that
 * `global-error.tsx` had to carry is not needed.
 */
export function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // React swallows the error here, so `capture_exceptions` never sees it. The
  // boundary has to report it. PostHog returns no event id, unlike Sentry.
  useEffect(() => {
    captureBrowserException(error)
  }, [error])

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-16">
      <div className="space-y-2">
        <h1 className="font-mono text-sm tracking-wider text-foreground uppercase">
          Something broke
        </h1>
        <p className="font-mono text-xs text-muted-foreground">
          {error.message || "Unexpected error"}
        </p>
        {/*
          `reset()` only re-renders the same subtree with the same state, so a
          deterministic crash — a corrupt history row, a bad provider payload —
          loops straight back here. Reload clears in-memory state; clearing
          saved data is the last resort when the stored data is the cause.
        */}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="button" onClick={() => reset()}>
            Try again
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => window.location.reload()}
          >
            Reload
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              clearAll()
              window.location.href = "/"
            }}
          >
            Clear saved data
          </Button>
        </div>
        <p className="font-mono text-[0.6875rem] text-muted-foreground">
          Clearing removes your key, consent, and recent runs from this browser.
        </p>
      </div>
    </div>
  )
}
