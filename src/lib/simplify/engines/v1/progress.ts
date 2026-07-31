import type {
  SimplifyProgressListener,
  SimplifyProgressSnapshot,
  SimplifyProgressStep,
} from "@/lib/simplify/types"

import type { V1StepId } from "./types"

const STEP_LABELS: Record<V1StepId, string> = {
  preprocess: "01 normalize",
  "analysis-1": "02 compress a",
  "analysis-2": "03 compress b",
  "analysis-3": "04 compress c",
  synthesis: "05 merge",
}

function nowMs(): number {
  if (typeof performance !== "undefined") return performance.now()
  return Date.now()
}

function createSteps(): SimplifyProgressStep[] {
  return (Object.entries(STEP_LABELS) as [V1StepId, string][]).map(
    ([id, label]) => ({
      id,
      label,
      status: "pending",
      retries: 0,
      detail: null,
      warning: null,
      error: null,
      startedAtMs: null,
      endedAtMs: null,
      durationMs: null,
    })
  )
}

function finalizeStepDuration(
  step: SimplifyProgressStep,
  endedAtMs: number
): SimplifyProgressStep {
  return {
    ...step,
    endedAtMs,
    durationMs:
      step.startedAtMs === null ? 0 : Math.max(0, endedAtMs - step.startedAtMs),
  }
}

export function createInitialV1ProgressSnapshot(): SimplifyProgressSnapshot {
  const startedAtMs = nowMs()
  return {
    startedAtMs,
    updatedAtMs: startedAtMs,
    steps: createSteps(),
  }
}

export function createV1ProgressTracker(onProgress?: SimplifyProgressListener) {
  let snapshot = createInitialV1ProgressSnapshot()

  function emit(nextSteps: SimplifyProgressStep[]): SimplifyProgressSnapshot {
    snapshot = {
      startedAtMs: snapshot.startedAtMs,
      updatedAtMs: nowMs(),
      steps: nextSteps,
    }
    onProgress?.(snapshot)
    return snapshot
  }

  function updateStep(
    id: V1StepId,
    updater: (step: SimplifyProgressStep) => SimplifyProgressStep
  ): SimplifyProgressSnapshot {
    return emit(
      snapshot.steps.map((step) => (step.id === id ? updater(step) : step))
    )
  }

  emit(snapshot.steps)

  return {
    snapshot(): SimplifyProgressSnapshot {
      return snapshot
    },
    start(id: V1StepId, detail?: string): SimplifyProgressSnapshot {
      const startedAtMs = nowMs()
      return updateStep(id, (step) => ({
        ...step,
        status: "running",
        detail: detail ?? step.detail,
        warning: null,
        error: null,
        startedAtMs: step.startedAtMs ?? startedAtMs,
        endedAtMs: null,
        durationMs: null,
      }))
    },
    retry(id: V1StepId, detail?: string): SimplifyProgressSnapshot {
      return updateStep(id, (step) => ({
        ...step,
        status: "running",
        retries: step.retries + 1,
        detail: detail ?? step.detail,
        warning: null,
        error: null,
      }))
    },
    succeed(id: V1StepId, detail?: string): SimplifyProgressSnapshot {
      const endedAtMs = nowMs()
      return updateStep(id, (step) =>
        finalizeStepDuration(
          {
            ...step,
            status: "success",
            detail: detail ?? step.detail,
            warning: null,
            error: null,
          },
          endedAtMs
        )
      )
    },
    warn(id: V1StepId, warning: string): SimplifyProgressSnapshot {
      const endedAtMs = nowMs()
      return updateStep(id, (step) =>
        finalizeStepDuration(
          {
            ...step,
            status: "warning",
            detail: step.detail,
            warning,
            error: null,
          },
          endedAtMs
        )
      )
    },
    fail(id: V1StepId, error: string): SimplifyProgressSnapshot {
      const endedAtMs = nowMs()
      return updateStep(id, (step) =>
        finalizeStepDuration(
          {
            ...step,
            status: "error",
            detail: step.detail,
            warning: null,
            error,
          },
          endedAtMs
        )
      )
    },
  }
}
