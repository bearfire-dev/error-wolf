"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Dispatch, SetStateAction } from "react"

import type { HuntStep } from "@/lib/hunt-constants"
import type { OpenRouterPublicEndpoint } from "@/lib/openrouter/endpoints-types"
import { countTokens } from "@/lib/tokens/client"
import { getSimplifyEngine } from "@/lib/simplify/engines/registry"
import type {
  SimplifyEngineId,
  SimplifyEngineDefinition,
} from "@/lib/simplify/engines/types"
import type {
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
import { emitUserRunMetric } from "@/lib/sentry-product-metrics"
import {
  createThroughputBus,
  type SimplifyProgressSnapshot,
  type SimplifyWarning,
  type ThroughputBus,
} from "@/lib/simplify/stub"
import { OpenRouterInsufficientCreditsError } from "@/lib/simplify/openrouter-client"
import type { SimplifyPipelineStepId } from "@/lib/simplify/types"

const KEY_CREDITS_NOTICE =
  "OpenRouter reported insufficient credits. Add credits to your account or use a different API key."

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
  const copyTimeoutRef = useRef<number | null>(null)
  const tokenCountRunIdRef = useRef<string | null>(null)
  const outputFeedbackLockedRef = useRef(false)

  const resetOutput = useCallback(() => {
    if (copyTimeoutRef.current !== null) {
      window.clearTimeout(copyTimeoutRef.current)
      copyTimeoutRef.current = null
    }

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

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current !== null) {
        window.clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

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
        providerEndpoints: openRouterEndpoints,
      })
      const text = result.text
      const durationMs = performance.now() - startedAt

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

        void Promise.all([
          countTokens(inputText),
          countTokens(result.cleanedInput),
          countTokens(text),
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
        allowFallbacks: openRouterProvider?.allow_fallbacks ?? null,
      })
      setActiveRunDag(null)
      if (e instanceof OpenRouterInsufficientCreditsError) {
        setKeyCreditsNotice(KEY_CREDITS_NOTICE)
        setStep("key")
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
      setCopied(true)

      const latest = getRecentResults()[0]
      const estimatedCostUsd = latest?.estimatedCostUsd

      emitUserRunMetric({
        modelDisplay: outputModelDisplay,
        feedbackAtCopy: outputFeedbackVote,
        ...(typeof estimatedCostUsd === "number"
          ? { estimatedCostUsd }
          : {}),
      })

      if (copyTimeoutRef.current !== null) {
        window.clearTimeout(copyTimeoutRef.current)
      }

      copyTimeoutRef.current = window.setTimeout(() => {
        copyTimeoutRef.current = null
        resetOutput()
      }, 1200)
    } catch {
      setLastError("Could not copy to clipboard.")
    }
  }, [outputFeedbackVote, outputModelDisplay, resetOutput])

  const discardOutput = useCallback(() => {
    resetOutput()
  }, [resetOutput])

  const submitOutputFeedback = useCallback((vote: "up" | "down") => {
    if (outputFeedbackLockedRef.current) return
    outputFeedbackLockedRef.current = true
    console.log("[hunt] output feedback", { sentiment: vote })
    setOutputFeedbackVote(vote)
  }, [])

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
