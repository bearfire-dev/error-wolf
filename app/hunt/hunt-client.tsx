"use client"

import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { hasConsent } from "@/lib/consent"
import {
  isHuntMode,
  persistHuntMode,
  readHuntMode,
  type HuntMode,
} from "@/lib/hunt-mode"

const HUNT_MODE_LABEL: Record<HuntMode, string> = {
  auto: "Auto",
  normal: "Normal",
  heavy: "Heavy",
}
import {
  clearOpenRouterKeyCookie,
  getOpenRouterKeyFromCookie,
  setOpenRouterKeyCookie,
} from "@/lib/openrouter-key-cookie"
import { verifyOpenRouterKey } from "@/lib/openrouter/verify"
import {
  addRecentResult,
  formatDuration,
  formatTokens,
  getRecentResults,
  getStats,
  previewText,
  updateRecentResultTokens,
  type SimplifyStats,
} from "@/lib/recent-results"
import {
  HUNT_GITHUB_SOURCE_URL,
  HUNT_SENTRY_URL,
  HUNT_STEP_INDEX,
  HUNT_STEPS,
  STACK_TRACE_PLACEHOLDER,
  type HuntStep,
} from "@/lib/hunt-constants"
import { simplifyErrorText } from "@/lib/simplify/stub"
import { countTokens } from "@/lib/tokens/client"
import { cn } from "@/lib/utils"

export function HuntClient() {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  const [step, setStep] = useState<HuntStep>("input")
  const [stats, setStats] = useState<SimplifyStats>({
    count: 0,
    current: null,
    average: null,
  })

  const [apiKey, setApiKey] = useState("")
  const [keyOk, setKeyOk] = useState(false)
  const [verifyState, setVerifyState] = useState<"idle" | "ok" | "bad">("idle")
  const [verifying, setVerifying] = useState(false)

  const [rawInput, setRawInput] = useState("")
  const [lastError, setLastError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [outputText, setOutputText] = useState("")
  const [outputKey, setOutputKey] = useState(0)
  const [huntMode, setHuntMode] = useState<HuntMode>("auto")

  const outputRef = useRef<string>("")

  useEffect(() => {
    if (!hasConsent()) {
      router.replace("/")
      return
    }
    const saved = getOpenRouterKeyFromCookie()
    const hasKey = Boolean(saved.trim())
    startTransition(() => {
      setApiKey(saved)
      setKeyOk(hasKey)
      setStats(getStats(getRecentResults()))
      setHuntMode(readHuntMode())
      setStep(hasKey ? "input" : "key")
      setReady(true)
    })
  }, [router])

  const handleVerify = useCallback(async () => {
    setVerifying(true)
    setVerifyState("idle")
    try {
      const ok = await verifyOpenRouterKey(apiKey)
      if (ok) {
        setOpenRouterKeyCookie(apiKey)
        setKeyOk(true)
        setVerifyState("ok")
        window.setTimeout(() => setStep("input"), 350)
      } else {
        setKeyOk(false)
        setVerifyState("bad")
      }
    } finally {
      setVerifying(false)
    }
  }, [apiKey])

  const handleHuntModeChange = useCallback((mode: HuntMode) => {
    setHuntMode(mode)
    persistHuntMode(mode)
  }, [])

  const handleSimplify = useCallback(async () => {
    const trimmed = rawInput.trim()
    if (!trimmed) return
    const startedAt = performance.now()
    const inputChars = rawInput.length
    const inputText = rawInput
    const inputPreview = previewText(rawInput, 120)

    setLastError(null)
    setStep("processing")

    try {
      const text = await simplifyErrorText(inputText, huntMode)
      const durationMs = performance.now() - startedAt
      outputRef.current = text
      setOutputText(text)
      setOutputKey((k) => k + 1)
      const next = addRecentResult({
        inputPreview,
        output: text,
        inputChars,
        outputChars: text.length,
        durationMs,
      })
      const newId = next[0]?.id
      setStats(getStats(next))
      setRawInput("")
      setStep("output")

      if (newId) {
        void Promise.all([countTokens(inputText), countTokens(text)])
          .then(([inputTokens, outputTokens]) => {
            const updated = updateRecentResultTokens(newId, {
              inputTokens,
              outputTokens,
            })
            setStats(getStats(updated))
          })
          .catch(() => {
            // tokens remain undefined; UI shows char-based fallback
          })
      }
    } catch (e) {
      setLastError(e instanceof Error ? e.message : "Something went wrong.")
      setStep("input")
    }
  }, [huntMode, rawInput])

  const handleCopy = useCallback(async () => {
    if (!outputRef.current) return
    try {
      await navigator.clipboard.writeText(outputRef.current)
      setCopied(true)
      window.setTimeout(() => {
        setCopied(false)
        outputRef.current = ""
        setOutputText("")
        setStep("input")
      }, 1200)
    } catch {
      setLastError("Could not copy to clipboard.")
    }
  }, [])

  const handleDiscard = useCallback(() => {
    outputRef.current = ""
    setOutputText("")
    setCopied(false)
    setStep("input")
  }, [])

  if (!ready) {
    return (
      <p className="font-mono text-xs text-muted-foreground">
        &gt; loading<span className="blink">_</span>
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <StepIndicator
        current={step}
        onKeyStepClick={() => setStep("key")}
        onInputFromOutputClick={handleDiscard}
      />

      <div className="relative aspect-[5/7] w-full border border-foreground/15 bg-card dark:bg-card/40">
        <div
          key={step}
          className="absolute inset-0 min-h-0 animate-in overflow-y-auto p-6 duration-150 fade-in-0 slide-in-from-bottom-1 sm:p-8"
        >
          {step === "key" && (
            <KeyStep
              apiKey={apiKey}
              setApiKey={(v) => {
                setApiKey(v)
                setVerifyState("idle")
                setKeyOk(false)
              }}
              verifying={verifying}
              verifyState={verifyState}
              onVerify={() => void handleVerify()}
              onClear={() => {
                clearOpenRouterKeyCookie()
                setApiKey("")
                setKeyOk(false)
                setVerifyState("idle")
              }}
            />
          )}

          {step === "input" && (
            <InputStep
              rawInput={rawInput}
              setRawInput={setRawInput}
              disabled={!keyOk}
              lastError={lastError}
              huntMode={huntMode}
              onHuntModeChange={handleHuntModeChange}
              onSimplify={() => void handleSimplify()}
              onEditKey={() => setStep("key")}
              keyOk={keyOk}
            />
          )}

          {step === "processing" && <ProcessingStep />}

          {step === "output" && stats.current && (
            <OutputStep
              key={outputKey}
              outputText={outputText}
              copied={copied}
              onCopy={() => void handleCopy()}
              onDiscard={handleDiscard}
            />
          )}
        </div>
      </div>

      <StatsStrip stats={stats} step={step} />
    </div>
  )
}

function StepIndicator({
  current,
  onKeyStepClick,
  onInputFromOutputClick,
}: {
  current: HuntStep
  onKeyStepClick: () => void
  onInputFromOutputClick: () => void
}) {
  const currentIdx = HUNT_STEP_INDEX[current]
  const stepControlClass =
    "inline-flex cursor-pointer items-center gap-1.5 rounded-sm text-inherit outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background"

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
            <span>{s.label}</span>
            <span aria-hidden>]</span>
          </>
        )

        const isKeyStep = s.id === "key"
        const isInputStep = s.id === "input"
        const keyClickable = isKeyStep && current !== "processing"
        const inputClickableFromOutput = isInputStep && current === "output"

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
  verifying,
  verifyState,
  onVerify,
  onClear,
}: {
  apiKey: string
  setApiKey: (value: string) => void
  verifying: boolean
  verifyState: "idle" | "ok" | "bad"
  onVerify: () => void
  onClear: () => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
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
            Your key and input/output data is sent directly from your browser to
            OpenRouter (and their providers). We do not collect it.
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
            This site is open-source MIT-licensed. You can audit/run the code for
            yourself by visiting our{" "}
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
      </div>
    </div>
  )
}

function InputStep({
  rawInput,
  setRawInput,
  disabled,
  lastError,
  huntMode,
  onHuntModeChange,
  onSimplify,
  onEditKey,
  keyOk,
}: {
  rawInput: string
  setRawInput: (v: string) => void
  disabled: boolean
  lastError: string | null
  huntMode: HuntMode
  onHuntModeChange: (mode: HuntMode) => void
  onSimplify: () => void
  onEditKey: () => void
  keyOk: boolean
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-baseline justify-between gap-3">
        <p className="font-mono text-xs text-foreground">
          <span className="text-primary">&gt;&nbsp;</span>paste stack traces
        </p>
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

      <div className="flex min-h-0 flex-1 flex-col">
        <Textarea
          id="error-input"
          name="error-input"
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              e.shiftKey &&
              rawInput.trim() &&
              !disabled
            ) {
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
          <Button
            type="button"
            disabled={disabled || !rawInput.trim()}
            onClick={onSimplify}
          >
            [ hunt ]
          </Button>
          <span className="font-mono text-[0.625rem] tracking-wider text-muted-foreground uppercase">
            shift+enter
          </span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <label
            htmlFor="hunt-mode"
            className="font-mono text-[0.625rem] tracking-wider text-muted-foreground uppercase"
          >
            mode
          </label>
          <Select
            value={huntMode}
            onValueChange={(v) => {
              if (isHuntMode(v)) onHuntModeChange(v)
            }}
            disabled={disabled}
          >
            <SelectTrigger id="hunt-mode" className="max-w-[9rem]">
              {HUNT_MODE_LABEL[huntMode]}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="heavy">Heavy</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}

function ProcessingStep() {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const start = performance.now()
    const id = window.setInterval(() => {
      setElapsed(performance.now() - start)
    }, 100)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="flex h-full flex-col items-start justify-center gap-5">
      <p className="font-mono text-sm text-foreground">
        <span className="text-primary">&gt;&nbsp;</span>hunting
        <span className="blink">…</span>
      </p>

      <div
        className="relative h-1 w-full max-w-sm overflow-hidden bg-foreground/10"
        aria-hidden
      >
        <span className="absolute inset-y-0 left-0 w-1/3 animate-pulse bg-primary" />
      </div>

      <p className="font-mono text-[0.6875rem] tracking-wider text-muted-foreground uppercase tabular-nums">
        elapsed {formatDuration(elapsed)}
      </p>
    </div>
  )
}

function OutputStep({
  outputText,
  copied,
  onCopy,
  onDiscard,
}: {
  outputText: string
  copied: boolean
  onCopy: () => void
  onDiscard: () => void
}) {
  const [showRaw, setShowRaw] = useState(false)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-3">
        <p className="font-mono text-xs text-foreground">
          <span className="text-primary">&gt;&nbsp;</span>result ready
        </p>
        {showRaw && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => void onCopy()}
          >
            {copied ? "[ copied ]" : "[ copy ]"}
          </Button>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        {showRaw ? (
          <div className="absolute inset-0 flex min-h-0 flex-col gap-2 px-1 pt-1 pb-10">
            <Textarea
              readOnly
              value={outputText}
              aria-label="Simplified output"
              className="no-scrollbar min-h-0 flex-1 resize-none overflow-y-auto font-mono text-xs leading-relaxed"
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex min-h-0 flex-col items-center justify-center overflow-y-auto px-1 pb-10">
            <Button
              type="button"
              size="lg"
              className="min-w-[11rem] shrink-0 px-8"
              onClick={() => void onCopy()}
            >
              {copied ? "[ copied ]" : "[ copy ]"}
            </Button>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 pb-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="pointer-events-auto"
            onClick={onDiscard}
          >
            discard
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="pointer-events-auto"
            aria-expanded={showRaw}
            onClick={() => setShowRaw((v) => !v)}
          >
            {showRaw ? "hide" : "view"}
          </Button>
        </div>
      </div>
    </div>
  )
}

function StatsStrip({ stats, step }: { stats: SimplifyStats; step: HuntStep }) {
  const isThisRun = step === "output"
  const row = isThisRun ? stats.current : stats.average
  if (!row) return null

  const hasTokens =
    row.inputTokens !== undefined && row.outputTokens !== undefined
  const inValue = hasTokens ? formatTokens(row.inputTokens!) : "…"
  const outValue = hasTokens ? formatTokens(row.outputTokens!) : "…"
  const reduction = hasTokens ? row.reductionTokensPct : row.reductionPct
  const tone = reductionTone(reduction)

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 font-mono text-[0.625rem] tracking-wider text-muted-foreground uppercase tabular-nums">
      <span className="text-foreground/70">{isThisRun ? "run" : "avg"}</span>
      <span>dur {formatDuration(row.durationMs)}</span>
      <span aria-hidden>&middot;</span>
      <span>in {inValue}</span>
      <span aria-hidden>&middot;</span>
      <span>out {outValue}</span>
      <span aria-hidden>&middot;</span>
      <span
        className={cn(
          tone === "good" && "text-primary",
          tone === "bad" && "text-destructive",
          tone === "muted" && "text-muted-foreground"
        )}
      >
        {formatReduction(reduction)}
      </span>
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
