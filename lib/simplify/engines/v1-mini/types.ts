import type {
  SimplifyPipelineResult,
  SimplifyPipelineStepId,
  SimplifyRunCostSpan,
} from "@/lib/simplify/types"

export type V1MiniStepId = "preprocess" | "compress"

export type V1MiniCompressionResult = {
  text: string
  attempts: number
  durationMs: number
  attemptDurationsMs: number[]
  costSpan: SimplifyRunCostSpan | null
}

export type V1MiniPipelineResult = SimplifyPipelineResult & {
  compression: V1MiniCompressionResult
}

export function isV1MiniStepId(
  value: SimplifyPipelineStepId
): value is V1MiniStepId {
  return ["preprocess", "compress"].includes(value)
}
