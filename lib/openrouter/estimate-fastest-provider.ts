/**
 * Heuristic end-to-end completion time using OpenRouter’s published stats:
 * - `latency_last_30m` = time to first token (TTFT), ms
 * - `throughput_last_30m` = generation throughput, tokens/sec
 *
 * We approximate: e2eSeconds = ttftSeconds + outputTokens / throughputTokPerSec
 * (same percentile for both). This ignores queueing and prompt-size effects on TTFT.
 */

import type { OpenRouterPublicEndpoint } from "@/lib/openrouter/endpoints-types"
import {
  endpointProviderSlug,
  type PercentileKey,
} from "@/lib/openrouter/rank-providers"

export type EstimateFastestProviderOptions = {
  /** Default p50 — typical; use p90 for a more conservative tail. */
  percentile?: PercentileKey
  /**
   * Single `totalTokens` is split: outputTokens = round(total * share),
   * inputTokens = total - outputTokens (both floored to at least 1).
   */
  outputTokenShare?: number
}

export type FastestProviderEstimate = {
  slug: string
  endpoint: OpenRouterPublicEndpoint
  estimatedSeconds: number
  breakdown: {
    ttftSeconds: number
    generationSeconds: number
  }
}

function percentileNumber(
  stats:
    | { p50: number; p75: number; p90: number; p99: number }
    | null
    | undefined,
  p: PercentileKey
): number | null {
  if (!stats) return null
  const v = stats[p]
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null
}

function splitTokens(
  totalTokens: number,
  outputShare: number
): { inputTokens: number; outputTokens: number } | null {
  if (!Number.isFinite(totalTokens) || totalTokens < 2) return null
  const share = Math.min(1, Math.max(0, outputShare))
  let outputTokens = Math.round(totalTokens * share)
  let inputTokens = totalTokens - outputTokens
  if (outputTokens < 1) {
    outputTokens = 1
    inputTokens = totalTokens - 1
  }
  if (inputTokens < 1) {
    inputTokens = 1
    outputTokens = totalTokens - 1
  }
  return { inputTokens, outputTokens }
}

function isFeasible(
  endpoint: OpenRouterPublicEndpoint,
  inputTokens: number,
  outputTokens: number
): boolean {
  if (
    typeof endpoint.context_length === "number" &&
    endpoint.context_length > 0 &&
    inputTokens > endpoint.context_length
  ) {
    return false
  }
  if (
    endpoint.max_completion_tokens != null &&
    endpoint.max_completion_tokens > 0 &&
    outputTokens > endpoint.max_completion_tokens
  ) {
    return false
  }
  return true
}

export function estimateFastestProvider(
  endpoints: OpenRouterPublicEndpoint[],
  totalTokens: number,
  options?: EstimateFastestProviderOptions
): FastestProviderEstimate | null {
  const percentile = options?.percentile ?? "p50"
  const outputTokenShare = options?.outputTokenShare ?? 0.35

  const split = splitTokens(Math.floor(totalTokens), outputTokenShare)
  if (!split) return null

  const { inputTokens, outputTokens } = split

  let best: FastestProviderEstimate | null = null

  for (const endpoint of endpoints) {
    if (!isFeasible(endpoint, inputTokens, outputTokens)) continue

    const latencyMs = percentileNumber(endpoint.latency_last_30m, percentile)
    const tput = percentileNumber(endpoint.throughput_last_30m, percentile)
    if (latencyMs === null || tput === null || tput <= 0) continue

    const ttftSeconds = latencyMs / 1000
    const generationSeconds = outputTokens / tput
    const estimatedSeconds = ttftSeconds + generationSeconds

    if (!best || estimatedSeconds < best.estimatedSeconds) {
      best = {
        slug: endpointProviderSlug(endpoint),
        endpoint,
        estimatedSeconds,
        breakdown: {
          ttftSeconds,
          generationSeconds,
        },
      }
    }
  }

  return best
}
