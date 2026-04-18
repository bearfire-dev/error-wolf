"use client"

import { useCallback, useState } from "react"

import { Clock04Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  formatChars,
  formatDuration,
  getRecentResults,
  RECENT_HISTORY_MAX_ITEMS,
  type RecentSimplifyResult,
} from "@/lib/recent-results"
import { cn } from "@/lib/utils"

import { SITE_HEADER_HISTORY_HINT } from "./site-header-constants"

export function SiteHeaderHistoryDialog() {
  const [open, setOpen] = useState(false)
  const [recent, setRecent] = useState<RecentSimplifyResult[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const handleOpenChange = useCallback((next: boolean) => {
    if (next) setRecent(getRecentResults())
    setOpen(next)
  }, [])

  const handleCopy = useCallback(async (item: RecentSimplifyResult) => {
    try {
      await navigator.clipboard.writeText(item.output)
      setCopiedId(item.id)
      window.setTimeout(() => setCopiedId(null), 1200)
    } catch {
      // ignore
    }
  }, [])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        type="button"
        className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }))}
        aria-label={`Recent runs. ${SITE_HEADER_HISTORY_HINT}`}
        title={`Recent runs — ${SITE_HEADER_HISTORY_HINT}`}
      >
        <HugeiconsIcon icon={Clock04Icon} strokeWidth={2} />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <span className="text-primary">&gt;&nbsp;</span>history
            <span className="ml-2 text-muted-foreground">
              [{recent.length}/{RECENT_HISTORY_MAX_ITEMS}]
            </span>
          </DialogTitle>
        </DialogHeader>
        {recent.length === 0 ? (
          <p className="font-mono text-xs text-muted-foreground">
            &gt; empty. run a hunt to populate.
          </p>
        ) : (
          <div className="max-h-[min(60vh,24rem)] overflow-y-auto">
            <ul className="flex list-none flex-col gap-2" role="list">
              {recent.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-1.5 border border-foreground/15 p-2.5"
                >
                  <div className="flex items-center justify-between gap-2 font-mono text-[0.625rem] tracking-wider text-muted-foreground uppercase tabular-nums">
                    <span>
                      {new Date(item.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                    <span>
                      {formatDuration(item.durationMs)} &middot;{" "}
                      {formatChars(item.inputChars)}&rarr;
                      {formatChars(item.outputChars)}
                    </span>
                  </div>
                  <p className="font-mono text-xs break-words text-foreground/80 selectable">
                    {item.inputPreview}
                  </p>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => void handleCopy(item)}
                    >
                      {copiedId === item.id ? "[ copied ]" : "[ copy ]"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
