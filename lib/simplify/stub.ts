import type { OpenRouterPublicEndpoint } from "@/lib/openrouter/endpoints-types"
import { getSimplifyEngine } from "@/lib/simplify/engines/registry"
import type { SimplifyEngineId } from "@/lib/simplify/engines/types"
import type {
  OpenRouterProviderPreferences,
  SimplifyPipelineResult,
  SimplifyProgressSnapshot,
  SimplifyThroughputReporter,
} from "@/lib/simplify/types"

export type {
  SimplifyPipelineResult,
  SimplifyProgressSnapshot,
  SimplifyThroughputReporter,
  SimplifyWarning,
} from "@/lib/simplify/types"
export type { SimplifyEngineId } from "@/lib/simplify/engines/types"
export { DEFAULT_SIMPLIFY_ENGINE_ID } from "@/lib/simplify/engines/registry"
export type { SimplifyPipelineNode } from "@/lib/simplify/pipeline-dag"
export {
  createThroughputBus,
  type ThroughputBus,
  type ThroughputTick,
} from "@/lib/simplify/throughput-bus"

export async function simplifyErrorText(
  input: string,
  options: {
    apiKey: string
    signal?: AbortSignal
    onProgress?: (snapshot: SimplifyProgressSnapshot) => void
    onChunk?: SimplifyThroughputReporter
    provider?: OpenRouterProviderPreferences
    providerEndpoints?: OpenRouterPublicEndpoint[]
    engineId?: SimplifyEngineId
  }
): Promise<SimplifyPipelineResult> {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error("Paste an error or log snippet to simplify.")
  }

  if (!options.apiKey.trim()) {
    throw new Error("Verify your OpenRouter key before simplifying.")
  }

  const engine = getSimplifyEngine(options.engineId)

  return engine.run({
    apiKey: options.apiKey,
    input: trimmed,
    signal: options.signal,
    onProgress: options.onProgress,
    onChunk: options.onChunk,
    provider: options.provider,
    providerEndpoints: options.providerEndpoints,
  })
}
