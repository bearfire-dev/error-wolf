/**
 * `@sentry/core` and not `@sentry/react`: the initialize metric is emitted from
 * a server function on the Worker, where the browser SDK has no client bound.
 * Both `@sentry/react` and `@sentry/cloudflare` re-export this same `metrics`
 * object, so each side reports through whichever client is active.
 */
import { metrics } from "@sentry/core"

enum MetricName {
  UserInitialize = "user-initialize",
  UserSetup = "user-setup",
  UserRun = "user-run",
  UserRunDownvote = "user-run-downvote",
}

enum Attr {
  OccurredAt = "occurred_at",
  ModelDisplay = "model_display",
  Feedback = "feedback",
  EstimatedCostUsd = "estimated_cost_usd",
}

function nowIso(): string {
  return new Date().toISOString()
}

function feedbackAttr(vote: "up" | "down" | null): "up" | "down" | "none" {
  if (vote === "up" || vote === "down") return vote
  return "none"
}

/** Home: user clicked [ initialize ] and consent was stored. */
export function emitUserInitializeMetric(): void {
  metrics.count(MetricName.UserInitialize, 1, {
    attributes: { [Attr.OccurredAt]: nowIso() },
  })
}

/** Hunt 01 KEY: OpenRouter key verified and saved. */
export function emitUserSetupMetric(): void {
  metrics.count(MetricName.UserSetup, 1, {
    attributes: { [Attr.OccurredAt]: nowIso() },
  })
}

export type UserRunMetricInput = {
  modelDisplay: string
  /** Thumbs state at the moment the user copied (null = no vote yet). */
  feedbackAtCopy: "up" | "down" | null
  /** OpenRouter estimated cost for this run only; omit when unknown. */
  estimatedCostUsd?: number
}

/** Hunt 04 OUTPUT: user copied simplified output. */
export function emitUserRunMetric(input: UserRunMetricInput): void {
  const attributes: Record<string, string | number> = {
    [Attr.OccurredAt]: nowIso(),
    [Attr.ModelDisplay]: input.modelDisplay,
    [Attr.Feedback]: feedbackAttr(input.feedbackAtCopy),
  }
  if (typeof input.estimatedCostUsd === "number") {
    attributes[Attr.EstimatedCostUsd] = input.estimatedCostUsd
  }

  metrics.count(MetricName.UserRun, 1, { attributes })
}

export type UserRunDownvoteMetricInput = {
  modelDisplay: string
  /** OpenRouter estimated cost for this run only; omit when unknown. */
  estimatedCostUsd?: number
}

/** Hunt 04 OUTPUT: user downvoted simplified output (not tied to copy). */
export function emitUserRunDownvoteMetric(
  input: UserRunDownvoteMetricInput
): void {
  const attributes: Record<string, string | number> = {
    [Attr.OccurredAt]: nowIso(),
    [Attr.ModelDisplay]: input.modelDisplay,
  }
  if (typeof input.estimatedCostUsd === "number") {
    attributes[Attr.EstimatedCostUsd] = input.estimatedCostUsd
  }

  metrics.count(MetricName.UserRunDownvote, 1, { attributes })
}
