import {
  buildOpenRouterCostSpan,
  summarizeRunCosts,
} from "@/lib/openrouter/costs"
import type { OpenRouterPublicEndpoint } from "@/lib/openrouter/endpoints-types"
import { runStreamingCompletion } from "@/lib/simplify/openrouter-client"
import type {
  SimplifyRunOptions,
  SimplifyThroughputReporter,
  SimplifyWarning,
} from "@/lib/simplify/types"

import { preprocessV1Input } from "./preprocess"
import {
  V1_ANALYSIS_PROMPT_VARIANTS,
  V1_DEFAULT_OPENROUTER_MODEL,
  V1_DEFAULT_OPENROUTER_TEMPERATURE,
  buildV1SynthesisPrompt,
} from "./prompts"
import { createV1ProgressTracker } from "./progress"
import type {
  V1AnalysisBranchResult,
  V1PipelineResult,
  V1SynthesisResult,
} from "./types"

function nowMs(): number {
  if (typeof performance !== "undefined") return performance.now()
  return Date.now()
}

function createAbortError(): Error {
  const error = new Error("Request aborted.")
  error.name = "AbortError"
  return error
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError()
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError"
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }
  return "Unknown request failure."
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

async function runV1AnalysisBranch(params: {
  apiKey: string
  cleanedInput: string
  modelId: string
  signal?: AbortSignal
  warnings: SimplifyWarning[]
  progress: ReturnType<typeof createV1ProgressTracker>
  variant: (typeof V1_ANALYSIS_PROMPT_VARIANTS)[number]
  provider?: SimplifyRunOptions["provider"]
  providerEndpoints?: OpenRouterPublicEndpoint[]
  onChunk?: SimplifyThroughputReporter
}): Promise<V1AnalysisBranchResult | null> {
  const {
    apiKey,
    cleanedInput,
    modelId,
    signal,
    warnings,
    progress,
    variant,
    provider,
    onChunk,
  } = params
  const attemptDurationsMs: number[] = []
  const maxRetries = 1

  progress.start(variant.id, `${variant.label} / attempt 1`)

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    throwIfAborted(signal)

    try {
      const result = await runStreamingCompletion(
        {
          apiKey,
          model: modelId,
          systemPrompt: variant.systemPrompt,
          prompt: variant.buildUserPrompt(cleanedInput),
          temperature: V1_DEFAULT_OPENROUTER_TEMPERATURE,
          signal,
          provider,
        },
        {
          onChunk: (delta) => onChunk?.(variant.id, delta.length, nowMs()),
        }
      )
      const costSpan = buildOpenRouterCostSpan({
        stepId: variant.id,
        requestId: result.requestId,
        modelId: result.modelId,
        usage: result.usage,
        provider,
        endpoints: params.providerEndpoints,
      })

      attemptDurationsMs.push(result.durationMs)
      progress.succeed(
        variant.id,
        `${variant.label} / ok / ${attempt} attempt${attempt === 1 ? "" : "s"}`
      )

      return {
        id: variant.id,
        label: variant.label,
        text: result.text,
        attempts: attempt,
        durationMs: sum(attemptDurationsMs),
        attemptDurationsMs,
        costSpan,
      }
    } catch (error) {
      if (isAbortError(error)) throw error

      const message = errorMessage(error)
      if (attempt <= maxRetries) {
        progress.retry(
          variant.id,
          `${variant.label} / retry ${attempt}/${maxRetries}`
        )
        continue
      }

      const warning = `${variant.label} skipped after retry: ${message}`
      warnings.push({ stepId: variant.id, message: warning })
      progress.warn(variant.id, warning)
      return null
    }
  }

  return null
}

async function runV1Synthesis(params: {
  apiKey: string
  cleanedInput: string
  modelId: string
  analyses: V1AnalysisBranchResult[]
  signal?: AbortSignal
  progress: ReturnType<typeof createV1ProgressTracker>
  provider?: SimplifyRunOptions["provider"]
  providerEndpoints?: OpenRouterPublicEndpoint[]
  onChunk?: SimplifyThroughputReporter
}): Promise<V1SynthesisResult> {
  const {
    apiKey,
    cleanedInput,
    modelId,
    analyses,
    signal,
    progress,
    provider,
    onChunk,
  } = params
  const attemptDurationsMs: number[] = []
  const maxRetries = 2

  progress.start("synthesis", "merging compact variants / attempt 1")

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    throwIfAborted(signal)

    try {
      const result = await runStreamingCompletion(
        {
          apiKey,
          model: modelId,
          systemPrompt:
            "You merge multiple candidate error analyses into one grounded final answer.",
          prompt: buildV1SynthesisPrompt(cleanedInput, analyses),
          temperature: 0.15,
          signal,
          provider,
        },
        {
          onChunk: (delta) => onChunk?.("synthesis", delta.length, nowMs()),
        }
      )
      const costSpan = buildOpenRouterCostSpan({
        stepId: "synthesis",
        requestId: result.requestId,
        modelId: result.modelId,
        usage: result.usage,
        provider,
        endpoints: params.providerEndpoints,
      })

      attemptDurationsMs.push(result.durationMs)
      progress.succeed(
        "synthesis",
        `merged / ok / ${attempt} attempt${attempt === 1 ? "" : "s"}`
      )

      return {
        text: result.text,
        attempts: attempt,
        durationMs: sum(attemptDurationsMs),
        attemptDurationsMs,
        costSpan,
      }
    } catch (error) {
      if (isAbortError(error)) throw error

      const message = errorMessage(error)
      if (attempt <= maxRetries) {
        progress.retry(
          "synthesis",
          `merging compact variants / retry ${attempt}/${maxRetries}`
        )
        continue
      }

      progress.fail("synthesis", message)
      throw new Error(
        `Final merge failed after ${attempt} attempts: ${message}`
      )
    }
  }

  throw new Error("Final merge did not complete.")
}

export async function runV1Pipeline(
  options: SimplifyRunOptions
): Promise<V1PipelineResult> {
  const {
    apiKey,
    input,
    resolvedModelId,
    onProgress,
    onChunk,
    signal,
    provider,
    providerEndpoints,
  } = options
  const startedAtMs = nowMs()
  const warnings: SimplifyWarning[] = []
  const progress = createV1ProgressTracker(onProgress)
  const modelId = resolvedModelId?.trim() || V1_DEFAULT_OPENROUTER_MODEL

  throwIfAborted(signal)
  progress.start("preprocess", "normalizing trace")

  const preprocess = preprocessV1Input(input)
  if (!preprocess.text) {
    const message = "Nothing usable remained after cleanup."
    progress.fail("preprocess", message)
    throw new Error(message)
  }

  progress.succeed(
    "preprocess",
    `${preprocess.keptLineCount}/${preprocess.originalLineCount} lines normalized`
  )

  const analyses = (
    await Promise.all(
      V1_ANALYSIS_PROMPT_VARIANTS.map((variant) =>
        runV1AnalysisBranch({
          apiKey,
          cleanedInput: preprocess.text,
          modelId,
          signal,
          warnings,
          progress,
          variant,
          provider,
          providerEndpoints,
          onChunk,
        })
      )
    )
  ).filter((analysis): analysis is V1AnalysisBranchResult => analysis !== null)

  if (analyses.length === 0) {
    const message = "All compression passes failed. Nothing to merge."
    progress.fail("synthesis", message)
    throw new Error(message)
  }

  const synthesis = await runV1Synthesis({
    apiKey,
    cleanedInput: preprocess.text,
    modelId,
    analyses,
    signal,
    progress,
    provider,
    providerEndpoints,
    onChunk,
  })
  const cost = summarizeRunCosts(
    [
      ...analyses.map((analysis) => analysis.costSpan),
      synthesis.costSpan,
    ].filter((span): span is NonNullable<typeof span> => span !== null)
  )

  return {
    text: synthesis.text,
    cleanedInput: preprocess.text,
    durationMs: nowMs() - startedAtMs,
    cost,
    warnings,
    progress: progress.snapshot(),
    preprocess,
    analyses,
    synthesis,
  }
}
