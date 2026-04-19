import { preprocessV1Input } from "@/lib/simplify/engines/v1/preprocess"
import { estimateQueryTotalTokens } from "@/lib/simplify/routing-estimate"

import {
  V1_MINI_DEFAULT_ESTIMATED_OUTPUT_TOKENS,
  V1_MINI_SYSTEM_PROMPT,
  buildV1MiniPrompt,
} from "./prompts"

export function prepareV1MiniRoutingEstimate(input: string): {
  inputText: string
  prompts: string[]
} {
  const inputText = preprocessV1Input(input).text.trim()
  if (!inputText) {
    return { inputText: "", prompts: [] }
  }

  return {
    inputText,
    prompts: [[V1_MINI_SYSTEM_PROMPT, buildV1MiniPrompt(inputText)].join("\n\n")],
  }
}

export function estimateV1MiniQueryTotalTokens(promptTokens: number): number {
  return estimateQueryTotalTokens(
    promptTokens,
    V1_MINI_DEFAULT_ESTIMATED_OUTPUT_TOKENS
  )
}
