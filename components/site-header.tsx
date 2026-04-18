import Link from "next/link"

import { GithubIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import {
  SITE_HEADER_GITHUB_HINT,
  SITE_HEADER_GITHUB_URL,
} from "./site-header-constants"
import { SiteHeaderHistoryDialog } from "./site-header-history-dialog"
import { SiteHeaderThemeToggle } from "./site-header-theme-toggle"
import { SiteHeaderWipeDialog } from "./site-header-wipe-dialog"

export function SiteHeader() {
  return (
    <header
      className="border-b border-foreground/15 bg-background"
      style={{ viewTransitionName: "site-header" }}
    >
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center font-mono text-xs tracking-wider"
          aria-label="error-wolf home"
        >
          <span className="whitespace-nowrap text-foreground normal-case">
            error-wolf
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <SiteHeaderHistoryDialog />
          <SiteHeaderWipeDialog />
          <a
            href={SITE_HEADER_GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            aria-label={`GitHub. ${SITE_HEADER_GITHUB_HINT}`}
            title={`GitHub — ${SITE_HEADER_GITHUB_HINT}`}
            className={cn(
              buttonVariants({ variant: "outline", size: "icon-sm" })
            )}
          >
            <HugeiconsIcon icon={GithubIcon} strokeWidth={2} />
          </a>
          <SiteHeaderThemeToggle />
        </div>
      </div>
    </header>
  )
}
