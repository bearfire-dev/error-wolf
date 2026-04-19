"use client"

import * as Sentry from "@sentry/nextjs"
import { Space_Mono } from "next/font/google"
import { useEffect, useState } from "react"

import "./globals.css"
import { CrashReportForm } from "@/components/sentry/crash-report-form"
import { ThemeProvider } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
})

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  const [eventId, setEventId] = useState<string | undefined>()

  useEffect(() => {
    setEventId(Sentry.captureException(error))
  }, [error])

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", spaceMono.variable)}
    >
      <body className="min-h-svh bg-background text-foreground">
        <ThemeProvider>
          <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-16">
            <div className="space-y-2">
              <h1 className="font-mono text-sm tracking-wider text-foreground uppercase">
                Something broke
              </h1>
              <p className="font-mono text-xs text-muted-foreground">
                {error.message || "Unexpected error"}
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  type="button"
                  onClick={() => {
                    window.location.reload()
                  }}
                >
                  Reload
                </Button>
              </div>
            </div>
            <CrashReportForm errorDigest={error.digest} eventId={eventId} />
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
