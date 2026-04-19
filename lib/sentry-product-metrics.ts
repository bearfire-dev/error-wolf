import * as Sentry from "@sentry/nextjs"

enum MetricName {
  UserInitialize = "user-initialize",
  UserSetup = "user-setup",
  UserRun = "user-run",
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
  Sentry.metrics.count(MetricName.UserInitialize, 1, {
    attributes: { [Attr.OccurredAt]: nowIso() },
  })
}

/** Hunt 01 KEY: OpenRouter key verified and saved. */
export function emitUserSetupMetric(): void {
  Sentry.metrics.count(MetricName.UserSetup, 1, {
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

  Sentry.metrics.count(MetricName.UserRun, 1, { attributes })
}
