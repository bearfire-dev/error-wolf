import {
  buildOpenRouterCostSpan,
  summarizeRunCosts,
} from "@/lib/openrouter/costs"
import type { OpenRouterPublicEndpoint } from "@/lib/openrouter/endpoints-types"
import { preprocessV1Input } from "@/lib/simplify/engines/v1/preprocess"
import {
  isRetryableOpenRouterError,
  runStreamingCompletion,
} from "@/lib/simplify/openrouter-client"
import {
  backoffDelayMs,
  sleepUnlessAborted,
} from "@/lib/simplify/retry-backoff"
import {
  SOLO_FIRST_TOKEN_TIMEOUT_MS,
  streamTimeoutsFor,
} from "@/lib/simplify/stream-timeouts"
import type {
  SimplifyRunOptions,
  SimplifyThroughputReporter,
  SimplifyWarning,
} from "@/lib/simplify/types"

import {
  V1_MINI_DEFAULT_OPENROUTER_MODEL,
  V1_MINI_DEFAULT_OPENROUTER_TEMPERATURE,
  V1_MINI_SYSTEM_PROMPT,
  buildV1MiniPrompt,
} from "./prompts"
import { createV1MiniProgressTracker } from "./progress"
import type { V1MiniCompressionResult, V1MiniPipelineResult } from "./types"

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

async function runV1MiniCompression(params: {
  apiKey: string
  cleanedInput: string
  modelId: string
  signal?: AbortSignal
  progress: ReturnType<typeof createV1MiniProgressTracker>
  provider?: SimplifyRunOptions["provider"]
  providerLatencyPolicy?: SimplifyRunOptions["providerLatencyPolicy"]
  providerEndpoints?: OpenRouterPublicEndpoint[]
  onChunk?: SimplifyThroughputReporter
}): Promise<V1MiniCompressionResult> {
  const {
    apiKey,
    cleanedInput,
    modelId,
    signal,
    progress,
    provider,
    providerLatencyPolicy,
    providerEndpoints,
    onChunk,
  } = params
  const attemptDurationsMs: number[] = []
  const maxRetries = 2

  progress.start("compress", "single-pass compact rewrite / attempt 1")

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    throwIfAborted(signal)

    try {
      const result = await runStreamingCompletion(
        {
          apiKey,
          model: modelId,
          systemPrompt: V1_MINI_SYSTEM_PROMPT,
          prompt: buildV1MiniPrompt(cleanedInput),
          temperature: V1_MINI_DEFAULT_OPENROUTER_TEMPERATURE,
          signal,
          provider,
        },
        {
          onChunk: (delta) => onChunk?.("compress", delta.length, nowMs()),
          latencyPolicy: providerLatencyPolicy,
          timeouts: streamTimeoutsFor(Boolean(providerLatencyPolicy)),
          soloFirstTokenMs: SOLO_FIRST_TOKEN_TIMEOUT_MS,
        }
      )
      const costSpan = buildOpenRouterCostSpan({
        stepId: "compress",
        requestId: result.requestId,
        modelId: result.modelId,
        usage: result.usage,
        provider: result.resolvedProvider ?? provider,
        resolvedProviderName: result.resolvedProviderName,
        endpoints: providerEndpoints,
      })

      attemptDurationsMs.push(result.durationMs)
      progress.succeed(
        "compress",
        `single-pass / ok / ${attempt} attempt${attempt === 1 ? "" : "s"}`
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
      if (attempt <= maxRetries && isRetryableOpenRouterError(error)) {
        progress.retry(
          "compress",
          `single-pass compact rewrite / retry ${attempt}/${maxRetries}`
        )
        await sleepUnlessAborted(backoffDelayMs(attempt, error), signal)
        continue
      }

      progress.fail("compress", message)
      throw new Error(
        `Single-pass compression failed after ${attempt} attempts: ${message}`
      )
    }
  }

  throw new Error("Single-pass compression did not complete.")
}

export async function runV1MiniPipeline(
  options: SimplifyRunOptions
): Promise<V1MiniPipelineResult> {
  const {
    apiKey,
    input,
    resolvedModelId,
    onProgress,
    onChunk,
    signal,
    provider,
    providerLatencyPolicy,
    providerEndpoints,
  } = options
  const startedAtMs = nowMs()
  const warnings: SimplifyWarning[] = []
  const progress = createV1MiniProgressTracker(onProgress)
  const modelId = resolvedModelId?.trim() || V1_MINI_DEFAULT_OPENROUTER_MODEL

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

  const compression = await runV1MiniCompression({
    apiKey,
    cleanedInput: preprocess.text,
    modelId,
    signal,
    progress,
    provider,
    providerLatencyPolicy,
    providerEndpoints,
    onChunk,
  })
  const cost = summarizeRunCosts(
    [compression.costSpan].filter((span): span is NonNullable<typeof span> => {
      return span !== null
    })
  )

  return {
    text: compression.text,
    cleanedInput: preprocess.text,
    durationMs: nowMs() - startedAtMs,
    cost,
    warnings,
    progress: progress.snapshot(),
    compression,
  }
}
