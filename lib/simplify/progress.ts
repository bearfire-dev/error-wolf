import type {
  SimplifyProgressSnapshot,
  SimplifyProgressStep,
} from "@/lib/simplify/types"

export function getProgressStepElapsedMs(
  step: SimplifyProgressStep,
  currentMs: number
): number {
  if (step.durationMs !== null) return step.durationMs
  if (step.startedAtMs === null) return 0
  return Math.max(0, currentMs - step.startedAtMs)
}

export function getProgressElapsedMs(
  snapshot: SimplifyProgressSnapshot,
  currentMs: number
): number {
  return Math.max(0, currentMs - snapshot.startedAtMs)
}
