import Link from "next/link"

import { Bug01Icon, GithubIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { SiteHeaderAnnouncementsDialog } from "./site-header-announcements-dialog"
import {
  SITE_HEADER_GITHUB_HINT,
  SITE_HEADER_GITHUB_URL,
} from "./site-header-constants"
import { SiteHeaderHistoryDialog } from "./site-header-history-dialog"
import { SiteHeaderThemeToggle } from "./site-header-theme-toggle"
import { SiteHeaderWipeDialog } from "./site-header-wipe-dialog"

type SiteHeaderProps = {
  announcementsLatestMs: number
  announcementsMarkdown: string
}

export function SiteHeader({
  announcementsLatestMs,
  announcementsMarkdown,
}: SiteHeaderProps) {
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
          <SiteHeaderAnnouncementsDialog
            latestPublishedAtMs={announcementsLatestMs}
            markdown={announcementsMarkdown}
          />
          <SiteHeaderHistoryDialog />
          <SiteHeaderWipeDialog />
          <button
            type="button"
            aria-label="Report a bug"
            className={cn(
              buttonVariants({ variant: "outline", size: "icon-sm" })
            )}
          >
            <HugeiconsIcon icon={Bug01Icon} strokeWidth={2} />
          </button>
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
