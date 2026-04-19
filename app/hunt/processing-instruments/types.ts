import type { ThroughputBus } from "@/lib/simplify/throughput-bus"
import type {
  SimplifyPipelineStepId,
  SimplifyPipelineStepStatus,
} from "@/lib/simplify/types"

export type InstrumentStep = {
  id: SimplifyPipelineStepId
  label: string
  status: SimplifyPipelineStepStatus
  startedAtMs: number | null
  endedAtMs: number | null
  retries: number
}

export type InstrumentProps = {
  steps: InstrumentStep[]
  bus?: ThroughputBus | null
  /** Wall-clock "now" the parent is rendering against. */
  nowMs: number
}

/**
 * Chars/sec where `normalizeRate` crosses ~63% activity. Tuned for bursty
 * LLM SSE chunks where 200-1200 chars/s is typical.
 */
export const RATE_KNEE = 600

/** Saturating normalizer for chars/sec → [0, 1]. */
export function normalizeRate(charsPerSec: number): number {
  if (charsPerSec <= 0) return 0
  return 1 - Math.exp(-charsPerSec / RATE_KNEE)
}

/**
 * Adaptive "time-per-bar" plus rate-sampling window, driven by observed
 * chunk inter-arrival deltas. When chunks arrive every ~30ms the bars step
 * at ~30ms (so each bar reflects one burst); when arrivals slow to 400ms the
 * bars stretch to cover more seconds without losing detail. Values are
 * EMA-smoothed so the axis never jumps.
 */
export type AdaptiveTimebase = {
  /** Current sample interval in ms (time per bar/row/sample). */
  intervalMs: number
  /** Current rate window in ms used for `bus.sampleRate`. */
  windowMs: number
  /** Mix recent inter-arrivals into the smoothed values. */
  update: (
    bus: ThroughputBus | null | undefined,
    steps: InstrumentStep[],
    atMs: number
  ) => void
}

export type AdaptiveTimebaseOptions = {
  /** Default interval when there's no activity (or not enough samples). */
  defaultIntervalMs: number
  /** Default window when there's no activity. */
  defaultWindowMs: number
  /** Minimum interval after adapting (floor, eg 10ms). */
  minIntervalMs?: number
  /** Maximum interval after adapting (ceiling, eg 260ms). */
  maxIntervalMs?: number
  /** Minimum window. */
  minWindowMs?: number
  /** Maximum window. */
  maxWindowMs?: number
  /** EMA mix factor for smoothing. */
  alpha?: number
  /** Lookback ms for inter-arrival sampling. */
  lookbackMs?: number
}

export function createAdaptiveTimebase(
  options: AdaptiveTimebaseOptions
): AdaptiveTimebase {
  const alpha = options.alpha ?? 0.18
  const lookback = options.lookbackMs ?? 2500
  const minInterval = options.minIntervalMs ?? 10
  const maxInterval = options.maxIntervalMs ?? 260
  const minWindow = options.minWindowMs ?? 40
  const maxWindow = options.maxWindowMs ?? 1500

  const state = {
    intervalMs: options.defaultIntervalMs,
    windowMs: options.defaultWindowMs,
    update(
      bus: ThroughputBus | null | undefined,
      steps: InstrumentStep[],
      atMs: number
    ) {
      if (!bus) return
      const cutoff = atMs - lookback
      const times: number[] = []
      for (const step of steps) {
        const events = bus.getEvents(step.id)
        for (const e of events) if (e.t >= cutoff) times.push(e.t)
      }
      if (times.length < 4) {
        // Decay gently back toward defaults when the run goes quiet.
        const decay = alpha * 0.4
        state.intervalMs =
          state.intervalMs * (1 - decay) + options.defaultIntervalMs * decay
        state.windowMs =
          state.windowMs * (1 - decay) + options.defaultWindowMs * decay
        return
      }
      times.sort((a, b) => a - b)
      const deltas: number[] = []
      for (let i = 1; i < times.length; i += 1) {
        const d = times[i] - times[i - 1]
        if (d > 0 && d < 2000) deltas.push(d)
      }
      if (deltas.length < 3) return
      deltas.sort((a, b) => a - b)
      const p50 = deltas[Math.floor(deltas.length * 0.5)]
      const p75 = deltas[Math.floor(deltas.length * 0.75)]
      // One bar ≈ one arrival on average; multiply by 0.9 so bursts are still
      // resolved when activity is uniform.
      const targetInterval = Math.min(
        maxInterval,
        Math.max(minInterval, p50 * 0.9)
      )
      // Window needs to cover a few arrivals so rates aren't 0/1 toggles.
      const targetWindow = Math.min(
        maxWindow,
        Math.max(minWindow, Math.max(p75 * 4, p50 * 3))
      )
      state.intervalMs =
        state.intervalMs * (1 - alpha) + targetInterval * alpha
      state.windowMs = state.windowMs * (1 - alpha) + targetWindow * alpha
    },
  }
  return state
}

export function statusLabel(s: SimplifyPipelineStepStatus): string {
  switch (s) {
    case "running":
      return "[run]"
    case "success":
      return "[ok]"
    case "warning":
      return "[warn]"
    case "error":
      return "[fail]"
    default:
      return "[wait]"
  }
}

export function statusTone(s: SimplifyPipelineStepStatus): string {
  switch (s) {
    case "running":
      return "text-foreground"
    case "success":
      return "text-primary"
    case "warning":
      return "text-amber-600 dark:text-amber-400"
    case "error":
      return "text-destructive"
    default:
      return "text-muted-foreground/60"
  }
}

/**
 * Read a CSS custom property off an element; returns `fallback` if missing
 * or empty. The raw value keeps any `oklch(...)` wrapper intact so it can be
 * set directly on canvas contexts.
 */
export function readCssVar(
  el: Element | null,
  variable: string,
  fallback: string
): string {
  if (!el) return fallback
  const value = getComputedStyle(el).getPropertyValue(variable).trim()
  return value || fallback
}
