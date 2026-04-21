"use client"

import * as Sentry from "@sentry/nextjs"
import { useEffect, useState } from "react"

import { CrashReportForm } from "@/components/sentry/crash-report-form"
import { Button } from "@/components/ui/button"

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
        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="button" onClick={() => reset()}>
            Try again
          </Button>
        </div>
      </div>
      <CrashReportForm errorDigest={error.digest} eventId={eventId} />
    </div>
  )
}
