/**
 * Product event names and property shapes. Framework-free and SDK-free, so the
 * browser path (`src/lib/product-analytics.ts`) and the Worker path
 * (`src/lib/server/posthog.ts`) build the same payload.
 *
 * These replace the Sentry counters in the old `sentry-product-metrics.ts`.
 * Sentry counted them as metrics. PostHog has no metric primitive, so each one
 * is a regular event. Names are snake_case to match PostHog convention.
 */

export const ProductEvent = {
  UserInitialize: "user_initialize",
  UserSetup: "user_setup",
  UserRun: "user_run",
  UserRunDownvote: "user_run_downvote",
} as const

export type ProductEventName = (typeof ProductEvent)[keyof typeof ProductEvent]

/** Property keys, kept identical to the Sentry attribute names. */
const Prop = {
  OccurredAt: "occurred_at",
  ModelDisplay: "model_display",
  Feedback: "feedback",
  EstimatedCostUsd: "estimated_cost_usd",
} as const

export type ProductEventProperties = Record<string, string | number>

function nowIso(): string {
  return new Date().toISOString()
}

function feedbackValue(vote: "up" | "down" | null): "up" | "down" | "none" {
  if (vote === "up" || vote === "down") return vote
  return "none"
}

export type UserRunInput = {
  modelDisplay: string
  /** Thumbs state at the moment the user copied (null = no vote yet). */
  feedbackAtCopy: "up" | "down" | null
  /** OpenRouter estimated cost for this run only; omit when unknown. */
  estimatedCostUsd?: number
}

export type UserRunDownvoteInput = {
  modelDisplay: string
  /** OpenRouter estimated cost for this run only; omit when unknown. */
  estimatedCostUsd?: number
}

export function userInitializeProperties(): ProductEventProperties {
  return { [Prop.OccurredAt]: nowIso() }
}

export function userSetupProperties(): ProductEventProperties {
  return { [Prop.OccurredAt]: nowIso() }
}

export function userRunProperties(input: UserRunInput): ProductEventProperties {
  const properties: ProductEventProperties = {
    [Prop.OccurredAt]: nowIso(),
    [Prop.ModelDisplay]: input.modelDisplay,
    [Prop.Feedback]: feedbackValue(input.feedbackAtCopy),
  }
  if (typeof input.estimatedCostUsd === "number") {
    properties[Prop.EstimatedCostUsd] = input.estimatedCostUsd
  }
  return properties
}

export function userRunDownvoteProperties(
  input: UserRunDownvoteInput
): ProductEventProperties {
  const properties: ProductEventProperties = {
    [Prop.OccurredAt]: nowIso(),
    [Prop.ModelDisplay]: input.modelDisplay,
  }
  if (typeof input.estimatedCostUsd === "number") {
    properties[Prop.EstimatedCostUsd] = input.estimatedCostUsd
  }
  return properties
}
