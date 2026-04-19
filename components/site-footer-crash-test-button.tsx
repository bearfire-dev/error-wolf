"use client"

import { useState } from "react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Dev-only: throw during render to exercise `global-error` + crash report form.
 */
export function SiteFooterCrashTestButton() {
  const [shouldCrash, setShouldCrash] = useState(false)

  if (shouldCrash) {
    throw new Error("Deliberate test crash (footer dev button)")
  }

  if (process.env.NODE_ENV !== "development") {
    return null
  }

  return (
    <button
      type="button"
      className={cn(
        buttonVariants({ variant: "outline", size: "xs" }),
        "pointer-events-auto text-destructive hover:text-background"
      )}
      onClick={() => setShouldCrash(true)}
    >
      Crash (test)
    </button>
  )
}
