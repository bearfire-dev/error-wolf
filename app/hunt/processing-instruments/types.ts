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

/** Sliding window used when sampling the bus for instrument visuals. */
export const RATE_WINDOW_MS = 120

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
