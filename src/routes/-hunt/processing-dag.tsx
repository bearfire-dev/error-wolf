import { memo, useMemo } from "react"

import { formatDuration } from "@/lib/recent-results"
import type { SimplifyPipelineNode } from "@/lib/simplify/pipeline-dag"
import type {
  SimplifyPipelineStepId,
  SimplifyPipelineStepStatus,
  SimplifyProgressSnapshot,
  SimplifyProgressStep,
} from "@/lib/simplify/types"
import { cn } from "@/lib/utils"

/**
 * Preserved for compatibility with existing call sites. With the simplified
 * layout the tier only adjusts outer padding.
 */
export type DagTier = "roomy" | "compact" | "dense"

type ProcessingDagProps = {
  progress: SimplifyProgressSnapshot | null
  dag: SimplifyPipelineNode[]
  nowMs: number
  /** Disables the initial container stagger animation (used during replay). */
  disableEnter?: boolean
  /** Pins the container density. Currently only affects outer padding. */
  tier?: DagTier
  /** Kept for API compatibility with the previous DAG zoom-to-fit. No-op. */
  disableZoom?: boolean
}

type Lane = {
  id: SimplifyPipelineStepId
  label: string
  status: SimplifyPipelineStepStatus
  startedAtMs: number | null
  endedAtMs: number | null
  retries: number
}

const PENDING_STEP: Omit<SimplifyProgressStep, "id" | "label"> = {
  status: "pending",
  retries: 0,
  detail: null,
  warning: null,
  error: null,
  startedAtMs: null,
  endedAtMs: null,
  durationMs: null,
}

/**
 * Stacked loading bars — one per pipeline step. Steps wait in a queue, fire
 * an indeterminate sweep while running, and settle into a filled bar with a
 * final duration when they finish (tinted green/red/amber by status).
 */
export function ProcessingDag({
  progress,
  dag,
  nowMs,
  disableEnter,
  tier = "compact",
}: ProcessingDagProps) {
  const lanes = useMemo<Lane[]>(() => {
    const byId = new Map<string, SimplifyProgressStep>()
    if (progress) {
      for (const step of progress.steps) byId.set(step.id, step)
    }
    return dag.map((node) => {
      const p = byId.get(node.id)
      return {
        id: node.id as SimplifyPipelineStepId,
        label: node.label,
        status: p?.status ?? PENDING_STEP.status,
        startedAtMs: p?.startedAtMs ?? PENDING_STEP.startedAtMs,
        endedAtMs: p?.endedAtMs ?? PENDING_STEP.endedAtMs,
        retries: p?.retries ?? PENDING_STEP.retries,
      }
    })
  }, [dag, progress])

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full flex-col gap-1.5 overflow-hidden",
        tier === "dense" ? "p-1" : tier === "roomy" ? "p-2" : "p-1.5",
        !disableEnter && "ew-lane-enter"
      )}
    >
      {lanes.map((lane) => (
        <LoadingLane key={lane.id} lane={lane} nowMs={nowMs} />
      ))}
    </div>
  )
}

const LoadingLane = memo(
  function LoadingLane({ lane, nowMs }: { lane: Lane; nowMs: number }) {
    const elapsedMs =
      lane.endedAtMs !== null && lane.startedAtMs !== null
        ? Math.max(0, lane.endedAtMs - lane.startedAtMs)
        : lane.startedAtMs !== null
          ? Math.max(0, nowMs - lane.startedAtMs)
          : null

    return (
      <div className="grid grid-cols-[3rem_minmax(0,10rem)_1fr_auto] items-center gap-2 font-mono text-[0.625rem] tracking-wider uppercase">
        <span className={cn("shrink-0 tabular-nums", statusTone(lane.status))}>
          {statusLabel(lane.status)}
        </span>
        <span
          className={cn(
            "min-w-0 truncate",
            lane.status === "pending"
              ? "text-muted-foreground/70"
              : "text-foreground/85"
          )}
        >
          {lane.label}
          {lane.retries > 0 && (
            <span className="ml-1 text-muted-foreground">
              ×{lane.retries + 1}
            </span>
          )}
        </span>
        <div
          className="relative h-2 w-full overflow-hidden rounded-full border border-foreground/10 bg-foreground/[0.04]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={laneProgress(lane.status)}
        >
          <LoadingFill status={lane.status} />
        </div>
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {elapsedMs === null ? "—" : formatDuration(elapsedMs)}
        </span>
      </div>
    )
  },
  (previous, next) =>
    previous.lane === next.lane &&
    (previous.lane.status !== "running" || previous.nowMs === next.nowMs)
)

function LoadingFill({ status }: { status: SimplifyPipelineStepStatus }) {
  if (status === "running") {
    return (
      <div
        className="ew-bar-sweep absolute top-0 bottom-0 w-[35%] rounded-full bg-primary/80"
        aria-hidden
      />
    )
  }
  if (status === "success") {
    return <div className="absolute inset-0 rounded-full bg-primary/80" />
  }
  if (status === "error") {
    return <div className="absolute inset-0 rounded-full bg-destructive/85" />
  }
  if (status === "warning") {
    return (
      <div className="absolute inset-0 rounded-full bg-amber-500/80 dark:bg-amber-400/80" />
    )
  }
  return null
}

function laneProgress(status: SimplifyPipelineStepStatus): number {
  switch (status) {
    case "pending":
      return 0
    case "running":
      return 50
    case "success":
    case "warning":
    case "error":
      return 100
  }
}

function statusLabel(s: SimplifyPipelineStepStatus): string {
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

function statusTone(s: SimplifyPipelineStepStatus): string {
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
