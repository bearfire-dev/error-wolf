"use client"

import { useEffect, useRef } from "react"

import { cn } from "@/lib/utils"

import {
  createAdaptiveTimebase,
  normalizeRate,
  readCssVar,
  statusLabel,
  statusTone,
  type InstrumentProps,
  type InstrumentStep,
} from "./types"

const MAX_ROWS = 140

/**
 * Waterfall spectrogram: a 2D intensity grid that scrolls top-to-bottom.
 * Columns = steps, rows = time (newest at top). Cells are colored by the
 * step's status and saturated by normalized chunk rate.
 */
export function Waterfall({ steps, bus }: InstrumentProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const rowsRef = useRef<
    { values: Float32Array; status: InstrumentStep["status"][] }[]
  >([])
  const lastRowAtRef = useRef(0)
  const timebaseRef = useRef(
    createAdaptiveTimebase({ defaultIntervalMs: 80, defaultWindowMs: 240 })
  )
  const stepsRef = useRef(steps)
  stepsRef.current = steps
  const busRef = useRef(bus ?? null)
  busRef.current = bus ?? null

  useEffect(() => {
    const canvas = canvasRef.current
    const host = hostRef.current
    if (!canvas || !host) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = host.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host)
    resize()

    let rafId = 0
    const tick = () => {
      rafId = requestAnimationFrame(tick)
      const now = performance.now()
      const current = stepsRef.current
      const cols = Math.max(1, current.length)

      timebaseRef.current.update(busRef.current, current, now)
      const rowIntervalMs = timebaseRef.current.intervalMs
      const windowMs = timebaseRef.current.windowMs

      if (now - lastRowAtRef.current >= rowIntervalMs) {
        lastRowAtRef.current = now
        const values = new Float32Array(cols)
        const status: InstrumentStep["status"][] = []
        for (let i = 0; i < cols; i += 1) {
          const step = current[i]
          const rate = busRef.current
            ? busRef.current.sampleRate(step.id, windowMs, now)
            : 0
          values[i] = normalizeRate(rate)
          status.push(step.status)
        }
        rowsRef.current.unshift({ values, status })
        if (rowsRef.current.length > MAX_ROWS) {
          rowsRef.current.length = MAX_ROWS
        }
      }

      const rect = host.getBoundingClientRect()
      const w = rect.width
      const h = rect.height
      ctx.clearRect(0, 0, w, h)

      const primary = readCssVar(canvas, "--primary", "oklch(0.8 0.18 145)")
      const destructive = readCssVar(
        canvas,
        "--destructive",
        "oklch(0.6 0.2 28)"
      )
      const muted = readCssVar(
        canvas,
        "--muted-foreground",
        "oklch(0.6 0 0)"
      )
      const border = readCssVar(
        canvas,
        "--border",
        "color-mix(in oklch, currentColor 12%, transparent)"
      )
      const warning = "oklch(0.78 0.16 70)"

      // Reserve axis column on the right for time ticks.
      const axisW = 34
      const gridW = Math.max(10, w - axisW)
      const colWidth = gridW / cols
      const rowHeight = Math.max(1.5, h / MAX_ROWS)

      // Paint rows newest (top) to oldest.
      const rows = rowsRef.current
      for (let r = 0; r < rows.length; r += 1) {
        const row = rows[r]
        const y = r * rowHeight
        if (y > h) break
        for (let c = 0; c < cols; c += 1) {
          const v = row.values[c]
          if (v <= 0.01) continue
          const color = cellColor(row.status[c], {
            primary,
            destructive,
            muted,
            warning,
          })
          // Age-based brightness falloff for a CRT-phosphor feel.
          const age = 1 - r / MAX_ROWS
          ctx.globalAlpha = Math.min(1, v * age * 1.15)
          ctx.fillStyle = color
          ctx.fillRect(
            Math.round(c * colWidth),
            Math.round(y),
            Math.ceil(colWidth + 0.5),
            Math.ceil(rowHeight + 0.5)
          )
        }
      }
      ctx.globalAlpha = 1

      // Column separators.
      ctx.strokeStyle = border
      ctx.globalAlpha = 0.5
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let c = 1; c < cols; c += 1) {
        const x = Math.round(c * colWidth) + 0.5
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
      }
      // Axis divider.
      const axisX = Math.round(gridW) + 0.5
      ctx.moveTo(axisX, 0)
      ctx.lineTo(axisX, h)
      ctx.stroke()
      ctx.globalAlpha = 1

      // Time axis labels on the right (scale with adaptive row interval).
      ctx.fillStyle = muted
      ctx.font = `${Math.max(8, Math.min(10, h / 22))}px var(--font-space-mono), ui-monospace, monospace`
      ctx.textBaseline = "middle"
      ctx.textAlign = "left"
      const totalMs = MAX_ROWS * rowIntervalMs
      const ticks = [0, 0.25, 0.5, 0.75, 1]
      for (const frac of ticks) {
        const ms = frac * totalMs
        const label =
          ms === 0
            ? "now"
            : ms < 1000
              ? `-${Math.round(ms)}ms`
              : `-${(ms / 1000).toFixed(ms / 1000 >= 10 ? 0 : 1)}s`
        const y = Math.min(h - 4, Math.max(8, frac * h))
        ctx.fillText(label, gridW + 4, y)
      }
      ctx.textAlign = "left"
    }
    rafId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
    }
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <div className="grid shrink-0 gap-1 pr-[34px] font-mono text-[0.55rem] tracking-wider uppercase"
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, steps.length)}, minmax(0, 1fr))`,
        }}
      >
        {steps.map((step) => (
          <WaterfallHeader key={step.id} step={step} />
        ))}
      </div>
      <div
        ref={hostRef}
        className="relative min-h-0 flex-1 overflow-hidden border border-foreground/15 bg-background/60"
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 size-full"
          aria-hidden
        />
      </div>
    </div>
  )
}

function WaterfallHeader({ step }: { step: InstrumentStep }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1">
      <span
        aria-hidden
        className={cn(
          "inline-block size-1.5 translate-y-[-1px]",
          dotToneClass(step.status)
        )}
      />
      <span className={cn("tabular-nums", statusTone(step.status))}>
        {statusLabel(step.status)}
      </span>
      <span className="min-w-0 truncate text-foreground/80">{step.label}</span>
    </div>
  )
}

function dotToneClass(status: InstrumentStep["status"]): string {
  switch (status) {
    case "success":
    case "running":
      return "bg-primary"
    case "warning":
      return "bg-amber-500"
    case "error":
      return "bg-destructive"
    default:
      return "bg-muted-foreground/40"
  }
}

function cellColor(
  status: InstrumentStep["status"],
  palette: {
    primary: string
    destructive: string
    muted: string
    warning: string
  }
): string {
  switch (status) {
    case "error":
      return palette.destructive
    case "warning":
      return palette.warning
    case "success":
    case "running":
      return palette.primary
    default:
      return palette.muted
  }
}
