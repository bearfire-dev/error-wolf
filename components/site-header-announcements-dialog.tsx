"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useState } from "react"

import { BubbleChatNotificationIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { Components } from "react-markdown"

import { buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  ANNOUNCEMENTS_STATE_EVENT,
  computeAnnouncementsUnread,
  ensureAnnouncementsTimestampsIfKeyPresent,
  markAnnouncementsViewedNow,
} from "@/lib/announcements-state"
import { getOpenRouterKeyFromCookie } from "@/lib/openrouter-key-cookie"
import { cn } from "@/lib/utils"

import { SITE_HEADER_UPDATES_HINT } from "./site-header-constants"

const loadReactMarkdown = () => import("react-markdown")

function AnnouncementsMarkdownLoading() {
  return (
    <div className="flex flex-col gap-3 py-1" role="status" aria-live="polite">
      <p className="font-mono text-[0.65rem] tracking-wider text-muted-foreground uppercase">
        Loading…
      </p>
      <span className="sr-only">Loading updates.</span>
      <div className="space-y-2.5" aria-hidden>
        <div className="h-3 w-[72%] animate-pulse rounded-sm bg-muted/55" />
        <div className="h-3 w-full animate-pulse rounded-sm bg-muted/45" />
        <div className="h-3 w-[88%] animate-pulse rounded-sm bg-muted/45" />
        <div className="h-3 w-[64%] animate-pulse rounded-sm bg-muted/45" />
        <div className="h-3 w-full animate-pulse rounded-sm bg-muted/40" />
        <div className="h-3 w-[76%] animate-pulse rounded-sm bg-muted/40" />
        <div className="h-3 w-[56%] animate-pulse rounded-sm bg-muted/35" />
      </div>
    </div>
  )
}

const LazyReactMarkdown = dynamic(loadReactMarkdown, {
  ssr: false,
  loading: () => <AnnouncementsMarkdownLoading />,
})

const ANNOUNCEMENTS_MARKDOWN_COMPONENTS: Components = {
  p: ({ children }) => (
    <p className="my-3 text-xs/relaxed text-foreground first:mt-0 last:mb-0">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="my-3 list-disc space-y-2 pl-5 text-xs/relaxed text-foreground marker:text-muted-foreground">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 list-decimal space-y-2 pl-5 text-xs/relaxed text-foreground marker:text-muted-foreground">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      className="break-words text-primary underline underline-offset-4 hover:text-foreground"
      rel="noreferrer"
      target="_blank"
    >
      {children}
    </a>
  ),
  pre: ({ children }) => (
    <pre className="my-3 max-w-full overflow-x-hidden rounded bg-foreground/10 p-3 font-mono text-[0.7rem] break-all whitespace-pre-wrap text-foreground [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  h1: ({ children }) => (
    <h2 className="mt-6 mb-2 font-mono text-[0.7rem] font-normal tracking-wider text-foreground uppercase first:mt-0">
      {children}
    </h2>
  ),
  h2: ({ children }) => (
    <h2 className="mt-6 mb-2 font-mono text-[0.7rem] font-normal tracking-wider text-foreground uppercase first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-5 mb-1.5 font-mono text-[0.65rem] font-normal tracking-wider text-muted-foreground uppercase">
      {children}
    </h3>
  ),
  code: ({ className, children }) => {
    const isBlock = /\blanguage-/.test(String(className ?? ""))
    if (isBlock) {
      return (
        <code
          className={cn(
            "block w-full min-w-0 bg-transparent p-0 font-mono text-[0.7rem] break-all text-inherit",
            className
          )}
        >
          {children}
        </code>
      )
    }
    return (
      <code className="rounded bg-foreground/10 px-1 py-px text-[0.7rem] break-words">
        {children}
      </code>
    )
  },
}

type SiteHeaderAnnouncementsDialogProps = {
  latestPublishedAtMs: number
  markdown: string
}

export function SiteHeaderAnnouncementsDialog({
  latestPublishedAtMs,
  markdown,
}: SiteHeaderAnnouncementsDialogProps) {
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(false)

  const refreshUnread = useCallback(() => {
    const hasKey = getOpenRouterKeyFromCookie().trim() !== ""
    ensureAnnouncementsTimestampsIfKeyPresent(hasKey)
    setUnread(
      computeAnnouncementsUnread({
        hasOpenRouterKey: hasKey,
        latestAnnouncementMs: latestPublishedAtMs,
      })
    )
  }, [latestPublishedAtMs])

  useEffect(() => {
    queueMicrotask(() => {
      refreshUnread()
    })
  }, [refreshUnread])

  useEffect(() => {
    const onState = () => {
      queueMicrotask(() => refreshUnread())
    }
    window.addEventListener(ANNOUNCEMENTS_STATE_EVENT, onState)
    return () => window.removeEventListener(ANNOUNCEMENTS_STATE_EVENT, onState)
  }, [refreshUnread])

  const handleOpenChange = useCallback((next: boolean) => {
    if (next) {
      markAnnouncementsViewedNow()
    }
    setOpen(next)
  }, [])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        type="button"
        className={cn(
          "relative overflow-visible",
          buttonVariants({ variant: "outline", size: "icon-sm" })
        )}
        aria-label={`Updates. ${SITE_HEADER_UPDATES_HINT}`}
        title={`Updates — ${SITE_HEADER_UPDATES_HINT}`}
        onPointerEnter={() => {
          if (markdown.trim()) void loadReactMarkdown()
        }}
      >
        <HugeiconsIcon icon={BubbleChatNotificationIcon} strokeWidth={2} />
        {unread ? (
          <span
            className="pointer-events-none absolute top-0.5 right-0.5 z-10 size-2 rounded-full bg-emerald-500 ring-2 ring-background"
            aria-hidden
          />
        ) : null}
      </DialogTrigger>
      <DialogContent
        showCloseButton
        className={cn(
          "flex h-[min(90vh,32rem)] min-w-0 flex-col gap-4 overflow-x-hidden overflow-y-hidden sm:max-w-lg sm:min-w-lg"
        )}
      >
        <DialogHeader className="shrink-0 space-y-0 border-b border-foreground/15 pr-10 pb-3">
          <DialogTitle className="text-left">
            <span className="text-primary">&gt;&nbsp;</span>updates
          </DialogTitle>
          <DialogDescription className="sr-only">
            Product updates for error-wolf.
          </DialogDescription>
        </DialogHeader>
        <div
          className="min-h-0 max-w-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto text-pretty break-words"
          data-slot="updates-markdown"
        >
          {markdown.trim() ? (
            open ? (
              <LazyReactMarkdown components={ANNOUNCEMENTS_MARKDOWN_COMPONENTS}>
                {markdown}
              </LazyReactMarkdown>
            ) : null
          ) : (
            <p className="text-xs text-muted-foreground">No updates yet.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
