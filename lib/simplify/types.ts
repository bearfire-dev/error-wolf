import type { OpenRouterPublicEndpoint } from "@/lib/openrouter/endpoints-types"

export type SimplifyPipelineStepId = string

export type SimplifyPipelineStepStatus =
  | "pending"
  | "running"
  | "success"
  | "warning"
  | "error"

export type SimplifyProgressStep = {
  id: SimplifyPipelineStepId
  label: string
  status: SimplifyPipelineStepStatus
  retries: number
  detail: string | null
  warning: string | null
  error: string | null
  startedAtMs: number | null
  endedAtMs: number | null
  durationMs: number | null
}

export type SimplifyProgressSnapshot = {
  startedAtMs: number
  updatedAtMs: number
  steps: SimplifyProgressStep[]
}

export type SimplifyProgressListener = (
  snapshot: SimplifyProgressSnapshot
) => void

export type SimplifyWarning = {
  stepId: SimplifyPipelineStepId
  message: string
}

export type OpenRouterChatRole = "system" | "user" | "assistant"

export type OpenRouterChatMessage = {
  role: OpenRouterChatRole
  content: string
}

/** Subset of OpenRouter `provider` request body (snake_case per API). */
export type OpenRouterProviderPreferences = {
  order?: string[]
  allow_fallbacks?: boolean
  sort?: string | { by: string; partition?: string }
  only?: string[]
  ignore?: string[]
}

export type OpenRouterTextRequest = {
  apiKey: string
  model: string
  systemPrompt?: string
  prompt?: string
  messages?: OpenRouterChatMessage[]
  temperature?: number
  maxOutputTokens?: number
  signal?: AbortSignal
  provider?: OpenRouterProviderPreferences
}

export type OpenRouterUsage = {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  reportedCostUsd?: number
}

export type SimplifyCostSpanSource =
  | "response_usage_cost"
  | "estimated_pricing"
  | "unavailable"

export type SimplifyRunCostSpan = {
  stepId: SimplifyPipelineStepId
  requestId: string | null
  modelId: string
  providerSlug: string | null
  providerName: string | null
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  estimatedCostUsd?: number
  reportedCostUsd?: number
  displayCostUsd?: number
  source: SimplifyCostSpanSource
}

export type SimplifyRunCostSource =
  | "exact"
  | "estimated"
  | "mixed"
  | "unavailable"

export type SimplifyRunCostSummary = {
  spans: SimplifyRunCostSpan[]
  estimatedCostUsd?: number
  reportedCostUsd?: number
  displayCostUsd?: number
  source: SimplifyRunCostSource
}

export type OpenRouterTextResponse = {
  text: string
  durationMs: number
  raw: unknown
  requestId: string | null
  modelId: string
  usage: OpenRouterUsage | null
}

export type OpenRouterTextStreamEvent =
  | { type: "delta"; text: string }
  | { type: "usage"; usage: OpenRouterUsage }

export type OpenRouterTextStream = {
  stream: AsyncIterable<OpenRouterTextStreamEvent>
  response: Response
  startedAtMs: number
}

export type SimplifyRunResult = {
  text: string
  cleanedInput: string
  durationMs: number
  cost: SimplifyRunCostSummary
  warnings: SimplifyWarning[]
  progress: SimplifyProgressSnapshot
}

export type SimplifyPipelineResult = SimplifyRunResult

export type SimplifyThroughputReporter = (
  stepId: SimplifyPipelineStepId,
  chars: number,
  atMs: number
) => void

export type SimplifyRunOptions = {
  apiKey: string
  input: string
  resolvedModelId?: string
  signal?: AbortSignal
  onProgress?: SimplifyProgressListener
  /** Called once per streamed chunk; used to drive live waveforms. */
  onChunk?: SimplifyThroughputReporter
  provider?: OpenRouterProviderPreferences
  providerEndpoints?: OpenRouterPublicEndpoint[]
}
