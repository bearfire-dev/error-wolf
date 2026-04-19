"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ThumbsDownIcon, ThumbsUpIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { StackTraceExamplesDialog } from "@/components/stack-trace-examples-dialog"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  formatChars,
  formatUsdCost,
  formatDuration,
  formatTokens,
  getRecentResults,
  type RecentSimplifyResult,
  type SimplifyStats,
  type SimplifyStatsRow,
} from "@/lib/recent-results"
import { persistHuntComputeVersion } from "@/lib/hunt-compute-version"
import { persistHuntModelRouteId } from "@/lib/hunt-model-route"
import { getProgressElapsedMs } from "@/lib/simplify/progress"
import { getSimplifyEngine } from "@/lib/simplify/engines/registry"
import type {
  SimplifyEngineDefinition,
  SimplifyEngineId,
  SimplifyModelRouteOption,
  SimplifyResolvedModelRoute,
} from "@/lib/simplify/engines/types"
import {
  type SimplifyProgressSnapshot,
  type SimplifyWarning,
  type ThroughputBus,
} from "@/lib/simplify/stub"
import {
  HUNT_GITHUB_SOURCE_URL,
  HUNT_SENTRY_URL,
  HUNT_STEP_INDEX,
  HUNT_STEPS,
  STACK_TRACE_PLACEHOLDER,
  type HuntStep,
} from "@/lib/hunt-constants"
import type { StackTraceExample } from "@/lib/example-traces"
import {
  referencePromptUsd,
  type CostReferenceModel,
} from "@/lib/simplify/cost-reference-models"
import { cn } from "@/lib/utils"

import { ProcessingDag } from "./processing-dag"
import { ReplayDialog } from "./replay-dialog"
import { useCostReferenceModel } from "./use-cost-reference-model"
import { useHuntInputs } from "./use-hunt-inputs"
import { useHuntRoutingEstimate } from "./use-hunt-routing-estimate"
import { useHuntRun } from "./use-hunt-run"
import { useHuntSession } from "./use-hunt-session"
import { useOpenRouterProviderRouting } from "./use-openrouter-provider-routing"

export function HuntClient({
  stackTraceExamples,
}: {
  stackTraceExamples: StackTraceExample[]
}) {
  // User-editable values stay in one place; hooks own workflow/process state.
  const inputs = useHuntInputs()
  const routingEngine = getSimplifyEngine(
    getRoutingEngineIdForRoute(inputs.input.modelRouteId)
  )
  const selectedModelRouteId = routingEngine.modelRouteOptions.some(
    (option) => option.id === inputs.input.modelRouteId
  )
    ? inputs.input.modelRouteId
    : routingEngine.defaultModelRouteId
  const routingEstimate = useHuntRoutingEstimate(
    inputs.input.rawInput,
    routingEngine.id
  )
  const selectedModelRoute = routingEngine.resolveModelRoute(
    selectedModelRouteId,
    routingEstimate.inputTokens
  )
  const selectedModelDisplay = formatResolvedModelDisplay(selectedModelRoute)
  const resolvedEngine = getSimplifyEngine(selectedModelRoute.engineId)
  const session = useHuntSession({
    apiKey: inputs.input.apiKey,
    hydrateInput: inputs.hydrate,
    setApiKey: inputs.setApiKey,
    clearApiKey: inputs.clearApiKey,
  })
  const openRouterRouting = useOpenRouterProviderRouting({
    apiKey: inputs.input.apiKey,
    enabled: session.keyOk,
    routingModelId: selectedModelRoute.modelId,
    e2eTokenEstimate: routingEstimate.totalTokens ?? undefined,
  })
  const run = useHuntRun({
    rawInput: inputs.input.rawInput,
    apiKey: inputs.input.apiKey,
    engineId: resolvedEngine.id,
    resolvedModelId: selectedModelRoute.modelId,
    resolvedModelDisplay: selectedModelDisplay,
    openRouterProvider: openRouterRouting.providerPreferences,
    openRouterEndpoints: openRouterRouting.endpoints,
    clearRawInput: inputs.clearRawInput,
    setStep: session.setStep,
    setStats: session.setStats,
  })
  const clearKeyCreditsNotice = run.clearKeyCreditsNotice
  const updateApiKey = session.updateApiKey
  const clearKey = session.clearKey

  const handleKeyApiKeyChange = useCallback(
    (value: string) => {
      clearKeyCreditsNotice()
      updateApiKey(value)
    },
    [clearKeyCreditsNotice, updateApiKey]
  )

  const handleClearKey = useCallback(() => {
    clearKeyCreditsNotice()
    clearKey()
  }, [clearKey, clearKeyCreditsNotice])

  const replayEngine = run.replay
    ? getSimplifyEngine(run.replay.engineId)
    : null
  const handleModelRouteChange = (modelRouteId: string) => {
    const nextEngineId = getRoutingEngineIdForRoute(modelRouteId)
    inputs.setEngineId(nextEngineId)
    inputs.setModelRouteId(modelRouteId)
    persistHuntComputeVersion(nextEngineId)
    persistHuntModelRouteId(modelRouteId)
  }

  const [replayOpen, setReplayOpen] = useState(false)
  const replayAvailable = Boolean(
    run.replay && run.replay.frames.length > 0 && session.step === "output"
  )

  const autoCompressBlocked =
    selectedModelRouteId === "auto" && routingEstimate.inputTokens === null

  useEffect(() => {
    if (session.step !== "key") {
      clearKeyCreditsNotice()
    }
  }, [clearKeyCreditsNotice, session.step])

  if (!session.ready) {
    return (
      <p className="font-mono text-xs text-muted-foreground">
        &gt; loading<span className="blink">_</span>
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <StepIndicator
        current={session.step}
        onKeyStepClick={() => session.setStep("key")}
        onInputFromOutputClick={run.discardOutput}
        onProcessingStepClick={
          replayAvailable ? () => setReplayOpen(true) : undefined
        }
      />
      {run.replay && (
        <ReplayDialog
          open={replayOpen}
          onOpenChange={setReplayOpen}
          frames={run.replay.frames}
          chunks={run.replay.chunks}
          durationMs={run.replay.durationMs}
          dag={replayEngine?.dag ?? resolvedEngine.dag}
        />
      )}

      <div className="relative aspect-[5/7] w-full border border-foreground/15 bg-card dark:bg-card/40">
        <div
          key={session.step}
          className={cn(
            "absolute inset-0 min-h-0 animate-in overflow-y-auto p-6 fade-in-0 slide-in-from-bottom-1 sm:p-8",
            session.step === "processing" || session.step === "output"
              ? "duration-500"
              : "duration-200"
          )}
        >
          {session.step === "key" && (
            <KeyStep
              apiKey={inputs.input.apiKey}
              setApiKey={handleKeyApiKeyChange}
              creditsNotice={run.keyCreditsNotice}
              verifying={session.verifying}
              verifyState={session.verifyState}
              verifyMessage={session.verifyMessage}
              onVerify={() => void session.verifyKey()}
              onClear={handleClearKey}
            />
          )}

          {session.step === "input" && (
            <InputStep
              rawInput={inputs.input.rawInput}
              setRawInput={inputs.setRawInput}
              stackTraceExamples={stackTraceExamples}
              disabled={!session.keyOk}
              lastError={run.lastError}
              selectedModelRouteId={selectedModelRouteId}
              modelRouteOptions={routingEngine.modelRouteOptions}
              onModelRouteChange={handleModelRouteChange}
              routingStatus={buildRoutingStatus({
                enabled: session.keyOk,
                estimating: routingEstimate.estimating,
                inputTokens: routingEstimate.inputTokens,
                totalTokens: routingEstimate.totalTokens,
                latencyLeader:
                  openRouterRouting.rankings.byLatency[0]?.slug ?? null,
                throughputLeader:
                  openRouterRouting.rankings.byThroughput[0]?.slug ?? null,
                error: openRouterRouting.error,
              })}
              onSimplify={() => void run.simplify()}
              onEditKey={() => session.setStep("key")}
              keyOk={session.keyOk}
              compressBlocked={autoCompressBlocked}
            />
          )}

          {session.step === "processing" && (
            <ProcessingStep
              progress={run.progress}
              dag={run.activeRunDag ?? resolvedEngine.dag}
              bus={run.throughputBus}
            />
          )}

          {session.step === "output" && session.stats.current && (
            <OutputStep
              key={run.outputKey}
              outputText={run.outputText}
              modelDisplay={run.outputModelDisplay}
              copied={run.copied}
              warnings={run.warnings}
              feedbackVote={run.outputFeedbackVote}
              onFeedbackVote={run.submitOutputFeedback}
              onCopy={() => void run.copyOutput()}
            />
          )}
        </div>
      </div>

      <StatsStrip
        stats={session.stats}
        step={session.step}
        tokenStatsPendingForId={run.tokenStatsPendingForId}
      />
    </div>
  )
}

function StepIndicator({
  current,
  onKeyStepClick,
  onInputFromOutputClick,
  onProcessingStepClick,
}: {
  current: HuntStep
  onKeyStepClick: () => void
  onInputFromOutputClick: () => void
  onProcessingStepClick?: () => void
}) {
  const currentIdx = HUNT_STEP_INDEX[current]
  const stepControlClass =
    "inline-flex cursor-pointer items-center gap-1.5 rounded-sm text-inherit uppercase outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background"

  return (
    <ol
      role="list"
      className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 font-mono text-[0.6875rem] tracking-wider uppercase tabular-nums"
    >
      {HUNT_STEPS.map((s, idx) => {
        const isActive = s.id === current
        const isDone = idx < currentIdx
        const liClass = cn(
          "inline-flex items-center gap-1.5 transition-colors",
          isActive && "text-primary",
          !isActive && isDone && "text-foreground/70",
          !isActive && !isDone && "text-muted-foreground/40"
        )
        const labelParts = (
          <>
            <span aria-hidden>[</span>
            <span className="uppercase">{s.label}</span>
            <span aria-hidden>]</span>
          </>
        )

        const isKeyStep = s.id === "key"
        const isInputStep = s.id === "input"
        const isProcessingStep = s.id === "processing"
        const keyClickable = isKeyStep && current !== "processing"
        const inputClickableFromOutput = isInputStep && current === "output"
        const processingClickable =
          isProcessingStep && Boolean(onProcessingStepClick)

        return (
          <li
            key={s.id}
            aria-current={isActive ? "step" : undefined}
            className={liClass}
          >
            {keyClickable ? (
              <button
                type="button"
                onClick={onKeyStepClick}
                className={stepControlClass}
                aria-label="Edit API key"
              >
                {labelParts}
              </button>
            ) : inputClickableFromOutput ? (
              <button
                type="button"
                onClick={onInputFromOutputClick}
                className={stepControlClass}
                aria-label="Try again with new input"
              >
                {labelParts}
              </button>
            ) : processingClickable ? (
              <button
                type="button"
                onClick={onProcessingStepClick}
                className={stepControlClass}
                aria-label="Replay processing"
                title="Replay processing"
              >
                {labelParts}
              </button>
            ) : (
              labelParts
            )}
          </li>
        )
      })}
    </ol>
  )
}

function KeyStep({
  apiKey,
  setApiKey,
  creditsNotice,
  verifying,
  verifyState,
  verifyMessage,
  onVerify,
  onClear,
}: {
  apiKey: string
  setApiKey: (value: string) => void
  creditsNotice: string | null
  verifying: boolean
  verifyState: "idle" | "ok" | "bad"
  verifyMessage: string | null
  onVerify: () => void
  onClear: () => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {creditsNotice && (
        <div
          role="alert"
          className="shrink-0 rounded-sm border border-destructive/35 bg-destructive/5 p-3 font-mono text-[0.6875rem] leading-relaxed text-pretty text-foreground normal-case"
        >
          {creditsNotice}
        </div>
      )}
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-xs text-foreground">
          <span className="text-primary">&gt;&nbsp;</span>openrouter key
        </p>
        {verifyState === "ok" && (
          <span className="font-mono text-[0.625rem] tracking-wider text-primary uppercase">
            [ok]
          </span>
        )}
        {verifyState === "bad" && (
          <span
            role="alert"
            className="font-mono text-[0.625rem] tracking-wider text-destructive uppercase"
          >
            [fail]
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="openrouter-key">api key</Label>
        <Input
          id="openrouter-key"
          name="openrouter-key"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-or-v1-…"
          className="max-sm:text-base"
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-b border-foreground/10 py-4">
          <p className="font-mono text-[0.625rem] leading-relaxed text-pretty text-muted-foreground normal-case">
            Your key and processing data is sent directly from your browser to
            OpenRouter (and their providers), including multiple compression
            passes per run. We do not collect it.
          </p>
          <p className="mt-3 font-mono text-[0.625rem] leading-relaxed text-pretty text-muted-foreground normal-case">
            We use{" "}
            <a
              href={HUNT_SENTRY_URL}
              target="_blank"
              rel="noreferrer"
              className="text-foreground/85 underline underline-offset-2 hover:text-primary"
            >
              Sentry
            </a>{" "}
            in privacy mode for basic usage, performance, and error collection.
          </p>
          <p className="mt-3 font-mono text-[0.625rem] leading-relaxed text-pretty text-muted-foreground normal-case">
            This site is open source under the O&apos;Saasy License. You can
            audit/run the code for yourself by visiting our{" "}
            <a
              href={HUNT_GITHUB_SOURCE_URL}
              target="_blank"
              rel="noreferrer"
              className="text-foreground/85 underline underline-offset-2 hover:text-primary"
            >
              GitHub
            </a>
            .
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            disabled={verifying || !apiKey.trim()}
            onClick={onVerify}
          >
            {verifying ? "[ verifying… ]" : "[ verify ]"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClear}
            disabled={!apiKey}
          >
            clear
          </Button>
        </div>
        {verifyMessage && (
          <p
            role="alert"
            className="font-mono text-[0.625rem] tracking-wider text-destructive uppercase"
          >
            [fail] {verifyMessage}
          </p>
        )}
      </div>
    </div>
  )
}

function InputStep({
  rawInput,
  setRawInput,
  stackTraceExamples,
  disabled,
  lastError,
  selectedModelRouteId,
  modelRouteOptions,
  onModelRouteChange,
  routingStatus,
  onSimplify,
  onEditKey,
  keyOk,
  compressBlocked,
}: {
  rawInput: string
  setRawInput: (v: string) => void
  stackTraceExamples: StackTraceExample[]
  disabled: boolean
  lastError: string | null
  selectedModelRouteId: string
  modelRouteOptions: readonly SimplifyModelRouteOption[]
  onModelRouteChange: (modelRouteId: string) => void
  routingStatus: { tone: "muted" | "ok" | "warn"; text: string } | null
  onSimplify: () => void
  onEditKey: () => void
  keyOk: boolean
  compressBlocked: boolean
}) {
  const canCompress =
    !disabled && rawInput.trim().length > 0 && !compressBlocked
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <p className="font-mono text-xs text-foreground">
          <span className="text-primary">&gt;&nbsp;</span>paste stack traces
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <StackTraceExamplesDialog
            examples={stackTraceExamples}
            onLoadExample={setRawInput}
          />
          {!keyOk && (
            <button
              type="button"
              onClick={onEditKey}
              className="font-mono text-[0.625rem] tracking-wider text-destructive uppercase underline-offset-2 hover:underline"
            >
              [fail] no key
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <Textarea
          id="error-input"
          name="error-input"
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.shiftKey && canCompress) {
              e.preventDefault()
              onSimplify()
            }
          }}
          placeholder={STACK_TRACE_PLACEHOLDER}
          className="no-scrollbar min-h-0 flex-1 overflow-y-auto max-sm:text-base"
          autoFocus
        />
      </div>

      {lastError && (
        <p
          role="alert"
          className="shrink-0 font-mono text-[0.6875rem] tracking-wider text-destructive uppercase"
        >
          [fail] {lastError}
        </p>
      )}

      <div
        className={cn(
          "flex w-full min-w-0 shrink-0 flex-wrap items-center gap-x-4 gap-y-2",
          !lastError && "mt-6"
        )}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <Button type="button" disabled={!canCompress} onClick={onSimplify}>
            [ hunt ]
          </Button>
          <span className="font-mono text-[0.625rem] tracking-wider text-muted-foreground uppercase">
            shift+enter
          </span>
        </div>
        <div className="ml-auto shrink-0">
          <Select
            value={selectedModelRouteId}
            onValueChange={onModelRouteChange}
          >
            <SelectTrigger
              aria-label="Model routing"
              className="h-7 min-w-[4.75rem] py-0 text-[0.625rem] normal-case"
            >
              {modelRouteOptions.find(
                (option) => option.id === selectedModelRouteId
              )?.label ?? selectedModelRouteId}
            </SelectTrigger>
            <SelectContent align="end">
              {modelRouteOptions.map((option) => (
                <SelectItem
                  key={option.id}
                  value={option.id}
                  className="normal-case"
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {routingStatus && (
        <Dialog>
          <DialogTrigger
            className={cn(
              "w-full border-0 bg-transparent p-0 text-left font-mono text-[0.625rem] tracking-wider uppercase",
              routingStatus.tone === "ok" && "text-primary",
              routingStatus.tone === "warn" &&
                "text-amber-600 dark:text-amber-400",
              routingStatus.tone === "muted" && "text-muted-foreground",
              "cursor-pointer underline-offset-4 hover:underline",
              "focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
            )}
            aria-label="How provider routing is estimated; opens details"
          >
            {routingStatus.text}
          </DialogTrigger>
          <DialogContent className="max-w-md sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Net-fastest providers</DialogTitle>
              <div className="pt-1">
                <ul className="list-disc space-y-1 pl-4 text-left text-sm leading-snug text-muted-foreground marker:text-muted-foreground/80">
                  <li>
                    We call OpenRouter with{" "}
                    <span className="text-foreground">your API key</span> to
                    read current provider stats for this model.
                  </li>
                  <li>
                    We rank by{" "}
                    <span className="text-foreground">net fastest</span> here:{" "}
                    <span className="text-foreground">latency</span> and{" "}
                    <span className="text-foreground">throughput</span>{" "}
                    together, not time-to-first-token alone.
                  </li>
                </ul>
              </div>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function ProcessingStep({
  progress,
  dag,
  bus,
}: {
  progress: SimplifyProgressSnapshot | null
  dag: SimplifyEngineDefinition["dag"]
  bus?: ThroughputBus | null
}) {
  const [now, setNow] = useState(() =>
    typeof performance !== "undefined" ? performance.now() : Date.now()
  )

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(
        typeof performance !== "undefined" ? performance.now() : Date.now()
      )
    }, 80)
    return () => window.clearInterval(id)
  }, [])

  const elapsed = progress ? getProgressElapsedMs(progress, now) : 0
  const allSettled =
    progress !== null &&
    progress.steps.every(
      (s) =>
        s.status === "success" || s.status === "warning" || s.status === "error"
    )

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex shrink-0 items-baseline justify-between gap-3">
        <p className="font-mono text-xs text-foreground">
          <span className="text-primary">&gt;&nbsp;</span>
          {allSettled ? "compressed" : "compressing"}
          {!allSettled && <span className="blink">…</span>}
        </p>
        <p className="font-mono text-[0.625rem] tracking-wider text-muted-foreground uppercase tabular-nums">
          elapsed {formatDuration(elapsed)}
        </p>
      </div>

      <ProcessingDag progress={progress} dag={dag} nowMs={now} bus={bus} />
    </div>
  )
}

function OutputStep({
  outputText,
  modelDisplay,
  copied,
  warnings,
  feedbackVote,
  onFeedbackVote,
  onCopy,
}: {
  outputText: string
  modelDisplay: string
  copied: boolean
  warnings: SimplifyWarning[]
  feedbackVote: "up" | "down" | null
  onFeedbackVote: (vote: "up" | "down") => void
  onCopy: () => void
}) {
  const copyClickTimerRef = useRef<number | null>(null)
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  useEffect(() => {
    return () => {
      if (copyClickTimerRef.current !== null) {
        window.clearTimeout(copyClickTimerRef.current)
      }
    }
  }, [])

  const modelDescriptor =
    modelDisplay &&
    (modelDisplay.endsWith(RESOLVED_MODEL_AUTO_DISPLAY_SUFFIX) ? (
      <>
        {` model: ${modelDisplay.slice(0, -RESOLVED_MODEL_AUTO_DISPLAY_SUFFIX.length)}`}{" "}
        <span className="text-primary">(</span>
        {RESOLVED_MODEL_AUTO_INNER}
        <span className="text-primary">)</span>
      </>
    ) : (
      ` model: ${modelDisplay}`
    ))

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-baseline gap-3">
        <p className="font-mono text-xs text-foreground">
          <span className="text-primary">&gt;&nbsp;</span>
          result ready
          {modelDisplay ? (
            <>
              {" "}
              <span className="text-primary">{"//"}</span>
              {modelDescriptor}
            </>
          ) : null}
        </p>
      </div>

      {warnings.length > 0 && (
        <ul className="flex shrink-0 flex-col gap-1 font-mono text-[0.625rem] tracking-wider text-amber-600 uppercase dark:text-amber-400">
          {warnings.map((warning) => (
            <li key={`${warning.stepId}-${warning.message}`}>
              [warn] {warning.message}
            </li>
          ))}
        </ul>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <Textarea
          readOnly
          tabIndex={0}
          value={outputText}
          aria-label="Simplified output. Click to copy and return to input."
          className="no-scrollbar min-h-0 flex-1 cursor-pointer overflow-y-auto max-sm:text-base"
          onDoubleClick={() => {
            if (copyClickTimerRef.current !== null) {
              window.clearTimeout(copyClickTimerRef.current)
              copyClickTimerRef.current = null
            }
          }}
          onClick={(e) => {
            const el = e.currentTarget
            if (copyClickTimerRef.current !== null) {
              window.clearTimeout(copyClickTimerRef.current)
              copyClickTimerRef.current = null
            }
            copyClickTimerRef.current = window.setTimeout(() => {
              copyClickTimerRef.current = null
              if (el.selectionStart !== el.selectionEnd) return
              void onCopy()
            }, 280)
          }}
        />
      </div>

      <div className="mt-6 flex w-full min-w-0 shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <Button type="button" onClick={() => void onCopy()}>
            {copied ? "[ copied ]" : "[ copy ]"}
          </Button>
        </div>
        <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2">
          {feedbackVote === null && (
            <ButtonGroup>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="This output was helpful"
                onClick={() => {
                  onFeedbackVote("up")
                  setFeedbackOpen(false)
                }}
              >
                <HugeiconsIcon icon={ThumbsUpIcon} strokeWidth={2} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="This output was not helpful"
                onClick={() => onFeedbackVote("down")}
              >
                <HugeiconsIcon icon={ThumbsDownIcon} strokeWidth={2} />
              </Button>
            </ButtonGroup>
          )}
          {feedbackVote === "down" && (
            <div className="animate-in duration-200 fade-in-0 slide-in-from-right-2">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setFeedbackOpen(true)}
              >
                leave feedback
              </Button>
            </div>
          )}
        </div>
      </div>

      <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>Feedback</DialogTitle>
            <DialogDescription>
              Placeholder — this dialog will be replaced with a real feedback
              flow later.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function buildRoutingStatus({
  enabled,
  estimating,
  inputTokens,
  totalTokens,
  latencyLeader,
  throughputLeader,
  error,
}: {
  enabled: boolean
  estimating: boolean
  inputTokens: number | null
  totalTokens: number | null
  latencyLeader: string | null
  throughputLeader: string | null
  error: string | null
}): { tone: "muted" | "ok" | "warn"; text: string } | null {
  if (!enabled) return null

  if (error) {
    return {
      tone: "warn",
      text: `[route] unavailable · ${error}`,
    }
  }

  if (estimating && (inputTokens === null || totalTokens === null)) {
    return {
      tone: "muted",
      text: `[route] estimating token budget…`,
    }
  }

  if (!throughputLeader || !latencyLeader) {
    return {
      tone: "muted",
      text: `[route] waiting for provider rankings…`,
    }
  }

  return {
    tone: "ok",
    text: `[route] ${throughputLeader} / ${latencyLeader}`,
  }
}

function getRoutingEngineIdForRoute(modelRouteId: string): SimplifyEngineId {
  return modelRouteId === "v1-mini" ? "v1-mini" : "v1"
}

/** Parenthetical when route is auto; inner word stays default color in OutputStep, parens use text-primary. */
const RESOLVED_MODEL_AUTO_INNER = "auto"
const RESOLVED_MODEL_AUTO_DISPLAY_SUFFIX = ` (${RESOLVED_MODEL_AUTO_INNER})`

function formatResolvedModelDisplay(
  modelRoute: SimplifyResolvedModelRoute
): string {
  return modelRoute.routeId === "auto"
    ? `${modelRoute.modelLabel}${RESOLVED_MODEL_AUTO_DISPLAY_SUFFIX}`
    : modelRoute.modelLabel
}

type VersusReferenceSavings =
  | { kind: "pending" }
  | { kind: "ok"; savingsUsd: number; pct: number }
  | { kind: "over"; overUsd: number; pct: number }
  | { kind: "unavailable" }

/**
 * Prompt-only reference list price: (cost to paste original as context) − (cost to paste
 * compressed as context) − OpenRouter compression spend. Not a full chat completion on
 * the reference model (no assumed reply tokens).
 */
function savingsVersusReference(
  viewRun: boolean,
  row: SimplifyStatsRow,
  recent: RecentSimplifyResult[],
  model: CostReferenceModel,
  runTokensPending: boolean
): VersusReferenceSavings {
  if (runTokensPending) return { kind: "pending" }

  if (viewRun) {
    const pasteTok = row.pasteInputTokens ?? row.inputTokens
    if (pasteTok === undefined || row.outputTokens === undefined) {
      return { kind: "unavailable" }
    }
    const refFull = referencePromptUsd(model, pasteTok)
    const refAfter = referencePromptUsd(model, row.outputTokens)
    const toolUsd = row.displayCostUsd ?? row.estimatedCostUsd
    if (toolUsd === undefined || refFull <= 0) {
      return { kind: "unavailable" }
    }
    const savingsUsd = refFull - refAfter - toolUsd
    const pct = Math.round((savingsUsd / refFull) * 100)
    if (savingsUsd >= 0) return { kind: "ok", savingsUsd, pct }
    return {
      kind: "over",
      overUsd: -savingsUsd,
      pct: Math.round((-savingsUsd / refFull) * 100),
    }
  }

  let refFullSum = 0
  let refAfterSum = 0
  let toolUsd = 0
  let compared = 0
  for (const e of recent) {
    const pasteTok = e.pasteInputTokens ?? e.inputTokens
    if (pasteTok === undefined || e.outputTokens === undefined) continue
    const t = e.displayCostUsd ?? e.estimatedCostUsd
    if (t === undefined) continue
    refFullSum += referencePromptUsd(model, pasteTok)
    refAfterSum += referencePromptUsd(model, e.outputTokens)
    toolUsd += t
    compared += 1
  }
  if (compared === 0 || refFullSum <= 0) return { kind: "unavailable" }
  const savingsUsd = refFullSum - refAfterSum - toolUsd
  const pct = Math.round((savingsUsd / refFullSum) * 100)
  if (savingsUsd >= 0) return { kind: "ok", savingsUsd, pct }
  return {
    kind: "over",
    overUsd: -savingsUsd,
    pct: Math.round((-savingsUsd / refFullSum) * 100),
  }
}

function StatsStrip({
  stats,
  step,
  tokenStatsPendingForId,
}: {
  stats: SimplifyStats
  step: HuntStep
  tokenStatsPendingForId: string | null
}) {
  const { model: referenceModel, cycleReferenceModel } = useCostReferenceModel()
  const liveOnOutput = step === "output"
  const [viewRun, setViewRun] = useState(() => liveOnOutput)
  const prevStepRef = useRef<HuntStep>(step)
  useEffect(() => {
    if (prevStepRef.current !== "output" && step === "output") {
      setViewRun(true)
    }
    if (prevStepRef.current !== "input" && step === "input") {
      setViewRun(false)
    }
    prevStepRef.current = step
  }, [step])
  const recentEntries = getRecentResults()
  const row = viewRun ? stats.current : stats.all
  if (!row) return null

  const pasteTok = row.pasteInputTokens ?? row.inputTokens
  const cleanedTok = row.cleanedInputTokens
  const billedPromptTok = row.compressorPromptTokens
  const canSplitIn =
    billedPromptTok !== undefined &&
    pasteTok !== undefined &&
    cleanedTok !== undefined
  const promptOverheadTok =
    billedPromptTok !== undefined && cleanedTok !== undefined
      ? Math.max(0, billedPromptTok - cleanedTok)
      : undefined
  const hasPasteOutTokens =
    pasteTok !== undefined && row.outputTokens !== undefined
  const runTokensPending =
    liveOnOutput &&
    viewRun &&
    tokenStatsPendingForId !== null &&
    !hasPasteOutTokens

  const inValue = runTokensPending ? (
    billedPromptTok !== undefined ? (
      <>
        {formatTokens(billedPromptTok)}{" "}
        <span className="text-muted-foreground/80">TOK</span>
      </>
    ) : (
      <span className="blink">…</span>
    )
  ) : canSplitIn ? (
    <span className="normal-case">
      {formatTokens(pasteTok)}{" "}
      <span className="text-muted-foreground/90">+</span>{" "}
      {formatTokens(promptOverheadTok ?? 0)}{" "}
      <span className="text-muted-foreground/80">TOK</span>
    </span>
  ) : billedPromptTok !== undefined ? (
    <>
      {formatTokens(billedPromptTok)}{" "}
      <span className="text-muted-foreground/80">TOK</span>
    </>
  ) : pasteTok !== undefined ? (
    <>
      {formatTokens(pasteTok)}{" "}
      <span className="text-muted-foreground/80">TOK</span>
    </>
  ) : viewRun && liveOnOutput ? (
    "…"
  ) : (
    <>
      {formatChars(row.inputChars)}{" "}
      <span className="text-muted-foreground/80">chr</span>
    </>
  )
  const outValue = runTokensPending ? (
    <span className="blink">…</span>
  ) : hasPasteOutTokens ? (
    <>
      {formatTokens(row.outputTokens!)}{" "}
      <span className="text-muted-foreground/80">TOK</span>
    </>
  ) : viewRun && liveOnOutput ? (
    "…"
  ) : (
    <>
      {formatChars(row.outputChars)}{" "}
      <span className="text-muted-foreground/80">chr</span>
    </>
  )

  const reduction =
    viewRun && liveOnOutput && !hasPasteOutTokens
      ? undefined
      : hasPasteOutTokens
        ? row.reductionTokensPct
        : row.reductionPct
  const tone = reductionTone(reduction)

  const reductionBasis: "TOK" | "chr" | null = runTokensPending
    ? null
    : hasPasteOutTokens
      ? "TOK"
      : viewRun && liveOnOutput
        ? null
        : "chr"

  const reductionContent = runTokensPending ? (
    <span className="blink">…</span>
  ) : reductionBasis ? (
    <>
      {formatReduction(reduction)}{" "}
      <span className="text-muted-foreground/80">{reductionBasis}</span>
    </>
  ) : (
    formatReduction(reduction)
  )

  const versusSavings = savingsVersusReference(
    viewRun,
    row,
    recentEntries,
    referenceModel,
    runTokensPending
  )

  const costSourceHint =
    row.costSource === "estimated"
      ? "est"
      : row.costSource === "mixed"
        ? "mix"
        : null

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 font-mono text-[0.625rem] text-muted-foreground tabular-nums",
        "rounded-md border border-border/50 bg-background/95 px-3 py-1.5 shadow-sm",
        "dark:border-0 dark:bg-transparent dark:px-0 dark:py-0 dark:shadow-none"
      )}
      title={
        viewRun
          ? undefined
          : `All ${stats.count} run${stats.count === 1 ? "" : "s"}: Σ duration; IN shows Σ pasted input + Σ max(0, billed IN − Σ cleaned-trace tokens); remainder is system, templates, prompt wrappers, and multi-call overhead (approximate for v1). OUT is Σ output tokens. Cost is total USD (Σ). Savings use original-paste vs compressed-output token counts (prompt-only reference list price, no reply) minus compression spend. TOK reduction % is user paste vs output (not IN vs OUT); it sums paste/output only for runs that have both counts.`
      }
    >
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 tracking-wider uppercase">
        <button
          type="button"
          className={cn(
            "cursor-pointer rounded-sm border-0 bg-transparent p-0 font-mono tracking-wider text-primary uppercase transition-colors outline-none",
            "hover:text-primary/85",
            "focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          )}
          onClick={() => setViewRun((v) => !v)}
          aria-pressed={viewRun}
          aria-label={
            viewRun
              ? "Showing this run. Activate for aggregate stats across all stored runs."
              : "Showing all stored runs: duration and token counts are summed across runs; cost is total across runs. Activate for this run."
          }
        >
          {viewRun ? "run" : "all"}
        </button>
        <span>dur {formatDuration(row.durationMs)}</span>
        <span aria-hidden>&middot;</span>
        <span
          title={
            canSplitIn
              ? "First number: tokenizer count of your pasted input (raw). After +: max(0, billed prompt − tokenizer count of the normalized trace body sent to the model). That remainder includes system prompts, templates, wrappers, and extra billed prompt from multiple LLM calls (v1); paste + remainder does not always equal billed IN. TOK reduction and savings below compare pasted input vs output."
              : billedPromptTok !== undefined
                ? "IN: OpenRouter billed prompt tokens (Σ LLM calls). TOK reduction and savings below use your original paste vs output token counts."
                : undefined
          }
        >
          in {inValue}
        </span>
        <span aria-hidden>&middot;</span>
        <span>out {outValue}</span>
        <span aria-hidden>&middot;</span>
        <span
          className={cn(tone === "bad" && "text-destructive")}
          title={
            reductionBasis === "TOK"
              ? "Change from your pasted input token count to the compressed output token count (not billed prompt IN vs OUT)."
              : reductionBasis === "chr"
                ? "Change from pasted input size to output size in characters."
                : undefined
          }
        >
          {reductionContent}
        </span>
      </div>
      <div
        className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 tracking-wider"
        title={
          viewRun
            ? "This run: reference prompt-only list price on your full paste minus reference prompt-only price on the compressed output, minus this hunt’s OpenRouter cost. Does not include a hypothetical reply from the reference model."
            : "All qualifying runs: same formula per run, then aggregated. Reference side is prompt tokens only (context), not a full chat completion. Compression cost is summed; per-run data must include token counts and display cost."
        }
      >
        {versusSavings.kind === "pending" ? (
          <span className="inline-flex flex-wrap items-center justify-center gap-x-1 uppercase">
            <span>save</span>
            <span className="blink">…</span>
            <span className="text-muted-foreground/80">(—%)</span>
            <span className="normal-case">ON</span>
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent p-0 font-mono text-[0.625rem] font-medium tracking-wide text-primary underline-offset-4 hover:underline"
              onClick={cycleReferenceModel}
              aria-label={`Compare to ${referenceModel.label}; click to switch reference model`}
            >
              {referenceModel.label.toUpperCase()}
            </button>
          </span>
        ) : versusSavings.kind === "ok" ? (
          <span className="inline-flex flex-wrap items-center justify-center gap-x-1 uppercase">
            <span>
              save {formatUsdCost(versusSavings.savingsUsd)}
              <span className="text-muted-foreground/80">
                {" "}
                ({versusSavings.pct}%)
              </span>
              {costSourceHint ? (
                <span className="text-muted-foreground/80">
                  {" "}
                  {costSourceHint}
                </span>
              ) : null}
            </span>
            <span className="normal-case">ON</span>
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent p-0 font-mono text-[0.625rem] font-medium tracking-wide text-primary underline-offset-4 hover:underline"
              onClick={cycleReferenceModel}
              aria-label={`Compare to ${referenceModel.label}; click to switch reference model`}
            >
              {referenceModel.label.toUpperCase()}
            </button>
          </span>
        ) : versusSavings.kind === "over" ? (
          <span className="inline-flex flex-wrap items-center justify-center gap-x-1 uppercase">
            <span className="text-destructive">
              +{formatUsdCost(versusSavings.overUsd)} over
              <span className="text-muted-foreground/80">
                {" "}
                ({versusSavings.pct}%)
              </span>
              {costSourceHint ? (
                <span className="text-muted-foreground/80">
                  {" "}
                  {costSourceHint}
                </span>
              ) : null}
            </span>
            <span className="normal-case">ON</span>
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent p-0 font-mono text-[0.625rem] font-medium tracking-wide text-primary underline-offset-4 hover:underline"
              onClick={cycleReferenceModel}
              aria-label={`Compare to ${referenceModel.label}; click to switch reference model`}
            >
              {referenceModel.label.toUpperCase()}
            </button>
          </span>
        ) : (
          <span className="inline-flex flex-wrap items-center justify-center gap-x-1 uppercase">
            <span className="text-muted-foreground/80 normal-case">— ON</span>
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent p-0 font-mono text-[0.625rem] font-medium tracking-wide text-primary underline-offset-4 hover:underline"
              onClick={cycleReferenceModel}
              aria-label={`Compare to ${referenceModel.label}; click to switch reference model`}
            >
              {referenceModel.label.toUpperCase()}
            </button>
          </span>
        )}
      </div>
      {versusSavings.kind === "over" ? (
        <Dialog>
          <DialogTrigger
            className={cn(
              "border-0 bg-transparent p-0 font-mono text-[0.625rem] font-medium tracking-wide",
              "text-primary underline-offset-4 hover:underline",
              "focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
            )}
          >
            RECOMMENDATIONS
          </DialogTrigger>
          <DialogContent className="max-w-md sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>When error-wolf costs more</DialogTitle>
              <div className="pt-1">
                <ul className="list-disc space-y-1 pl-4 text-left text-sm leading-snug text-muted-foreground marker:text-muted-foreground/80">
                  <li>
                    For this error stack, you paid more than you would have
                    without error-wolf (openrouter cost + cost of error-wolf
                    output is greater then the estimated original cost)
                  </li>
                  <li>
                    For small error stacks, it is often cheaper to pass them in
                    directly to the model.
                  </li>
                  <li>
                    error-wolf still cleans up the stack and simplifies the
                    model context... so its not a total loss.
                  </li>
                  <li>
                    We recommend you use the Auto mode or a smaller version of
                    error-wolf for similar prompts in the future.
                  </li>
                </ul>
              </div>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}

function reductionTone(pct: number | undefined): "good" | "bad" | "muted" {
  if (pct === undefined || pct === 0) return "muted"
  return pct < 0 ? "good" : "bad"
}

function formatReduction(pct: number | undefined): string {
  if (pct === undefined) return "…"
  if (pct === 0) return "0%"
  return pct > 0 ? `+${pct}%` : `${pct}%`
}
