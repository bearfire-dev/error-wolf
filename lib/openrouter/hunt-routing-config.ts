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
