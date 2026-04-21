"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import type { SimplifyPipelineNode } from "@/lib/simplify/pipeline-dag"
import {
  createThroughputBus,
  type ThroughputBus,
} from "@/lib/simplify/throughput-bus"
import type { SimplifyProgressSnapshot } from "@/lib/simplify/types"

import { ProcessingStep } from "./processing-step"
import type { SimplifyReplayChunk, SimplifyReplayFrame } from "./use-hunt-run"

export type ProcessingReplayPanelProps = {
  frames: SimplifyReplayFrame[]
  chunks: SimplifyReplayChunk[]
  durationMs: number
  dag: SimplifyPipelineNode[]
}

/**
 * Replays a finished run through the same {@link ProcessingStep} + DAG as a
 * live compress: one real-time playback at 1×, chunk-fed bus, no zoom/speed UI.
 */
export function ProcessingReplayPanel({
  frames,
  chunks,
  durationMs,
  dag,
}: ProcessingReplayPanelProps) {
  const [currentMs, setCurrentMs] = useState(0)
  const [playing, setPlaying] = useState(true)

  const [bus] = useState<ThroughputBus>(() => createThroughputBus())
  const fedIndexRef = useRef(0)
  const lastFedMsRef = useRef(0)

  useEffect(() => {
    if (currentMs < lastFedMsRef.current) {
      bus.reset()
      fedIndexRef.current = 0
      lastFedMsRef.current = 0
    }
    const now = performance.now()
    while (
      fedIndexRef.current < chunks.length &&
      chunks[fedIndexRef.current].timeMs <= currentMs
    ) {
      const evt = chunks[fedIndexRef.current]
      bus.report(evt.stepId, evt.chars, now)
      fedIndexRef.current += 1
    }
    lastFedMsRef.current = currentMs
  }, [currentMs, chunks, bus])

  useEffect(() => {
    if (!playing) return
    let rafId = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = now - last
      last = now
      setCurrentMs((prev) => {
        const next = prev + dt
        if (next >= durationMs) {
          setPlaying(false)
          return durationMs
        }
        return next
      })
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [playing, durationMs])

  const currentSnapshot = useMemo<SimplifyProgressSnapshot | null>(() => {
    if (frames.length === 0) return null
    let chosen = frames[0].snapshot
    for (const frame of frames) {
      if (frame.timeMs <= currentMs) chosen = frame.snapshot
      else break
    }
    return chosen
  }, [frames, currentMs])

  const nowMsForDag =
    currentSnapshot !== null ? currentSnapshot.startedAtMs + currentMs : 0

  return (
    <ProcessingStep
      progress={currentSnapshot}
      dag={dag}
      bus={bus}
      controlledNowMs={nowMsForDag}
    />
  )
}
