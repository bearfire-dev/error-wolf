"use client"

import { useDeferredValue, useMemo } from "react"

import { getSimplifyEngine } from "@/lib/simplify/engines/registry"
import type {
  SimplifyEngineDefinition,
  SimplifyEngineId,
} from "@/lib/simplify/engines/types"
import { estimateTokenCountsFast } from "@/lib/tokens/estimate-token-count-fast"

/**
 * Above this the precise pass costs more than it is worth. It walks every code
 * point and allocates a `TextEncoder` buffer for the input plus each prompt,
 * and every prompt embeds the full cleaned input.
 */
const PRECISE_ESTIMATE_MAX_CHARS = 200_000

/** Bytes per token, matching the heuristic's own text divisor closely enough
 * for a routing decision on an input this large. */
const COARSE_CHARS_PER_TOKEN = 4

type RoutingEstimate = {
  inputTokens: number | null
  totalTokens: number | null
}

function computeRoutingEstimate(
  engine: SimplifyEngineDefinition,
  rawInput: string
): RoutingEstimate {
  const estimate = engine.prepareRoutingEstimate(rawInput)
  if (!estimate.inputText || estimate.prompts.length === 0) {
    return { inputTokens: null, totalTokens: null }
  }

  if (estimate.inputText.length > PRECISE_ESTIMATE_MAX_CHARS) {
    const coarse = (text: string) =>
      Math.ceil(text.length / COARSE_CHARS_PER_TOKEN)
    return {
      inputTokens: coarse(estimate.inputText),
      totalTokens: Math.max(
        ...estimate.prompts.map((prompt) =>
          engine.estimateRoutingTotalTokens(coarse(prompt))
        )
      ),
    }
  }

  const [inputTokens, ...promptTokenCounts] = estimateTokenCountsFast([
    { text: estimate.inputText, kind: "text" },
    ...estimate.prompts.map((prompt) => ({
      text: prompt,
      kind: "prompt" as const,
    })),
  ])

  return {
    inputTokens,
    totalTokens: Math.max(
      ...promptTokenCounts.map((tokens) =>
        engine.estimateRoutingTotalTokens(tokens)
      )
    ),
  }
}

export function useHuntRoutingEstimate(
  rawInput: string,
  engineId: SimplifyEngineId
) {
  const engine = useMemo(() => getSimplifyEngine(engineId), [engineId])

  // Estimating means preprocessing the whole paste and running four token
  // counts. Deferring keeps that off the keystroke path: React renders the new
  // text immediately and recomputes the estimate once it has idle time, and it
  // will abandon a stale estimate render if another keystroke lands first.
  const deferredInput = useDeferredValue(rawInput)

  const estimate = useMemo(
    () => computeRoutingEstimate(engine, deferredInput),
    [engine, deferredInput]
  )

  return { ...estimate, estimating: deferredInput !== rawInput }
}
