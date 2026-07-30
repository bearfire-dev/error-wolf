import { Bug01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useRef } from "react"

import { buttonVariants } from "@/components/ui/button"
import { useSentryFeedbackAttach } from "@/hooks/use-sentry-feedback-attach"
import { cn } from "@/lib/utils"

export function SiteHeaderFeedbackButton() {
  const ref = useRef<HTMLButtonElement>(null)
  useSentryFeedbackAttach(ref, true)

  return (
    <button
      ref={ref}
      type="button"
      aria-label="Report a bug"
      className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }))}
    >
      <HugeiconsIcon icon={Bug01Icon} strokeWidth={2} />
    </button>
  )
}
