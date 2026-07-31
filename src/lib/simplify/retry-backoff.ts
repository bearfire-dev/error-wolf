import { OpenRouterRateLimitError } from "@/lib/simplify/openrouter-client"

/** Base delay before the first retry. Doubles per attempt. */
const BASE_BACKOFF_MS = 400

/** Ceiling, so a hostile `Retry-After` cannot park a run for minutes. */
const MAX_BACKOFF_MS = 8_000

function createAbortError(): Error {
  const error = new Error("Request aborted.")
  error.name = "AbortError"
  return error
}

/**
 * Delay before retry `attempt` (1-based). Honors the server's `Retry-After`
 * when it sent one, otherwise exponential with jitter.
 *
 * Jitter matters here: v1 runs three analysis branches in parallel, so an
 * unjittered backoff would retry all three in the same instant and re-trip the
 * same rate limit that caused the failure.
 */
export function backoffDelayMs(
  attempt: number,
  error: unknown,
  random: () => number = Math.random
): number {
  if (
    error instanceof OpenRouterRateLimitError &&
    error.retryAfterMs !== null &&
    error.retryAfterMs > 0
  ) {
    return Math.min(error.retryAfterMs, MAX_BACKOFF_MS)
  }

  const exponential = BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1)
  const jitter = random() * BASE_BACKOFF_MS
  return Math.min(Math.round(exponential + jitter), MAX_BACKOFF_MS)
}

/**
 * Waits `ms`, rejecting immediately if the signal aborts. A plain `setTimeout`
 * would make cancel feel broken: the user presses stop and then waits out the
 * remaining backoff before anything happens.
 */
export function sleepUnlessAborted(
  ms: number,
  signal?: AbortSignal
): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  if (signal?.aborted) return Promise.reject(createAbortError())

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)

    function onAbort() {
      clearTimeout(timer)
      reject(createAbortError())
    }

    signal?.addEventListener("abort", onAbort, { once: true })
  })
}
