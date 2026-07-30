export const HUNT_OPENROUTER_DEFAULT_MODEL_ID = "openai/gpt-oss-120b"
export const HUNT_OPENROUTER_DEFAULT_MINI_MODEL_ID =
  HUNT_OPENROUTER_DEFAULT_MODEL_ID
export const HUNT_OPENROUTER_AUTO_MINI_MAX_INPUT_TOKENS = 1500

/**
 * @deprecated Prefer `HUNT_OPENROUTER_DEFAULT_MODEL_ID`.
 * Kept as a compatibility alias while the default router is being introduced.
 */
export const HUNT_OPENROUTER_ROUTING_MODEL_ID = HUNT_OPENROUTER_DEFAULT_MODEL_ID

/** Default total token budget (prompt + completion) for E2E provider picks until you wire real estimates. */
export const HUNT_ROUTING_E2E_TOKEN_ESTIMATE = 2500

/**
 * Fallback hedge trigger when no better latency baseline is available.
 * This keeps the first request deliberate while still reacting quickly
 * enough for interactive traces when no provider baseline is available.
 */
export const HUNT_OPENROUTER_LATENCY_HEDGE_FALLBACK_MS = 1200

/** Interactive ceiling for when the secondary hedge may start. */
export const HUNT_OPENROUTER_LATENCY_HEDGE_MAX_MS = 2200

/**
 * Watchdog budgets for a single streaming request.
 *
 * These are hard cancels, so they sit far above the hedge triggers above. A
 * provider cold start behind a busy queue routinely passes 10 s, so a
 * first-token budget under roughly 20 s cancels healthy requests.
 */
export const HUNT_OPENROUTER_FIRST_TOKEN_TIMEOUT_MS = 30_000

/** Per leg when hedging, where a second leg is already racing. */
export const HUNT_OPENROUTER_HEDGED_FIRST_TOKEN_TIMEOUT_MS = 20_000

/** Silence between chunks that means the provider died mid-stream. */
export const HUNT_OPENROUTER_IDLE_TIMEOUT_MS = 20_000

/** Backstop for a provider that dribbles one token just under the idle budget. */
export const HUNT_OPENROUTER_REQUEST_TIMEOUT_MS = 90_000

/** Wall-clock budget for a whole v1 run: 3 analysis branches plus synthesis. */
export const HUNT_RUN_TIMEOUT_MS = 150_000

/** Wall-clock budget for a whole v1-mini run: a single call. */
export const HUNT_RUN_MINI_TIMEOUT_MS = 90_000

/** Key verification is a single small GET; it should never hang the first screen. */
export const HUNT_OPENROUTER_VERIFY_TIMEOUT_MS = 15_000

/** Provider rankings are advisory, so they get the shortest leash. */
export const HUNT_OPENROUTER_ENDPOINTS_TIMEOUT_MS = 8_000
