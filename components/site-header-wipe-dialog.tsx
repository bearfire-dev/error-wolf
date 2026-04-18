"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"

import { Delete02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { clearAll } from "@/lib/wipe"

import { SITE_HEADER_WIPE_HINT } from "./site-header-constants"

export function SiteHeaderWipeDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const performWipe = useCallback(() => {
    clearAll()
    setOpen(false)
    router.replace("/")
    router.refresh()
  }, [router])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={() => setOpen(true)}
        aria-label={`Clear saved data. ${SITE_HEADER_WIPE_HINT}`}
        title={`Clear saved data — ${SITE_HEADER_WIPE_HINT}`}
      >
        <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <span className="text-primary">&gt;&nbsp;</span>delete all data
          </DialogTitle>
          <DialogDescription>
            Key, consent, and recent runs will be cleared from this browser.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            cancel
          </Button>
          <Button type="button" variant="destructive" onClick={performWipe}>
            [ delete ]
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
