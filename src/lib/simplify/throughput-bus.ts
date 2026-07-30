import type { SimplifyPipelineStepId } from "@/lib/simplify/types"

export type ThroughputTick = {
  /** Performance-now timestamp in ms (monotonic). */
  t: number
  /** Number of chars delivered in this tick. */
  n: number
}

export type ThroughputBus = {
  /** Record chars arriving at time `atMs` for a step. */
  report(stepId: SimplifyPipelineStepId, chars: number, atMs: number): void
  /**
   * Average rate over the last `windowMs` for a step, in chars/sec.
   * Returns 0 if the step has no recorded activity.
   */
  sampleRate(
    stepId: SimplifyPipelineStepId,
    windowMs: number,
    atMs: number
  ): number
  /** Most recent report timestamp for a step, or null if none. */
  lastTickAt(stepId: SimplifyPipelineStepId): number | null
  /** Snapshot of recorded ticks (used for replay capture). */
  getEvents(stepId: SimplifyPipelineStepId): ThroughputTick[]
  /** Clear all step buffers. */
  reset(): void
}

/** Entries older than this are pruned eagerly to keep buffers bounded. */
const MAX_RETENTION_MS = 30_000

export function createThroughputBus(): ThroughputBus {
  const buffers = new Map<SimplifyPipelineStepId, ThroughputTick[]>()
  const lastTick = new Map<SimplifyPipelineStepId, number>()

  function getBuffer(stepId: SimplifyPipelineStepId): ThroughputTick[] {
    let existing = buffers.get(stepId)
    if (!existing) {
      existing = []
      buffers.set(stepId, existing)
    }
    return existing
  }

  function pruneOld(buffer: ThroughputTick[], nowMs: number): void {
    const cutoff = nowMs - MAX_RETENTION_MS
    while (buffer.length > 0 && buffer[0].t < cutoff) buffer.shift()
  }

  return {
    report(stepId, chars, atMs) {
      if (chars <= 0) return
      const buf = getBuffer(stepId)
      buf.push({ t: atMs, n: chars })
      pruneOld(buf, atMs)
      lastTick.set(stepId, atMs)
    },
    sampleRate(stepId, windowMs, atMs) {
      const buf = buffers.get(stepId)
      if (!buf || buf.length === 0) return 0
      const cutoff = atMs - windowMs
      let sum = 0
      for (let i = buf.length - 1; i >= 0; i -= 1) {
        const tick = buf[i]
        if (tick.t < cutoff) break
        sum += tick.n
      }
      if (sum === 0) return 0
      return (sum * 1000) / Math.max(1, windowMs)
    },
    lastTickAt(stepId) {
      return lastTick.get(stepId) ?? null
    },
    getEvents(stepId) {
      const buf = buffers.get(stepId)
      return buf ? buf.slice() : []
    },
    reset() {
      buffers.clear()
      lastTick.clear()
    },
  }
}
