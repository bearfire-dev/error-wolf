import {
  HUNT_OPENROUTER_FIRST_TOKEN_TIMEOUT_MS,
  HUNT_OPENROUTER_HEDGED_FIRST_TOKEN_TIMEOUT_MS,
  HUNT_OPENROUTER_IDLE_TIMEOUT_MS,
  HUNT_OPENROUTER_REQUEST_TIMEOUT_MS,
} from "@/lib/openrouter/hunt-routing-config"
import type { OpenRouterStreamTimeouts } from "@/lib/simplify/openrouter-client"

/**
 * Watchdog budgets for one streaming request.
 *
 * A hedged leg races a second leg, so it can give up sooner. A solo request has
 * no partner and gets the full budget.
 */
export function streamTimeoutsFor(hedged: boolean): OpenRouterStreamTimeouts {
  return {
    firstTokenMs: hedged
      ? HUNT_OPENROUTER_HEDGED_FIRST_TOKEN_TIMEOUT_MS
      : HUNT_OPENROUTER_FIRST_TOKEN_TIMEOUT_MS,
    idleMs: HUNT_OPENROUTER_IDLE_TIMEOUT_MS,
    totalMs: HUNT_OPENROUTER_REQUEST_TIMEOUT_MS,
  }
}

/** First-token budget for the unhedged retry after a hedged timeout. */
export const SOLO_FIRST_TOKEN_TIMEOUT_MS =
  HUNT_OPENROUTER_FIRST_TOKEN_TIMEOUT_MS
