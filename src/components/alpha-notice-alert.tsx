"use client"

import { useCallback, useEffect, useState } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Alert02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "@/lib/utils"

const STORAGE_KEY = "error-wolf:alpha-notice-dismissed-v1"

export function AlphaNoticeAlert() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    queueMicrotask(() => {
      try {
        if (window.localStorage.getItem(STORAGE_KEY) !== "1") {
          setOpen(true)
        }
      } catch {
        setOpen(true)
      }
    })
  }, [])

  const acknowledge = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1")
    } catch {
      // quota / private mode
    }
    setOpen(false)
  }, [])

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent
        className={cn(
          "!max-w-[calc(100%-2rem)] gap-4 rounded-[2px] border border-foreground/25 bg-popover p-4 font-mono text-xs/relaxed text-popover-foreground sm:!max-w-md"
        )}
      >
        <AlertDialogHeader className="block space-y-0 text-left">
          <div className="flex gap-3">
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-[2px] bg-muted"
              aria-hidden
            >
              <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
            </div>
            <div className="min-w-0 space-y-2">
              <AlertDialogTitle className="font-mono text-xs font-normal tracking-wider text-foreground uppercase">
                Alpha release
              </AlertDialogTitle>
              <AlertDialogDescription>
                error-wolf is an early build. Expect bugs, rough edges, and
                occasional reliability issues. If something breaks, try again or
                refresh — and consider reporting feedback from the header.
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-end">
          <AlertDialogAction type="button" onClick={acknowledge}>
            I understand
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
