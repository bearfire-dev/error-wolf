import { useCallback, useMemo, useState } from "react"

import { Clock04Icon, Delete02Icon } from "@hugeicons/core-free-icons"
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
  clearRecentResults,
  formatChars,
  formatUsdCost,
  formatDuration,
  formatTokens,
  getRecentResults,
  RECENT_HISTORY_MAX_ITEMS,
  type RecentSimplifyResult,
} from "@/lib/recent-results"
import { cn } from "@/lib/utils"

import { SITE_HEADER_HISTORY_HINT } from "./site-header-constants"

function sortNewestFirst(rows: RecentSimplifyResult[]): RecentSimplifyResult[] {
  return [...rows].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0
  )
}

export function SiteHeaderHistoryDialog() {
  const [open, setOpen] = useState(false)
  const [recent, setRecent] = useState<RecentSimplifyResult[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const orderedRecent = useMemo(() => sortNewestFirst(recent), [recent])

  const handleOpenChange = useCallback((next: boolean) => {
    if (next) setRecent(sortNewestFirst(getRecentResults()))
    setOpen(next)
  }, [])

  const handleClearHistory = useCallback(() => {
    clearRecentResults()
    setRecent([])
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
      <DialogContent className="flex max-h-[min(90vh,32rem)] flex-col gap-4 overflow-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0 space-y-0 pr-10 sm:flex sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <DialogTitle className="text-left">
            <span className="text-primary">&gt;&nbsp;</span>history
            <span className="ml-2 text-muted-foreground">
              [{recent.length}/{RECENT_HISTORY_MAX_ITEMS}]
            </span>
          </DialogTitle>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="mt-2 shrink-0 sm:mt-0"
            disabled={recent.length === 0}
            onClick={handleClearHistory}
            aria-label="Clear recent run history stored in this browser"
            title="Clear recent runs (this browser only)"
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
          </Button>
        </DialogHeader>
        {recent.length === 0 ? (
          <p className="shrink-0 font-mono text-xs text-muted-foreground">
            &gt; empty. run a hunt to populate.
          </p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <ul className="flex list-none flex-col gap-2" role="list">
              {orderedRecent.map((item) => (
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
                      {(() => {
                        const pasteTok =
                          item.pasteInputTokens ?? item.inputTokens
                        const billedTok = item.compressorPromptTokens
                        const outTok = item.outputTokens
                        if (
                          pasteTok !== undefined &&
                          billedTok !== undefined &&
                          outTok !== undefined
                        ) {
                          const cleanedTok = item.cleanedInputTokens
                          const overhead =
                            cleanedTok !== undefined
                              ? Math.max(0, billedTok - cleanedTok)
                              : Math.max(0, billedTok - pasteTok)
                          return `${formatTokens(pasteTok)}+${formatTokens(overhead)}→${formatTokens(outTok)}`
                        }
                        if (billedTok !== undefined && outTok !== undefined) {
                          return `${formatTokens(billedTok)}→${formatTokens(outTok)}`
                        }
                        if (pasteTok !== undefined && outTok !== undefined) {
                          return `${formatTokens(pasteTok)}→${formatTokens(outTok)}`
                        }
                        return `${formatChars(item.inputChars)}→${formatChars(item.outputChars)}`
                      })()}
                      {item.displayCostUsd !== undefined &&
                        ` · ${formatUsdCost(item.displayCostUsd)}${
                          item.costSource === "estimated"
                            ? " est"
                            : item.costSource === "mixed"
                              ? " mix"
                              : ""
                        }`}
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
