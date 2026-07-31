import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"

import { ErrorWolfMark } from "@/components/error-wolf-mark"
import { Button } from "@/components/ui/button"
import { acceptConsentAndStart } from "@/lib/server/consent"
import { getSiteUrl } from "@/lib/site-url"

export const Route = createFileRoute("/")({
  head: () => ({
    links: [{ rel: "canonical", href: new URL("/", getSiteUrl()).href }],
  }),
  component: HomePage,
})

function HomePage() {
  const router = useRouter()
  const [starting, setStarting] = useState(false)

  /** Set the consent cookie on the server, then go to /hunt. The order
   * matters: the /hunt loader reads the cookie back on the server. */
  async function startHunt() {
    setStarting(true)
    try {
      await acceptConsentAndStart()
      await router.navigate({ to: "/hunt" })
    } catch (error) {
      console.error("[home] could not store consent", error)
      setStarting(false)
    }
  }

  return (
    <div className="py-16 sm:py-24">
      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        <div className="mx-auto w-full max-w-xl">
          <div className="flex flex-col gap-6 border border-foreground/15 bg-card p-6 sm:p-8 dark:bg-card/40">
            <h1 className="flex flex-wrap items-center gap-3 font-mono text-3xl font-normal tracking-tight text-foreground sm:text-4xl">
              <ErrorWolfMark className="size-10 sm:size-12" />
              <span className="inline-flex items-center gap-0 whitespace-nowrap normal-case">
                <span>error-wolf</span>
                <span
                  className="ml-0.5 inline-block h-8 w-2 shrink-0 blink bg-primary align-[-0.15em] sm:h-9 sm:w-2.5"
                  aria-hidden
                />
              </span>
            </h1>

            <p className="font-mono text-sm text-muted-foreground">
              fast compression of noisy error stacks
            </p>
            <p className="font-mono text-sm text-muted-foreground">
              spend tokens on fixing errors{" "}
              <span className="underline">not</span> reading traces
            </p>
            <p className="font-mono text-sm text-muted-foreground">
              requires OpenRouter key
            </p>

            <div className="pt-2">
              {/* The Next server action worked without JavaScript. A TanStack
                  server function does not, but the product runs the whole
                  simplify pipeline in the browser, so JavaScript is required
                  either way. The cookie contract is unchanged. */}
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void startHunt()
                }}
              >
                <Button type="submit" size="lg" disabled={starting}>
                  [ initialize ]
                </Button>
              </form>
            </div>

            <div className="pt-4 font-mono text-sm text-muted-foreground">
              <Link
                to="/privacy"
                className="underline-offset-2 hover:text-foreground hover:underline"
              >
                privacy
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
