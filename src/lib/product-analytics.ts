import posthog from "posthog-js"

import {
  ProductEvent,
  userRunDownvoteProperties,
  userRunProperties,
  userSetupProperties,
  type UserRunDownvoteInput,
  type UserRunInput,
} from "@/lib/product-events"

/**
 * Browser-side product events. Replaces the Sentry counters.
 *
 * `posthog.capture` is a no-op until `posthog.init` runs in `src/client.tsx`,
 * and init is skipped when no token is set, so these are safe to call
 * unconditionally.
 *
 * Every event is anonymous. Nothing here calls `posthog.identify`.
 */

/** Hunt 01 KEY: OpenRouter key verified and saved. */
export function captureUserSetup(): void {
  posthog.capture(ProductEvent.UserSetup, userSetupProperties())
}

/** Hunt 04 OUTPUT: user copied simplified output. */
export function captureUserRun(input: UserRunInput): void {
  posthog.capture(ProductEvent.UserRun, userRunProperties(input))
}

/** Hunt 04 OUTPUT: user downvoted simplified output (not tied to copy). */
export function captureUserRunDownvote(input: UserRunDownvoteInput): void {
  posthog.capture(
    ProductEvent.UserRunDownvote,
    userRunDownvoteProperties(input)
  )
}

/** Report a caught error that did not reach the global handler. */
export function captureBrowserException(error: unknown): void {
  posthog.captureException(error)
}
