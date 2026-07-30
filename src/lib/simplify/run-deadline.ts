import {
  HUNT_RUN_MINI_TIMEOUT_MS,
  HUNT_RUN_TIMEOUT_MS,
} from "@/lib/openrouter/hunt-routing-config"
import type { SimplifyEngineId } from "@/lib/simplify/engines/types"

/** The user pressed cancel. Not a failure — the UI returns to input silently. */
export class HuntRunCancelledError extends Error {
  override readonly name = "HuntRunCancelledError"

  constructor() {
    super("Run cancelled.")
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/** The whole run passed its wall-clock budget. */
export class HuntRunTimeoutError extends Error {
  override readonly name = "HuntRunTimeoutError"
  readonly timeoutMs: number

  constructor(timeoutMs: number) {
    super(`Run exceeded its ${Math.round(timeoutMs / 1000)}s budget.`)
    this.timeoutMs = timeoutMs
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/** v1 fans out three analysis branches then merges; v1-mini is a single call. */
export function runTimeoutMsForEngine(engineId: SimplifyEngineId): number {
  return engineId === "v1-mini" ? HUNT_RUN_MINI_TIMEOUT_MS : HUNT_RUN_TIMEOUT_MS
}

export type RunController = {
  controller: AbortController
  /** Abort because the user asked to stop. */
  cancel: () => void
  /** Clear the deadline timer. Safe to call more than once. */
  dispose: () => void
}

/**
 * An `AbortController` that also trips itself once `timeoutMs` elapses. The
 * abort reason carries which of the two happened, so the caller can tell a
 * deliberate cancel from a blown deadline without extra bookkeeping.
 */
export function createRunController(timeoutMs: number): RunController {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | null = null

  const dispose = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timer = setTimeout(() => {
      timer = null
      if (!controller.signal.aborted) {
        controller.abort(new HuntRunTimeoutError(timeoutMs))
      }
    }, timeoutMs)
  }

  return {
    controller,
    cancel: () => {
      dispose()
      if (!controller.signal.aborted) {
        controller.abort(new HuntRunCancelledError())
      }
    },
    dispose,
  }
}

export type RunFailureKind = "cancelled" | "timeout" | "error"

/**
 * Classifies why a run ended. The abort reason is authoritative: the error that
 * surfaces from a torn-down fetch is often a bare `AbortError` that says nothing
 * about who tore it down.
 */
export function classifyRunFailure(
  error: unknown,
  signal: AbortSignal | undefined
): RunFailureKind {
  const reason: unknown = signal?.aborted ? signal.reason : undefined

  if (
    reason instanceof HuntRunCancelledError ||
    error instanceof HuntRunCancelledError
  ) {
    return "cancelled"
  }
  if (
    reason instanceof HuntRunTimeoutError ||
    error instanceof HuntRunTimeoutError
  ) {
    return "timeout"
  }
  return "error"
}
