import Link from "next/link"

import { acceptConsentAndStart } from "@/app/actions/consent"
import { ErrorWolfMark } from "@/components/error-wolf-mark"
import { Button } from "@/components/ui/button"

export default function Page() {
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
              collapse noisy error stacks. save tokens.
            </p>

            <div className="pt-2">
              <form action={acceptConsentAndStart}>
                <Button type="submit" size="lg">
                  [ initialize ]
                </Button>
              </form>
            </div>

            <div className="pt-4 font-mono text-sm text-muted-foreground">
              <Link
                href="/privacy"
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
