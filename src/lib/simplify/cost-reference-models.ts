/**
 * Published OpenRouter list prices (standard tiers) for baseline cost comparisons.
 * Update when OpenRouter changes pricing; `openRouterModelId` is the catalog slug.
 *
 * Stats “savings vs” lines compare **prompt-only** list price (context you would paste into
 * the reference model). They do **not** include a hypothetical completion from that model.
 */

export type CostReferenceModelId = "opus-4.7" | "gpt-5.4"

/** Baseline comparison shown until the user clicks the model name to persist a choice. */
export const DEFAULT_COST_REFERENCE_MODEL_ID: CostReferenceModelId = "opus-4.7"

/** Order used when cycling the clickable reference label in the stats strip. */
export const COST_REFERENCE_MODEL_CYCLE: readonly CostReferenceModelId[] = [
  "opus-4.7",
  "gpt-5.4",
] as const

export type CostReferenceModel = {
  id: CostReferenceModelId
  /** Short label in the UI (click to cycle). */
  label: string
  openRouterModelId: string
  /** USD per 1M prompt tokens (OpenRouter “standard” tier where tiered). */
  promptUsdPerMillion: number
  /** USD per 1M completion tokens. */
  completionUsdPerMillion: number
}

export const COST_REFERENCE_MODELS: Record<
  CostReferenceModelId,
  CostReferenceModel
> = {
  "opus-4.7": {
    id: "opus-4.7",
    label: "Opus 4.7",
    openRouterModelId: "anthropic/claude-opus-4.7",
    promptUsdPerMillion: 5,
    completionUsdPerMillion: 25,
  },
  "gpt-5.4": {
    id: "gpt-5.4",
    label: "GPT 5.4",
    openRouterModelId: "openai/gpt-5.4",
    /** ≤272K context tier on OpenRouter; adjust if you routinely exceed it. */
    promptUsdPerMillion: 2.5,
    completionUsdPerMillion: 15,
  },
}

const STORAGE_KEY = "error-wolf:cost-reference-model-v1"

export function isCostReferenceModelId(
  value: string
): value is CostReferenceModelId {
  return value === "opus-4.7" || value === "gpt-5.4"
}

export function nextCostReferenceModelId(
  current: CostReferenceModelId
): CostReferenceModelId {
  const idx = COST_REFERENCE_MODEL_CYCLE.indexOf(current)
  const safe = idx >= 0 ? idx : 0
  const next =
    COST_REFERENCE_MODEL_CYCLE[(safe + 1) % COST_REFERENCE_MODEL_CYCLE.length]!
  return next
}

/** Restores a saved choice; `null` means “use default until the user clicks”. */
export function readCostReferenceModelPreference(): CostReferenceModelId | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const id = raw.trim()
    return isCostReferenceModelId(id) ? id : null
  } catch {
    return null
  }
}

/** Persist only after the user explicitly toggles the reference model in the UI. */
export function writeCostReferenceModelPreference(
  id: CostReferenceModelId
): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // ignore quota / private mode
  }
}

export function estimatedUsdForReferenceModel(
  model: CostReferenceModel,
  promptTokens: number,
  completionTokens: number
): number {
  return (
    (promptTokens / 1_000_000) * model.promptUsdPerMillion +
    (completionTokens / 1_000_000) * model.completionUsdPerMillion
  )
}

/** List-price USD for sending `promptTokens` as the user message only (no completion). */
export function referencePromptUsd(
  model: CostReferenceModel,
  promptTokens: number
): number {
  return estimatedUsdForReferenceModel(model, promptTokens, 0)
}
