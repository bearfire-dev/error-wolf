import { createFileRoute, redirect } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"

import { loadStackTraceExamples } from "@/lib/example-traces"
import {
  hasConsentFromRequest,
  hasOpenRouterKeyFromRequest,
} from "@/lib/server/hunt-hints"
import { getSiteUrl } from "@/lib/site-url"

import { HuntClient } from "./-hunt/hunt-client"

const huntDescription =
  "Paste stack traces or build logs, normalize and compress them with OpenRouter in your browser, then copy a compact result for larger models."

/**
 * Replaces the `cookies()` read in `app/hunt/page.tsx`. It must run on the
 * server on every entry to /hunt, including a client-side navigation, so it is
 * a server function and not a plain loader body.
 *
 * `hasConsentFromRequest` still honours `LEGACY_CONSENT_COOKIE_NAME`, and the
 * key check still honours `better_errors_openrouter_key`. Dropping either would
 * sign existing users out of their consent.
 */
const getHuntGate = createServerFn({ method: "GET" }).handler(async () => {
  if (!hasConsentFromRequest()) {
    throw redirect({ to: "/" })
  }

  return { initialHasOpenRouterKey: hasOpenRouterKeyFromRequest() }
})

export const Route = createFileRoute("/hunt")({
  head: () => ({
    meta: [
      { title: "Simplify · error-wolf" },
      { name: "description", content: huntDescription },
    ],
    links: [{ rel: "canonical", href: new URL("/hunt", getSiteUrl()).href }],
  }),
  loader: () => getHuntGate(),
  component: HuntPage,
})

/**
 * The old `<Suspense>` boundary and its `HuntPageSuspenseFallback` existed only
 * because Cache Components turned `cookies()` into a suspending call inside a
 * prerendered shell. The router now awaits the loader before it renders, and
 * the loader is a synchronous cookie read, so the fallback would never paint.
 * It is gone.
 */
function HuntPage() {
  const { initialHasOpenRouterKey } = Route.useLoaderData()
  const stackTraceExamples = loadStackTraceExamples()

  return (
    <div className="pt-6 pb-16 sm:pt-8 sm:pb-24">
      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
          <HuntClient
            stackTraceExamples={stackTraceExamples}
            initialHasOpenRouterKey={initialHasOpenRouterKey}
          />
        </div>
      </div>
    </div>
  )
}
