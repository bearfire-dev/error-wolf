import type { Metadata } from "next"

import { loadStackTraceExamples } from "@/lib/example-traces"

import { HuntClient } from "./hunt-client"

export const metadata: Metadata = {
  title: "Simplify",
  description:
    "Paste stack traces or build logs, normalize and compress them with OpenRouter in your browser, then copy a compact result for larger models.",
  alternates: {
    canonical: "/hunt",
  },
}

export default function HuntPage() {
  const stackTraceExamples = loadStackTraceExamples()

  return (
    <div className="pt-6 pb-16 sm:pt-8 sm:pb-24">
      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
          <HuntClient stackTraceExamples={stackTraceExamples} />
        </div>
      </div>
    </div>
  )
}
