import {
  V1_ANALYSIS_PROMPT_VARIANTS,
  V1_DEFAULT_ESTIMATED_OUTPUT_TOKENS,
  buildV1SynthesisPrompt,
} from "@/lib/simplify/engines/v1/prompts"
import { estimateQueryTotalTokens } from "@/lib/simplify/routing-estimate"

import { preprocessV1Input } from "./preprocess"
import type { V1AnalysisBranchResult } from "./types"

const SYNTHESIS_ESTIMATE_ANALYSES: V1AnalysisBranchResult[] =
  V1_ANALYSIS_PROMPT_VARIANTS.map((variant) => ({
    id: variant.id,
    label: variant.label,
    text: [
      "ERR cspell 12 issues/6 files",
      "CTX cspell/vp/pre-commit",
      "TOP AGENTS.md:11:64 | src/env/sentry-server.ts:31:40 | src/server/sentry-tunnel.ts:9:10",
      "ISSUES cspell 12 issues/6 files (199 checked) ; AGENTS.md:11:64 unknown(scifi) ; src/env/sentry-server.ts:31:40 unknown(Dsns) ; +9 more",
      "SIG cspell lint --no-progress --config .cspell/cspell.json failed ; vp check --fix killed ; pre-commit failed (code 1)",
      "NOISE duplicate signal lines x5",
    ].join("\n"),
    attempts: 1,
    durationMs: 0,
    attemptDurationsMs: [0],
    costSpan: null,
  }))

export function prepareV1RoutingEstimate(input: string): {
  inputText: string
  prompts: string[]
} {
  const inputText = preprocessV1Input(input).text.trim()
  if (!inputText) {
    return { inputText: "", prompts: [] }
  }

  const analysisPrompts = V1_ANALYSIS_PROMPT_VARIANTS.map((variant) =>
    [variant.systemPrompt, variant.buildUserPrompt(inputText)].join("\n\n")
  )

  const synthesisPrompt = [
    "You merge multiple candidate error analyses into one grounded final answer.",
    buildV1SynthesisPrompt(inputText, SYNTHESIS_ESTIMATE_ANALYSES),
  ].join("\n\n")

  return {
    inputText,
    prompts: [...analysisPrompts, synthesisPrompt],
  }
}

export function buildV1RoutingEstimatePrompts(input: string): string[] {
  return prepareV1RoutingEstimate(input).prompts
}

export function estimateV1QueryTotalTokens(promptTokens: number): number {
  return estimateQueryTotalTokens(
    promptTokens,
    V1_DEFAULT_ESTIMATED_OUTPUT_TOKENS
  )
}
