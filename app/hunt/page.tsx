import type { Metadata } from "next"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { Suspense } from "react"

import { loadStackTraceExamples } from "@/lib/example-traces"
import {
  hasConsentFromCookieStore,
  hasOpenRouterKeyFromCookieStore,
} from "@/lib/hunt-server-hints"

import { HuntClient } from "./hunt-client"

export const metadata: Metadata = {
  title: "Simplify",
  description:
    "Paste stack traces or build logs, normalize and compress them with OpenRouter in your browser, then copy a compact result for larger models.",
  alternates: {
    canonical: "/hunt",
  },
}

/** Matches the hunt shell so Cache Components + `cookies()` Suspense does not collapse layout. */
function HuntPageSuspenseFallback() {
  return (
    <div className="flex flex-col gap-6" aria-busy aria-live="polite">
      <div className="h-7 w-full max-w-md animate-pulse rounded-sm bg-muted/50" />
      <div className="relative aspect-[5/7] w-full border border-foreground/15 bg-card/40 dark:bg-card/25" />
    </div>
  )
}

async function HuntPageWithCookies() {
  const jar = await cookies()
  if (!hasConsentFromCookieStore(jar)) {
    redirect("/")
  }

  const stackTraceExamples = loadStackTraceExamples()
  const initialHasOpenRouterKey = hasOpenRouterKeyFromCookieStore(jar)

  return (
    <HuntClient
      stackTraceExamples={stackTraceExamples}
      initialHasOpenRouterKey={initialHasOpenRouterKey}
    />
  )
}

export default function HuntPage() {
  return (
    <div className="pt-6 pb-16 sm:pt-8 sm:pb-24">
      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
          <Suspense fallback={<HuntPageSuspenseFallback />}>
            <HuntPageWithCookies />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
