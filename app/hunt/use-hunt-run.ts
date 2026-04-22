"use client"

import { useCallback, useRef, useState } from "react"
import type { Dispatch, SetStateAction } from "react"

import type { HuntStep } from "@/lib/hunt-constants"
import type { OpenRouterPublicEndpoint } from "@/lib/openrouter/endpoints-types"
import { estimateTokenCountsFastAsync } from "@/lib/tokens/estimate-token-count-fast"
import { getSimplifyEngine } from "@/lib/simplify/engines/registry"
import type {
  SimplifyEngineId,
  SimplifyEngineDefinition,
} from "@/lib/simplify/engines/types"
import type {
  OpenRouterLatencyPolicy,
  OpenRouterProviderPreferences,
  SimplifyRunCostSpan,
} from "@/lib/simplify/types"
import {
  addRecentResult,
  getRecentResults,
  getStats,
  previewText,
  updateRecentResultTokens,
  type SimplifyStats,
} from "@/lib/recent-results"
import {
  emitUserRunDownvoteMetric,
  emitUserRunMetric,
} from "@/lib/sentry-product-metrics"
import {
  createThroughputBus,
  type SimplifyProgressSnapshot,
  type SimplifyWarning,
  type ThroughputBus,
} from "@/lib/simplify/stub"
import {
  OpenRouterInsufficientCreditsError,
  OpenRouterLatencyTimeoutError,
} from "@/lib/simplify/openrouter-client"
import type { SimplifyPipelineStepId } from "@/lib/simplify/types"

const KEY_CREDITS_NOTICE =
  "OpenRouter reported insufficient credits. Add credits to your account or use a different API key."
const OPENROUTER_LATENCY_NOTICE =
  "OpenRouter did not emit a first token before the interactive hedge budget expired. The app avoids giving up early now, but if this still appears, retry once or reduce the input size."

function billingPromptTokensFromSpan(
  span: SimplifyRunCostSpan
): number | undefined {
  if (span.promptTokens !== undefined) return span.promptTokens
  const total = span.totalTokens
  const completion = span.completionTokens
  if (
    typeof total === "number" &&
    typeof completion === "number" &&
    total >= completion
  ) {
    return total - completion
  }
  return undefined
}

function sumCompressorPromptTokens(
  spans: SimplifyRunCostSpan[]
): number | undefined {
  let total = 0
  let has = false
  for (const span of spans) {
    const n = billingPromptTokensFromSpan(span)
    if (n === undefined) continue
    total += n
    has = true
  }
  return has ? total : undefined
}

export type SimplifyReplayFrame = {
  timeMs: number
  snapshot: SimplifyProgressSnapshot
}

export type SimplifyReplayChunk = {
  timeMs: number
  stepId: SimplifyPipelineStepId
  chars: number
}

export type SimplifyReplay = {
  engineId: SimplifyEngineId
  frames: SimplifyReplayFrame[]
  chunks: SimplifyReplayChunk[]
  durationMs: number
} | null

type UseHuntRunArgs = {
  rawInput: string
  apiKey: string
  engineId: SimplifyEngineId
  resolvedModelId: string
  resolvedModelDisplay: string
  openRouterProvider?: OpenRouterProviderPreferences
  openRouterLatencyPolicy?: OpenRouterLatencyPolicy
  openRouterEndpoints?: OpenRouterPublicEndpoint[]
  clearRawInput: () => void
  setStep: Dispatch<SetStateAction<HuntStep>>
  setStats: Dispatch<SetStateAction<SimplifyStats>>
}

export function useHuntRun({
  rawInput,
  apiKey,
  engineId,
  resolvedModelId,
  resolvedModelDisplay,
  openRouterProvider,
  openRouterLatencyPolicy,
  openRouterEndpoints,
  clearRawInput,
  setStep,
  setStats,
}: UseHuntRunArgs) {
  const engine = getSimplifyEngine(engineId)
  const [lastError, setLastError] = useState<string | null>(null)
  const [keyCreditsNotice, setKeyCreditsNotice] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [outputText, setOutputText] = useState("")
  const [outputModelDisplay, setOutputModelDisplay] = useState("")
  const [outputKey, setOutputKey] = useState(0)
  const [tokenStatsPendingForId, setTokenStatsPendingForId] = useState<
    string | null
  >(null)
  const [progress, setProgress] = useState<SimplifyProgressSnapshot | null>(
    null
  )
  /** DAG for the in-flight run only; avoids live route flicker on 03 COMP. */
  const [activeRunDag, setActiveRunDag] = useState<
    SimplifyEngineDefinition["dag"] | null
  >(null)
  const [replay, setReplay] = useState<SimplifyReplay>(null)
  const replayFramesRef = useRef<SimplifyReplayFrame[]>([])
  const replayChunksRef = useRef<SimplifyReplayChunk[]>([])
  const replayStartRef = useRef<number>(0)
  const [throughputBus] = useState<ThroughputBus>(() => createThroughputBus())
  const [warnings, setWarnings] = useState<SimplifyWarning[]>([])
  const [outputFeedbackVote, setOutputFeedbackVote] = useState<
    "up" | "down" | null
  >(null)

  const outputRef = useRef("")
  const tokenCountRunIdRef = useRef<string | null>(null)
  const outputFeedbackLockedRef = useRef(false)

  const resetOutput = useCallback(() => {
    outputRef.current = ""
    setOutputText("")
    setOutputModelDisplay("")
    setCopied(false)
    tokenCountRunIdRef.current = null
    setTokenStatsPendingForId(null)
    setProgress(null)
    setActiveRunDag(null)
    setReplay(null)
    replayFramesRef.current = []
    replayChunksRef.current = []
    throughputBus.reset()
    setWarnings([])
    outputFeedbackLockedRef.current = false
    setOutputFeedbackVote(null)
    setStep("input")
  }, [setStep, throughputBus])

  const simplify = useCallback(async () => {
    const trimmed = rawInput.trim()
    if (!trimmed) return

    const startedAt = performance.now()
    const inputChars = rawInput.length
    const inputText = rawInput
    const inputPreview = previewText(rawInput, 120)

    setLastError(null)
    setKeyCreditsNotice(null)
    setCopied(false)
    setWarnings([])
    setProgress(null)
    setReplay(null)
    replayFramesRef.current = []
    replayChunksRef.current = []
    throughputBus.reset()
    replayStartRef.current = performance.now()
    outputFeedbackLockedRef.current = false
    setOutputFeedbackVote(null)
    setActiveRunDag(engine.dag)
    setStep("processing")

    const captureProgress = (snapshot: SimplifyProgressSnapshot) => {
      const timeMs = performance.now() - replayStartRef.current
      replayFramesRef.current.push({ timeMs, snapshot })
      setProgress(snapshot)
    }

    const captureChunk = (
      stepId: SimplifyPipelineStepId,
      chars: number,
      atMs: number
    ) => {
      throughputBus.report(stepId, chars, atMs)
      replayChunksRef.current.push({
        timeMs: atMs - replayStartRef.current,
        stepId,
        chars,
      })
    }

    try {
      const result = await engine.run({
        apiKey,
        input: inputText,
        resolvedModelId,
        onProgress: captureProgress,
        onChunk: captureChunk,
        provider: openRouterProvider,
        providerLatencyPolicy: openRouterLatencyPolicy,
        providerEndpoints: openRouterEndpoints,
      })
      const text = result.text
      const durationMs = performance.now() - startedAt

      console.info("[hunt] simplify run completed", {
        engineId: engine.id,
        resolvedModelId,
        inputChars: inputText.length,
        durationMs: Math.round(durationMs),
        providerOrder: openRouterProvider?.order ?? null,
        providerOnly: openRouterProvider?.only ?? null,
        allowFallbacks: openRouterProvider?.allow_fallbacks ?? null,
        requireParameters: openRouterProvider?.require_parameters ?? null,
        providerSort: openRouterProvider?.sort ?? null,
        preferredMaxLatency: openRouterProvider?.preferred_max_latency ?? null,
        preferredMinThroughput:
          openRouterProvider?.preferred_min_throughput ?? null,
        hedgeAfterMs: openRouterLatencyPolicy?.hedgeAfterMs ?? null,
        cancelAfterMs: openRouterLatencyPolicy?.cancelAfterMs ?? null,
        endpointCount: openRouterEndpoints?.length ?? 0,
        warningCount: result.warnings.length,
        costSpanCount: result.cost.spans.length,
      })

      outputRef.current = text
      setOutputText(text)
      setOutputModelDisplay(resolvedModelDisplay)
      setOutputKey((current) => current + 1)
      setWarnings(result.warnings)
      captureProgress(result.progress)
      const finalFrames = replayFramesRef.current
      const finalChunks = replayChunksRef.current
      const finalDuration =
        finalFrames.length > 0
          ? finalFrames[finalFrames.length - 1].timeMs
          : durationMs
      setReplay({
        engineId: engine.id,
        frames: finalFrames.slice(),
        chunks: finalChunks.slice(),
        durationMs: finalDuration,
      })

      // Local token fields below are heuristic estimates; billed prompt usage
      // stays sourced from OpenRouter cost spans when it is available.
      const compressorPromptTokens = sumCompressorPromptTokens(
        result.cost.spans
      )

      const next = addRecentResult({
        engineId: engine.id,
        inputPreview,
        output: text,
        inputChars,
        outputChars: text.length,
        durationMs,
        compressorPromptTokens,
        estimatedCostUsd: result.cost.estimatedCostUsd,
        reportedCostUsd: result.cost.reportedCostUsd,
        displayCostUsd: result.cost.displayCostUsd,
        costSource: result.cost.source,
        costSpans: result.cost.spans,
      })
      const newId = next[0]?.id

      setStats(getStats(next))
      clearRawInput()
      // Brief hold so the DAG's synthesis lane can visibly flatten before
      // the 04 OUTPUT screen takes over.
      await new Promise((resolve) => setTimeout(resolve, 320))
      setStep("output")
      setActiveRunDag(null)

      if (newId) {
        const countingForId = newId
        tokenCountRunIdRef.current = countingForId
        setTokenStatsPendingForId(countingForId)

        void estimateTokenCountsFastAsync([
          inputText,
          result.cleanedInput,
          text,
        ])
          .then(([pasteInputTokens, cleanedInputTokens, outputTokens]) => {
            if (tokenCountRunIdRef.current !== countingForId) return

            const updated = updateRecentResultTokens(countingForId, {
              pasteInputTokens,
              cleanedInputTokens,
              compressorPromptTokens,
              outputTokens,
              estimatedCostUsd: result.cost.estimatedCostUsd,
              reportedCostUsd: result.cost.reportedCostUsd,
              displayCostUsd: result.cost.displayCostUsd,
              costSource: result.cost.source,
              costSpans: result.cost.spans,
            })
            setStats(getStats(updated))
          })
          .catch(() => {
            // tokens remain undefined; strip shows … without char reduction
          })
          .finally(() => {
            if (tokenCountRunIdRef.current === countingForId) {
              tokenCountRunIdRef.current = null
            }
            setTokenStatsPendingForId((current) =>
              current === countingForId ? null : current
            )
          })
      }
    } catch (e) {
      console.error("[hunt] simplify run failed", e, {
        engineId: engine.id,
        inputChars: inputText.length,
        providerOrder: openRouterProvider?.order ?? null,
        providerOnly: openRouterProvider?.only ?? null,
        allowFallbacks: openRouterProvider?.allow_fallbacks ?? null,
        requireParameters: openRouterProvider?.require_parameters ?? null,
        providerSort: openRouterProvider?.sort ?? null,
        preferredMaxLatency: openRouterProvider?.preferred_max_latency ?? null,
        preferredMinThroughput:
          openRouterProvider?.preferred_min_throughput ?? null,
        hedgeAfterMs: openRouterLatencyPolicy?.hedgeAfterMs ?? null,
        cancelAfterMs: openRouterLatencyPolicy?.cancelAfterMs ?? null,
        endpointCount: openRouterEndpoints?.length ?? 0,
      })
      setActiveRunDag(null)
      if (e instanceof OpenRouterInsufficientCreditsError) {
        setKeyCreditsNotice(KEY_CREDITS_NOTICE)
        setStep("key")
        return
      }
      if (e instanceof OpenRouterLatencyTimeoutError) {
        setLastError(OPENROUTER_LATENCY_NOTICE)
        setStep("input")
        return
      }
      setLastError(e instanceof Error ? e.message : "Something went wrong.")
      setStep("input")
    }
  }, [
    apiKey,
    clearRawInput,
    engine,
    openRouterEndpoints,
    openRouterLatencyPolicy,
    openRouterProvider,
    rawInput,
    resolvedModelId,
    resolvedModelDisplay,
    setStats,
    setStep,
    throughputBus,
  ])

  const copyOutput = useCallback(async () => {
    if (!outputRef.current) return

    try {
      await navigator.clipboard.writeText(outputRef.current)

      const latest = getRecentResults()[0]
      const estimatedCostUsd = latest?.estimatedCostUsd

      emitUserRunMetric({
        modelDisplay: outputModelDisplay,
        feedbackAtCopy: outputFeedbackVote,
        ...(typeof estimatedCostUsd === "number" ? { estimatedCostUsd } : {}),
      })

      resetOutput()
    } catch {
      setLastError("Could not copy to clipboard.")
    }
  }, [outputFeedbackVote, outputModelDisplay, resetOutput])

  const discardOutput = useCallback(() => {
    resetOutput()
  }, [resetOutput])

  const submitOutputFeedback = useCallback(
    (vote: "up" | "down") => {
      if (outputFeedbackLockedRef.current) return
      outputFeedbackLockedRef.current = true
      console.log("[hunt] output feedback", { sentiment: vote })
      if (vote === "down") {
        const latest = getRecentResults()[0]
        const estimatedCostUsd = latest?.estimatedCostUsd
        emitUserRunDownvoteMetric({
          modelDisplay: outputModelDisplay,
          ...(typeof estimatedCostUsd === "number" ? { estimatedCostUsd } : {}),
        })
      }
      setOutputFeedbackVote(vote)
    },
    [outputModelDisplay]
  )

  const clearKeyCreditsNotice = useCallback(() => {
    setKeyCreditsNotice(null)
  }, [])

  return {
    keyCreditsNotice,
    clearKeyCreditsNotice,
    lastError,
    copied,
    outputText,
    outputModelDisplay,
    outputKey,
    tokenStatsPendingForId,
    progress,
    activeRunDag,
    replay,
    throughputBus,
    warnings,
    outputFeedbackVote,
    submitOutputFeedback,
    simplify,
    copyOutput,
    discardOutput,
  }
}
