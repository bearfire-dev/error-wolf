"use client"

import * as Sentry from "@sentry/nextjs"
import { useEffect, useState } from "react"

import { CrashReportForm } from "@/components/sentry/crash-report-form"
import { Button } from "@/components/ui/button"
import { clearAll } from "@/lib/wipe"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [eventId, setEventId] = useState<string | undefined>()

  useEffect(() => {
    setEventId(Sentry.captureException(error))
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
      <CrashReportForm errorDigest={error.digest} eventId={eventId} />
    </div>
  )
}
