import { useEffect, useState } from "react"

import { formatDuration } from "@/lib/recent-results"
import { getProgressElapsedMs } from "@/lib/simplify/progress"
import type { SimplifyEngineDefinition } from "@/lib/simplify/engines/types"
import {
  type SimplifyProgressSnapshot,
  type ThroughputBus,
} from "@/lib/simplify/stub"

import { ProcessingDag } from "./processing-dag"

export function ProcessingStep({
  progress,
  dag,
  bus,
  /** When set, drives the DAG and elapsed readout (replay); no live clock. */
  controlledNowMs,
}: {
  progress: SimplifyProgressSnapshot | null
  dag: SimplifyEngineDefinition["dag"]
  bus?: ThroughputBus | null
  controlledNowMs?: number
}) {
  const [now, setNow] = useState(() =>
    typeof performance !== "undefined" ? performance.now() : Date.now()
  )

  useEffect(() => {
    if (controlledNowMs !== undefined) return
    const id = window.setInterval(() => {
      setNow(
        typeof performance !== "undefined" ? performance.now() : Date.now()
      )
    }, 80)
    return () => window.clearInterval(id)
  }, [controlledNowMs])

  const effectiveNowMs = controlledNowMs ?? now

  const elapsed = progress ? getProgressElapsedMs(progress, effectiveNowMs) : 0
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

      <ProcessingDag
        progress={progress}
        dag={dag}
        nowMs={effectiveNowMs}
        bus={bus}
      />
    </div>
  )
}
