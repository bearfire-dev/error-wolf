"use client"

import { useMemo } from "react"

import { getSimplifyEngine } from "@/lib/simplify/engines/registry"
import type { SimplifyEngineId } from "@/lib/simplify/engines/types"
import { estimateTokenCountsFast } from "@/lib/tokens/estimate-token-count-fast"

export function useHuntRoutingEstimate(
  rawInput: string,
  engineId: SimplifyEngineId
) {
  const engine = useMemo(() => getSimplifyEngine(engineId), [engineId])
  const estimate = useMemo(
    () => engine.prepareRoutingEstimate(rawInput),
    [engine, rawInput]
  )

  if (!estimate.inputText || estimate.prompts.length === 0) {
    return { inputTokens: null, totalTokens: null, estimating: false }
  }

  const [inputTokens, ...promptTokenCounts] = estimateTokenCountsFast([
    { text: estimate.inputText, kind: "text" },
    ...estimate.prompts.map((prompt) => ({
      text: prompt,
      kind: "prompt" as const,
    })),
  ])
  const totalTokens = Math.max(
    ...promptTokenCounts.map((tokens) =>
      engine.estimateRoutingTotalTokens(tokens)
    )
  )

  return { inputTokens, totalTokens, estimating: false }
}
