import { fetchModelEndpointsFromOpenRouter } from "@/lib/openrouter/fetch-model-endpoints"
import type { FetchModelEndpointsResult } from "@/lib/openrouter/fetch-model-endpoints"

/** Direct browser fetch only; no same-origin fallback routes are allowed. */
export async function fetchModelEndpointsDirect(
  apiKey: string,
  modelId: string,
  signal?: AbortSignal
): Promise<FetchModelEndpointsResult> {
  return fetchModelEndpointsFromOpenRouter(apiKey, modelId, signal)
}
