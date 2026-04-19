"use client"

import { useEffect, useMemo, useState } from "react"

import { getSimplifyEngine } from "@/lib/simplify/engines/registry"
import type { SimplifyEngineId } from "@/lib/simplify/engines/types"
import { countTokens } from "@/lib/tokens/client"

type RoutingEstimateState = {
  promptKey: string
  inputTokens: number
  totalTokens: number
}

const INITIAL_STATE: RoutingEstimateState = {
  promptKey: "",
  inputTokens: 0,
  totalTokens: 0,
}

export function useHuntRoutingEstimate(
  rawInput: string,
  engineId: SimplifyEngineId
) {
  const engine = useMemo(() => getSimplifyEngine(engineId), [engineId])
  const [state, setState] = useState<RoutingEstimateState>(INITIAL_STATE)
  const estimate = useMemo(
    () => engine.prepareRoutingEstimate(rawInput),
    [engine, rawInput]
  )
  const promptKey = useMemo(
    () => [estimate.inputText, ...estimate.prompts].join("\u0000"),
    [estimate]
  )

  useEffect(() => {
    if (!estimate.inputText || estimate.prompts.length === 0) return

    let cancelled = false

    void Promise.all([
      countTokens(estimate.inputText),
      ...estimate.prompts.map((prompt) => countTokens(prompt)),
    ])
      .then(([inputTokens, ...promptTokenCounts]) => {
        if (cancelled) return
        const totalTokens = Math.max(
          ...promptTokenCounts.map((tokens) =>
            engine.estimateRoutingTotalTokens(tokens)
          )
        )
        setState({ promptKey, inputTokens, totalTokens })
      })
      .catch(() => {
        if (cancelled) return
        const fallbackInputTokens = Math.max(
          1,
          Math.round(estimate.inputText.length / 4)
        )
        const fallbackPromptTokens = Math.max(
          ...estimate.prompts.map((prompt) => Math.round(prompt.length / 4))
        )
        setState({
          promptKey,
          inputTokens: fallbackInputTokens,
          totalTokens: engine.estimateRoutingTotalTokens(fallbackPromptTokens),
        })
      })

    return () => {
      cancelled = true
    }
  }, [engine, estimate, promptKey])

  if (!estimate.inputText || estimate.prompts.length === 0) {
    return { inputTokens: null, totalTokens: null, estimating: false }
  }

  return {
    inputTokens: state.promptKey === promptKey ? state.inputTokens : null,
    totalTokens: state.promptKey === promptKey ? state.totalTokens : null,
    estimating: state.promptKey !== promptKey,
  }
}
