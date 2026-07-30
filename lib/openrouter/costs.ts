import type { OpenRouterPublicEndpoint } from "@/lib/openrouter/endpoints-types"
import { endpointProviderSlug } from "@/lib/openrouter/rank-providers"
import type {
  OpenRouterProviderPreferences,
  OpenRouterUsage,
  SimplifyRunCostSource,
  SimplifyRunCostSpan,
  SimplifyRunCostSummary,
} from "@/lib/simplify/types"

function parseUnitPrice(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function sumDefined(values: Array<number | undefined>): number | undefined {
  let total = 0
  let hasValue = false

  for (const value of values) {
    if (value === undefined) continue
    total += value
    hasValue = true
  }

  return hasValue ? total : undefined
}

function preferredProviderSlug(
  provider: OpenRouterProviderPreferences | undefined
): string | null {
  const preferred = provider?.order?.[0] ?? provider?.only?.[0]
  return preferred?.trim().toLowerCase() ?? null
}

function endpointForCost(
  endpoints: OpenRouterPublicEndpoint[] | undefined,
  modelId: string,
  providerSlug: string | null,
  resolvedProviderName?: string | null
): OpenRouterPublicEndpoint | null {
  if (!endpoints || endpoints.length === 0) return null

  const modelMatches = endpoints.filter(
    (endpoint) => endpoint.model_id === modelId
  )
  const scoped = modelMatches.length > 0 ? modelMatches : endpoints

  // The provider that actually served wins over the one we asked for. Match on
  // the display name OpenRouter reports in-stream ("Cerebras") before falling
  // back to the slug derived from the request shortlist.
  const servedName = resolvedProviderName?.trim().toLowerCase()
  if (servedName) {
    const servedMatch = scoped.find(
      (endpoint) => endpoint.provider_name?.trim().toLowerCase() === servedName
    )
    if (servedMatch) return servedMatch
  }

  if (providerSlug) {
    const providerMatch = scoped.find(
      (endpoint) => endpointProviderSlug(endpoint) === providerSlug
    )
    if (providerMatch) return providerMatch
  }
  return scoped[0] ?? null
}

export function buildOpenRouterCostSpan(params: {
  stepId: SimplifyRunCostSpan["stepId"]
  requestId: string | null
  modelId: string
  usage: OpenRouterUsage | null
  provider?: OpenRouterProviderPreferences
  /** Provider that actually served, per the stream. Beats the requested list. */
  resolvedProviderName?: string | null
  endpoints?: OpenRouterPublicEndpoint[]
}): SimplifyRunCostSpan {
  const providerSlug = preferredProviderSlug(params.provider)
  const endpoint = endpointForCost(
    params.endpoints,
    params.modelId,
    providerSlug,
    params.resolvedProviderName
  )
  const promptPrice = parseUnitPrice(endpoint?.pricing?.prompt)
  const completionPrice = parseUnitPrice(endpoint?.pricing?.completion)
  const promptTokens = params.usage?.promptTokens
  const completionTokens = params.usage?.completionTokens

  const estimatedCostUsd =
    promptPrice !== undefined &&
    completionPrice !== undefined &&
    promptTokens !== undefined &&
    completionTokens !== undefined
      ? promptTokens * promptPrice + completionTokens * completionPrice
      : undefined

  const reportedCostUsd = params.usage?.reportedCostUsd
  const displayCostUsd = reportedCostUsd ?? estimatedCostUsd
  const source: SimplifyRunCostSpan["source"] =
    reportedCostUsd !== undefined
      ? "response_usage_cost"
      : estimatedCostUsd !== undefined
        ? "estimated_pricing"
        : "unavailable"

  return {
    stepId: params.stepId,
    requestId: params.requestId,
    modelId: params.modelId,
    // Report the endpoint we actually priced against, so the slug and the name
    // always describe the same provider.
    providerSlug: endpoint ? endpointProviderSlug(endpoint) : providerSlug,
    providerName:
      endpoint?.provider_name ?? params.resolvedProviderName ?? null,
    promptTokens,
    completionTokens,
    totalTokens: params.usage?.totalTokens,
    estimatedCostUsd,
    reportedCostUsd,
    displayCostUsd,
    source,
  }
}

export function summarizeRunCosts(
  spans: SimplifyRunCostSpan[]
): SimplifyRunCostSummary {
  const estimatedCostUsd = sumDefined(
    spans.map((span) => span.estimatedCostUsd)
  )
  const reportedCostUsd = sumDefined(spans.map((span) => span.reportedCostUsd))
  const displayCostUsd = sumDefined(spans.map((span) => span.displayCostUsd))

  const source: SimplifyRunCostSource =
    spans.length === 0 || displayCostUsd === undefined
      ? "unavailable"
      : spans.every((span) => span.source === "response_usage_cost")
        ? "exact"
        : spans.every((span) => span.source === "estimated_pricing")
          ? "estimated"
          : "mixed"

  return {
    spans,
    estimatedCostUsd,
    reportedCostUsd,
    displayCostUsd,
    source,
  }
}
