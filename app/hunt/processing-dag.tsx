"use client"

import { useLayoutEffect, useMemo, useRef, useState } from "react"

import { formatDuration } from "@/lib/recent-results"
import {
  layoutDag,
  type DagLayoutNode,
  type SimplifyPipelineNode,
} from "@/lib/simplify/pipeline-dag"
import { getProgressStepElapsedMs } from "@/lib/simplify/progress"
import type { ThroughputBus } from "@/lib/simplify/throughput-bus"
import type {
  SimplifyPipelineStepId,
  SimplifyPipelineStepStatus,
  SimplifyProgressSnapshot,
  SimplifyProgressStep,
} from "@/lib/simplify/types"
import { cn } from "@/lib/utils"

import { LaneWaveform } from "./lane-waveform"

type ProcessingDagProps = {
  progress: SimplifyProgressSnapshot | null
  dag: SimplifyPipelineNode[]
  nowMs: number
  /** Disables the initial column/row stagger (useful during replay scrub). */
  disableEnter?: boolean
  /** Pins the layout tier instead of deriving from cols/rows. */
  tier?: DagTier
  /** Disables the dynamic zoom-to-fit wrapper. */
  disableZoom?: boolean
  /** Live throughput source — drives the waveform amplitude. */
  bus?: ThroughputBus | null
}

type EdgePath = {
  key: string
  fromId: SimplifyPipelineStepId
  toId: SimplifyPipelineStepId
  d: string
  length: number
  active: boolean
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

export type DagTier = "roomy" | "compact" | "dense"

type TierStyle = {
  padX: string
  padY: string
  gapRow: string
  gapCol: string
  gapInside: string
  labelSize: string
  waveform: string
  showNote: "always" | "alerts" | "never"
  showRetry: boolean
  showElapsed: boolean
}

const TIER_STYLES: Record<DagTier, TierStyle> = {
  roomy: {
    padX: "px-1.5",
    padY: "py-1",
    gapRow: "gap-2",
    gapCol: "gap-x-6",
    gapInside: "gap-0.5",
    labelSize: "text-[0.6rem]",
    waveform: "h-4",
    showNote: "always",
    showRetry: true,
    showElapsed: true,
  },
  compact: {
    padX: "px-1",
    padY: "py-1",
    gapRow: "gap-1.5",
    gapCol: "gap-x-5",
    gapInside: "gap-0.5",
    labelSize: "text-[0.55rem]",
    waveform: "h-4",
    showNote: "alerts",
    showRetry: true,
    showElapsed: true,
  },
  dense: {
    padX: "px-1",
    padY: "py-0.5",
    gapRow: "gap-1",
    gapCol: "gap-x-3",
    gapInside: "gap-0",
    labelSize: "text-[0.5rem]",
    waveform: "h-3",
    showNote: "never",
    showRetry: false,
    showElapsed: false,
  },
}

function pickTier(cols: number, maxRows: number): DagTier {
  if (cols <= 3 && maxRows <= 3) return "roomy"
  if (cols <= 5 && maxRows <= 5) return "compact"
  return "dense"
}

function statusLabel(status: SimplifyPipelineStepStatus): string {
  switch (status) {
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

function statusTone(status: SimplifyPipelineStepStatus): string {
  switch (status) {
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

function edgeColorClass(
  fromStatus: SimplifyPipelineStepStatus,
  toStatus: SimplifyPipelineStepStatus
): string {
  if (fromStatus === "error" || toStatus === "error")
    return "stroke-destructive"
  if (fromStatus === "warning" || toStatus === "warning")
    return "stroke-amber-500/70"
  if (fromStatus === "success") return "stroke-primary/80"
  if (toStatus === "running") return "stroke-primary/60"
  return "stroke-foreground/20"
}

export function ProcessingDag({
  progress,
  dag,
  nowMs,
  disableEnter,
  tier: pinnedTier,
  disableZoom,
  bus,
}: ProcessingDagProps) {
  const layout = useMemo(() => layoutDag(dag), [dag])
  const tier = pinnedTier ?? pickTier(layout.cols, layout.maxRows)
  const tierStyle = TIER_STYLES[tier]

  const columns = useMemo(() => {
    const cols: DagLayoutNode[][] = Array.from(
      { length: layout.cols },
      () => []
    )
    for (const node of layout.nodes) cols[node.col]?.push(node)
    return cols
  }, [layout])

  const stepById = useMemo(() => {
    const m = new Map<SimplifyPipelineStepId, SimplifyProgressStep>()
    if (progress) {
      for (const step of progress.steps) m.set(step.id, step)
    }
    for (const node of layout.nodes) {
      if (!m.has(node.id)) {
        m.set(node.id, {
          id: node.id,
          label: node.label,
          ...PENDING_STEP,
        })
      }
    }
    return m
  }, [progress, layout])

  const zoomFrameRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const laneRefs = useRef(new Map<SimplifyPipelineStepId, HTMLDivElement>())
  const registerLane =
    (id: SimplifyPipelineStepId) => (el: HTMLDivElement | null) => {
      const map = laneRefs.current
      if (el) map.set(id, el)
      else map.delete(id)
    }

  const [edges, setEdges] = useState<EdgePath[]>([])
  const [svgSize, setSvgSize] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  })
  const [measuredZoom, setMeasuredZoom] = useState(1)
  const zoom = disableZoom ? 1 : measuredZoom

  useLayoutEffect(() => {
    const frame = zoomFrameRef.current
    const container = containerRef.current
    if (!container) return

    const compute = () => {
      const cRect = container.getBoundingClientRect()
      const scale = zoom || 1
      const scaledW = cRect.width
      const scaledH = cRect.height
      const preW = scaledW / scale
      const preH = scaledH / scale
      setSvgSize({ w: preW, h: preH })

      const next: EdgePath[] = []
      for (const node of layout.nodes) {
        const toEl = laneRefs.current.get(node.id)
        if (!toEl) continue
        const toRect = toEl.getBoundingClientRect()
        const toX = (toRect.left - cRect.left) / scale
        const toY = (toRect.top - cRect.top + toRect.height / 2) / scale

        for (const depId of node.dependsOn) {
          const fromEl = laneRefs.current.get(depId)
          if (!fromEl) continue
          const fromRect = fromEl.getBoundingClientRect()
          const fromX = (fromRect.right - cRect.left) / scale
          const fromY = (fromRect.top - cRect.top + fromRect.height / 2) / scale

          const dx = Math.max(14, (toX - fromX) * 0.5)
          const c1x = fromX + dx
          const c1y = fromY
          const c2x = toX - dx
          const c2y = toY
          const d = `M ${fromX} ${fromY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${toX} ${toY}`

          const approxLen = Math.hypot(toX - fromX, toY - fromY) + Math.abs(dx)
          const fromStatus = stepById.get(depId)?.status ?? "pending"

          next.push({
            key: `${depId}->${node.id}`,
            fromId: depId,
            toId: node.id,
            d,
            length: approxLen,
            active: fromStatus === "success",
          })
        }
      }
      setEdges(next)
    }

    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(container)
    if (frame) ro.observe(frame)
    for (const el of laneRefs.current.values()) ro.observe(el)
    return () => ro.disconnect()
  }, [layout, stepById, zoom])

  useLayoutEffect(() => {
    if (disableZoom) return
    const frame = zoomFrameRef.current
    const container = containerRef.current
    if (!frame || !container) return

    const measure = () => {
      const frameRect = frame.getBoundingClientRect()
      if (frameRect.width <= 0 || frameRect.height <= 0) return
      // `scrollHeight/Width` reflect untransformed content because transforms
      // do not affect layout.
      const needW = container.scrollWidth
      const needH = container.scrollHeight
      if (needW <= 0 || needH <= 0) return
      const ratioW = frameRect.width / needW
      const ratioH = frameRect.height / needH
      const target = Math.max(0.85, Math.min(1, Math.min(ratioW, ratioH)))
      setMeasuredZoom((prev) =>
        Math.abs(prev - target) < 0.005 ? prev : target
      )
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(frame)
    ro.observe(container)
    return () => ro.disconnect()
  }, [disableZoom, tier, layout.cols, layout.maxRows])

  const gridTemplateColumns = `repeat(${Math.max(1, layout.cols)}, minmax(0, 1fr))`

  return (
    <div
      ref={zoomFrameRef}
      className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden"
    >
      <div
        ref={containerRef}
        className="relative h-full w-full"
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: "center center",
        }}
      >
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full"
          width={svgSize.w}
          height={svgSize.h}
          viewBox={`0 0 ${Math.max(1, svgSize.w)} ${Math.max(1, svgSize.h)}`}
          preserveAspectRatio="none"
        >
          <defs>
            <filter
              id="ew-edge-soft"
              x="-10%"
              y="-50%"
              width="120%"
              height="200%"
            >
              <feGaussianBlur stdDeviation="0.6" />
            </filter>
          </defs>
          {edges.map((edge) => {
            const fromStep = stepById.get(edge.fromId)
            const toStep = stepById.get(edge.toId)
            const colorClass = edgeColorClass(
              fromStep?.status ?? "pending",
              toStep?.status ?? "pending"
            )
            const drawDelayMs = disableEnter
              ? 0
              : (layout.nodes.find((n) => n.id === edge.toId)?.col ?? 0) * 95
            const pulseKey = `${edge.key}-${fromStep?.endedAtMs ?? 0}`
            return (
              <g key={edge.key}>
                <path
                  d={edge.d}
                  className={cn(
                    "ew-edge-draw fill-none transition-colors duration-300",
                    colorClass
                  )}
                  strokeWidth={1}
                  strokeLinecap="round"
                  style={{
                    strokeDasharray: edge.length,
                    strokeDashoffset: disableEnter ? 0 : edge.length,
                    animationDelay: `${drawDelayMs}ms`,
                    animationDuration: disableEnter ? "0ms" : "700ms",
                  }}
                />
                {edge.active && (
                  <circle
                    key={pulseKey}
                    r={2.4}
                    className={cn(
                      "fill-current",
                      colorClass.replace("stroke-", "text-")
                    )}
                    style={{
                      offsetPath: `path("${edge.d}")`,
                      offsetDistance: "0%",
                      animation: "ew-edge-pulse 960ms ease-out both",
                      filter: "url(#ew-edge-soft)",
                    }}
                  />
                )}
              </g>
            )
          })}
        </svg>

        <div
          className={cn(
            "relative grid h-full w-full items-stretch",
            tierStyle.gapCol
          )}
          style={{ gridTemplateColumns }}
        >
          {columns.map((colNodes, colIdx) => (
            <div
              key={colIdx}
              className={cn(
                "flex min-w-0 flex-col justify-center",
                tierStyle.gapRow
              )}
            >
              {colNodes.map((node) => (
                <LaneCard
                  key={node.id}
                  node={node}
                  step={stepById.get(node.id)!}
                  nowMs={nowMs}
                  tierStyle={tierStyle}
                  disableEnter={disableEnter}
                  registerLane={registerLane(node.id)}
                  bus={bus}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function LaneCard({
  node,
  step,
  nowMs,
  tierStyle,
  disableEnter,
  registerLane,
  bus,
}: {
  node: DagLayoutNode
  step: SimplifyProgressStep
  nowMs: number
  tierStyle: TierStyle
  disableEnter?: boolean
  registerLane: (el: HTMLDivElement | null) => void
  bus?: ThroughputBus | null
}) {
  const elapsed = getProgressStepElapsedMs(step, nowMs)
  const colDelay = disableEnter ? 0 : node.col * 110 + node.row * 55
  const isSettled =
    step.status === "success" ||
    step.status === "warning" ||
    step.status === "error"
  const isAlert = step.status === "warning" || step.status === "error"
  const cellBorder =
    step.status === "error"
      ? "border-destructive/40"
      : step.status === "warning"
        ? "border-amber-500/40"
        : step.status === "success"
          ? "border-primary/35"
          : step.status === "running"
            ? "border-foreground/25"
            : "border-foreground/10"

  const rawNote = step.error ?? step.warning ?? step.detail
  const noteVisible =
    tierStyle.showNote === "always"
      ? Boolean(rawNote)
      : tierStyle.showNote === "alerts"
        ? isAlert && Boolean(rawNote)
        : false

  return (
    <div
      ref={registerLane}
      className={cn(!disableEnter && "ew-lane-enter")}
      style={disableEnter ? undefined : { animationDelay: `${colDelay}ms` }}
    >
      <div
        className={cn(
          "relative flex min-w-0 flex-col border bg-background/40 backdrop-blur-[1px] transition-colors duration-300",
          tierStyle.padX,
          tierStyle.padY,
          tierStyle.gapInside,
          cellBorder,
          isSettled && "ew-lane-flash"
        )}
      >
        <div
          className={cn(
            "flex min-w-0 items-center gap-1 font-mono tracking-wider uppercase",
            tierStyle.labelSize
          )}
        >
          <span className={cn("tabular-nums", statusTone(step.status))}>
            {statusLabel(step.status)}
          </span>
          <span className="min-w-0 truncate text-foreground/85">
            {node.label}
          </span>
          {tierStyle.showRetry && step.retries > 0 && (
            <span className="shrink-0 text-muted-foreground">
              ×{step.retries + 1}
            </span>
          )}
          {tierStyle.showElapsed && (
            <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
              {formatDuration(elapsed)}
            </span>
          )}
        </div>

        <div
          className={cn("relative w-full overflow-hidden", tierStyle.waveform)}
        >
          <LaneWaveform
            status={step.status}
            retries={step.retries}
            startedAtMs={step.startedAtMs}
            endedAtMs={step.endedAtMs}
            bus={bus}
            stepId={node.id}
          />
        </div>

        {noteVisible && rawNote && (
          <p
            className={cn(
              "truncate font-mono leading-tight tracking-wide",
              tierStyle.labelSize,
              statusTone(step.status)
            )}
            title={rawNote}
          >
            {rawNote}
          </p>
        )}
      </div>
    </div>
  )
}
