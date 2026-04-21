import type {
  SimplifyPipelineResult,
  SimplifyRunCostSpan,
  SimplifyPipelineStepId,
} from "@/lib/simplify/types"

export type V1StepId =
  | "preprocess"
  | "analysis-1"
  | "analysis-2"
  | "analysis-3"
  | "synthesis"

export type V1PreprocessResult = {
  text: string
  lines: string[]
  originalLineCount: number
  keptLineCount: number
  removedEmptyCount: number
  removedDividerCount: number
  removedDuplicateCount: number
  headline: string | null
  context: string | null
  topSources: string[]
  frames: V1CanonicalFrame[]
  signalLines: string[]
  diagnosticIssues: string[]
  diagnosticSummaries: string[]
  failureSignals: string[]
  noiseBuckets: V1NoiseBucket[]
}

export type V1NoiseBucket = {
  key: string
  label: string
  count: number
  sample: string | null
}

export type V1CanonicalFrame = {
  raw: string
  text: string
  functionName: string | null
  location: string | null
}

export type V1AnalysisBranchId = Extract<
  V1StepId,
  "analysis-1" | "analysis-2" | "analysis-3"
>

export type V1PromptVariant = {
  id: V1AnalysisBranchId
  label: string
  systemPrompt: string
  buildUserPrompt: (input: string) => string
}

export type V1AnalysisBranchResult = {
  id: V1AnalysisBranchId
  label: string
  text: string
  attempts: number
  durationMs: number
  attemptDurationsMs: number[]
  costSpan: SimplifyRunCostSpan | null
}

export type V1SynthesisResult = {
  text: string
  attempts: number
  durationMs: number
  attemptDurationsMs: number[]
  costSpan: SimplifyRunCostSpan | null
}

export type V1PipelineResult = SimplifyPipelineResult & {
  preprocess: V1PreprocessResult
  analyses: V1AnalysisBranchResult[]
  synthesis: V1SynthesisResult
}

export function isV1StepId(value: SimplifyPipelineStepId): value is V1StepId {
  return [
    "preprocess",
    "analysis-1",
    "analysis-2",
    "analysis-3",
    "synthesis",
  ].includes(value)
}
