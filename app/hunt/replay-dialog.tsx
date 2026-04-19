"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { PauseIcon, PlayIcon, ReloadIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatDuration } from "@/lib/recent-results"
import type { SimplifyPipelineNode } from "@/lib/simplify/pipeline-dag"
import {
  createThroughputBus,
  type ThroughputBus,
} from "@/lib/simplify/throughput-bus"
import type { SimplifyProgressSnapshot } from "@/lib/simplify/types"
import { cn } from "@/lib/utils"

import {
  PROCESSING_INSTRUMENT_VARIANTS,
  ProcessingDag,
  type ProcessingInstrumentVariant,
} from "./processing-dag"
import type { SimplifyReplayChunk, SimplifyReplayFrame } from "./use-hunt-run"

type ReplayDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  frames: SimplifyReplayFrame[]
  chunks: SimplifyReplayChunk[]
  durationMs: number
  dag: SimplifyPipelineNode[]
}

const SPEEDS: number[] = [0.5, 1, 2]
const ZOOM_MIN = 0.5
const ZOOM_MAX = 3

export function ReplayDialog({
  open,
  onOpenChange,
  frames,
  chunks,
  durationMs,
  dag,
}: ReplayDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(80vh,42rem)] w-[min(92vw,72rem)] max-w-[min(92vw,72rem)] flex-col gap-3 p-4 sm:max-w-[min(92vw,72rem)]"
        showCloseButton
      >
        {open && (
          <ReplayBody
            frames={frames}
            chunks={chunks}
            durationMs={durationMs}
            dag={dag}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ReplayBody({
  frames,
  chunks,
  durationMs,
  dag,
}: {
  frames: SimplifyReplayFrame[]
  chunks: SimplifyReplayChunk[]
  durationMs: number
  dag: SimplifyPipelineNode[]
}) {
  const [currentMs, setCurrentMs] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [variant, setVariant] =
    useState<ProcessingInstrumentVariant>("spectrum")

  const dragRef = useRef<{
    x: number
    y: number
    startX: number
    startY: number
  } | null>(null)
  const panRef = useRef<HTMLDivElement | null>(null)

  // Throwaway bus instance for this dialog session; feeds captured chunks
  // at the current playback clock so the waveforms echo the real stream.
  const [bus] = useState<ThroughputBus>(() => createThroughputBus())
  const fedIndexRef = useRef(0)
  const lastFedMsRef = useRef(0)

  useEffect(() => {
    // On rewind, rewind the fed pointer and flush the bus so old activity
    // doesn't linger in the sliding window.
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
    const el = panRef.current
    if (!el) return
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left - rect.width / 2
      const my = e.clientY - rect.top - rect.height / 2
      const rawDelta =
        Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX
      const delta = -rawDelta * 0.0015
      setZoom((prev) => {
        const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prev * (1 + delta)))
        const ratio = next / prev
        setOffset((o) => ({
          x: mx - (mx - o.x) * ratio,
          y: my - (my - o.y) * ratio,
        }))
        return next
      })
    }
    el.addEventListener("wheel", onWheelNative, { passive: false })
    return () => el.removeEventListener("wheel", onWheelNative)
  }, [])

  useEffect(() => {
    if (!playing) return
    let rafId = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = now - last
      last = now
      setCurrentMs((prev) => {
        const next = prev + dt * speed
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
  }, [playing, speed, durationMs])

  const currentSnapshot = useMemo<SimplifyProgressSnapshot | null>(() => {
    if (frames.length === 0) return null
    let chosen = frames[0].snapshot
    for (const frame of frames) {
      if (frame.timeMs <= currentMs) chosen = frame.snapshot
      else break
    }
    return chosen
  }, [frames, currentMs])

  const restart = useCallback(() => {
    setCurrentMs(0)
    setPlaying(true)
  }, [])

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      if (p) return false
      if (currentMs >= durationMs) setCurrentMs(0)
      return true
    })
  }, [currentMs, durationMs])

  const onScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value)
    setCurrentMs(next)
    setPlaying(false)
  }, [])

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      if (e.target instanceof HTMLElement && e.target.closest("button")) return
      dragRef.current = {
        x: e.clientX,
        y: e.clientY,
        startX: offset.x,
        startY: offset.y,
      }
      setDragging(true)
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [offset.x, offset.y]
  )

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d) return
    setOffset({
      x: d.startX + (e.clientX - d.x),
      y: d.startY + (e.clientY - d.y),
    })
  }, [])

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null
    setDragging(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore; pointer may not have been captured
    }
  }, [])

  const onDoubleClick = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  const zoomIn = useCallback(
    () =>
      setZoom((z) =>
        Math.min(ZOOM_MAX, Math.round((z * 1.25 + Number.EPSILON) * 100) / 100)
      ),
    []
  )
  const zoomOut = useCallback(
    () =>
      setZoom((z) =>
        Math.max(ZOOM_MIN, Math.round((z / 1.25 + Number.EPSILON) * 100) / 100)
      ),
    []
  )
  const resetView = useCallback(() => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  const atEnd = currentMs >= durationMs
  const frameStatuses = currentSnapshot
    ? currentSnapshot.steps
        .map((s) => s.status[0]?.toUpperCase() ?? "-")
        .join("")
    : "-----"

  return (
    <>
      <DialogHeader className="flex-row items-baseline justify-between gap-3 pr-8">
        <DialogTitle>03 COMP · replay</DialogTitle>
        <DialogDescription className="font-mono text-[0.625rem] tracking-wider uppercase">
          {frames.length} frames · {formatDuration(durationMs)} · status{" "}
          <span className="text-foreground/80 tabular-nums">
            {frameStatuses}
          </span>
        </DialogDescription>
      </DialogHeader>

      <div
        ref={panRef}
        className="relative min-h-0 flex-1 cursor-grab overflow-hidden border border-foreground/15 bg-card/40 active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        <div
          className="absolute inset-0 flex"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            transition: dragging ? "none" : "transform 120ms ease-out",
          }}
        >
          <div className="m-auto flex aspect-[5/7] h-full max-h-full w-auto max-w-full flex-col p-6">
            <ProcessingDag
              progress={currentSnapshot}
              dag={dag}
              nowMs={
                currentSnapshot ? currentSnapshot.startedAtMs + currentMs : 0
              }
              disableEnter
              disableZoom
              bus={bus}
              variant={variant}
            />
          </div>
        </div>

        <div className="pointer-events-none absolute top-2 left-2 flex flex-col gap-1 font-mono text-[0.6rem] tracking-wider text-muted-foreground uppercase">
          <span className="tabular-nums">zoom {Math.round(zoom * 100)}%</span>
          <span>wheel to zoom · drag to pan</span>
        </div>

        <div className="pointer-events-auto absolute top-2 right-2 flex gap-1">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Zoom out"
            onClick={zoomOut}
          >
            −
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Reset view"
            onClick={resetView}
          >
            ·
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Zoom in"
            onClick={zoomIn}
          >
            +
          </Button>
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1 font-mono text-[0.625rem] tracking-wider uppercase">
          <span className="mr-1 text-muted-foreground">instrument</span>
          {PROCESSING_INSTRUMENT_VARIANTS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setVariant(v.id)}
              aria-pressed={v.id === variant}
              className={cn(
                "cursor-pointer rounded-sm border border-transparent bg-transparent px-2 py-1 font-mono transition-colors outline-none",
                "focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                v.id === variant
                  ? "border-primary/40 text-primary"
                  : "text-muted-foreground/80 hover:border-foreground/15 hover:text-foreground"
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 font-mono text-[0.625rem] tracking-wider text-muted-foreground uppercase tabular-nums">
          <span className="text-foreground">
            {formatDuration(Math.min(currentMs, durationMs))}
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(1, durationMs)}
            step={1}
            value={Math.min(currentMs, durationMs)}
            onChange={onScrub}
            aria-label="Replay position"
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-foreground/15 accent-primary"
          />
          <span>{formatDuration(durationMs)}</span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              onClick={togglePlay}
              aria-label={playing ? "Pause" : "Play"}
            >
              <HugeiconsIcon
                icon={playing ? PauseIcon : PlayIcon}
                strokeWidth={2}
              />
              {playing ? "pause" : atEnd ? "replay" : "play"}
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={restart}
              aria-label="Restart"
            >
              <HugeiconsIcon icon={ReloadIcon} strokeWidth={2} />
            </Button>
          </div>

          <div className="flex items-center gap-1 font-mono text-[0.625rem] tracking-wider uppercase">
            <span className="text-muted-foreground">speed</span>
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                className={cn(
                  "cursor-pointer rounded-sm border-0 bg-transparent p-1 font-mono tabular-nums transition-colors outline-none",
                  "focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  s === speed
                    ? "text-primary"
                    : "text-muted-foreground/70 hover:text-foreground"
                )}
                aria-pressed={s === speed}
                aria-label={`${s}x playback speed`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
