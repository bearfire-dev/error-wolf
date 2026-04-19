import type { SimplifyPipelineNode } from "@/lib/simplify/pipeline-dag"
import type {
  SimplifyPipelineResult,
  SimplifyRunOptions,
} from "@/lib/simplify/types"

export const SIMPLIFY_ENGINE_IDS = ["v1", "v1-mini"] as const

export type SimplifyEngineId = (typeof SIMPLIFY_ENGINE_IDS)[number]

export function isSimplifyEngineId(value: string): value is SimplifyEngineId {
  return (SIMPLIFY_ENGINE_IDS as readonly string[]).includes(value)
}

export type SimplifyRoutingEstimatePayload = {
  inputText: string
  prompts: string[]
}

export type SimplifyResolvedModelRoute = {
  routeId: string
  engineId: SimplifyEngineId
  routerLabel: string
  modelLabel: string
  targetLabel: string
  modelId: string
}

export type SimplifyModelRouteOption = {
  id: string
  label: string
}

export type SimplifyEngineDefinition = {
  id: SimplifyEngineId
  label: string
  description: string
  dag: SimplifyPipelineNode[]
  defaultModelRouteId: string
  modelRouteOptions: readonly SimplifyModelRouteOption[]
  prepareRoutingEstimate: (input: string) => SimplifyRoutingEstimatePayload
  estimateRoutingTotalTokens: (promptTokens: number) => number
  resolveModelRoute: (
    routeId: string | null | undefined,
    inputTokens: number | null
  ) => SimplifyResolvedModelRoute
  run: (options: SimplifyRunOptions) => Promise<SimplifyPipelineResult>
}
