import { getFeedback } from "@sentry/react"
import { useLayoutEffect, type RefObject } from "react"

/**
 * Attaches Sentry User Feedback (`feedbackIntegration`) to a DOM node (e.g. button).
 * Retries briefly if the client is not ready yet — needed right after hydration.
 */
export function useSentryFeedbackAttach(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean
) {
  useLayoutEffect(() => {
    if (!enabled) return
    const el = ref.current
    if (!el) return

    let detach: (() => void) | undefined
    let cancelled = false
    let attempts = 0
    const maxAttempts = 40

    const tryAttach = () => {
      if (cancelled) return
      const fb = getFeedback()
      if (fb) {
        detach = fb.attachTo(el)
        return
      }
      attempts++
      if (attempts < maxAttempts) {
        window.setTimeout(tryAttach, 50)
      } else if (import.meta.env.DEV) {
        console.warn(
          "[error-wolf] User Feedback unavailable: set VITE_SENTRY_DSN to the HTTPS Client Keys URL (.env.example) and restart."
        )
      }
    }

    tryAttach()

    return () => {
      cancelled = true
      detach?.()
    }
  }, [enabled, ref])
}
