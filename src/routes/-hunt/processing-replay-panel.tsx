import { useEffect, useMemo, useRef, useState } from "react"

import type { SimplifyPipelineNode } from "@/lib/simplify/pipeline-dag"
import type { SimplifyProgressSnapshot } from "@/lib/simplify/types"

import { ProcessingStep } from "./processing-step"
import type { SimplifyReplayFrame } from "./use-hunt-run"

export type ProcessingReplayPanelProps = {
  frames: SimplifyReplayFrame[]
  durationMs: number
  dag: SimplifyPipelineNode[]
}

const REPLAY_RENDER_INTERVAL_MS = 33

/**
 * Replays a finished run through the same {@link ProcessingStep} + DAG as a
 * live compress: one real-time playback at 1×, no zoom/speed UI.
 */
export function ProcessingReplayPanel({
  frames,
  durationMs,
  dag,
}: ProcessingReplayPanelProps) {
  const [currentMs, setCurrentMs] = useState(0)
  const [playing, setPlaying] = useState(true)
  const currentMsRef = useRef(0)

  useEffect(() => {
    if (!playing) return
    let rafId = 0
    let last = performance.now()
    let lastRenderedMs = currentMsRef.current
    const tick = (now: number) => {
      const dt = now - last
      last = now
      const next = currentMsRef.current + dt
      currentMsRef.current = next
      const finished = next >= durationMs
      if (finished || next - lastRenderedMs >= REPLAY_RENDER_INTERVAL_MS) {
        lastRenderedMs = next
        setCurrentMs(Math.min(next, durationMs))
      }
      if (finished) {
        setPlaying(false)
        return
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [playing, durationMs])

  const currentSnapshot = useMemo<SimplifyProgressSnapshot | null>(() => {
    if (frames.length === 0) return null

    let low = 0
    let high = frames.length - 1
    let chosen = frames[0].snapshot
    while (low <= high) {
      const middle = Math.floor((low + high) / 2)
      const frame = frames[middle]
      if (frame.timeMs <= currentMs) {
        chosen = frame.snapshot
        low = middle + 1
      } else {
        high = middle - 1
      }
    }
    return chosen
  }, [frames, currentMs])

  const nowMsForDag =
    currentSnapshot !== null ? currentSnapshot.startedAtMs + currentMs : 0

  return (
    <ProcessingStep
      progress={currentSnapshot}
      dag={dag}
      controlledNowMs={nowMsForDag}
    />
  )
}
