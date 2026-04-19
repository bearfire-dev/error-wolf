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

const TRACE_LEN = 220

type StepBuffer = {
  /** Circular buffer of amplitude samples in [0, 1]. */
  samples: Float32Array
  /** Last wall-clock timestamp observed for the step, for heartbeat flashes. */
  lastTickAt: number
  /** Flash energy in [0, 1] that decays each frame. */
  flash: number
}

/**
 * Single CRT pane with overlaid traces — one per step. Amplitude comes from
 * the throughput bus and a new chunk triggers a brief luminance flash on
 * that step's trace, so the eye catches it without reading labels.
 */
export function Oscilloscope({ steps, bus }: InstrumentProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const stepsRef = useRef(steps)
  stepsRef.current = steps
  const busRef = useRef(bus ?? null)
  busRef.current = bus ?? null
  const buffersRef = useRef(new Map<string, StepBuffer>())
  const lastSampleAtRef = useRef(0)
  const timebaseRef = useRef(
    createAdaptiveTimebase({ defaultIntervalMs: 30, defaultWindowMs: 120 })
  )

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

    function getBuffer(id: string): StepBuffer {
      let b = buffersRef.current.get(id)
      if (!b) {
        b = {
          samples: new Float32Array(TRACE_LEN),
          lastTickAt: 0,
          flash: 0,
        }
        buffersRef.current.set(id, b)
      }
      return b
    }

    let rafId = 0
    let prevFrameAt = 0
    const tick = () => {
      rafId = requestAnimationFrame(tick)
      const now = performance.now()
      const dt = prevFrameAt === 0 ? 16 : now - prevFrameAt
      prevFrameAt = now

      timebaseRef.current.update(busRef.current, stepsRef.current, now)
      const sampleIntervalMs = timebaseRef.current.intervalMs
      const windowMs = timebaseRef.current.windowMs

      const takeSample = now - lastSampleAtRef.current >= sampleIntervalMs
      if (takeSample) lastSampleAtRef.current = now

      for (const step of stepsRef.current) {
        const buf = getBuffer(step.id)
        if (takeSample) {
          buf.samples.copyWithin(0, 1, TRACE_LEN)
          const rate = busRef.current
            ? busRef.current.sampleRate(step.id, windowMs, now)
            : 0
          buf.samples[TRACE_LEN - 1] = normalizeRate(rate)
        }

        const tickAt = busRef.current?.lastTickAt(step.id) ?? 0
        if (tickAt && tickAt > buf.lastTickAt) {
          buf.lastTickAt = tickAt
          buf.flash = 1
        }
        buf.flash = Math.max(0, buf.flash - dt / 260)
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

      // Reticle: 8 columns x 6 rows
      ctx.strokeStyle = border
      ctx.globalAlpha = 0.45
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let c = 1; c < 8; c += 1) {
        const x = Math.round((w * c) / 8) + 0.5
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
      }
      for (let r = 1; r < 6; r += 1) {
        const y = Math.round((h * r) / 6) + 0.5
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
      }
      ctx.stroke()
      ctx.globalAlpha = 1

      // Center crosshair (brighter).
      ctx.strokeStyle = muted
      ctx.globalAlpha = 0.3
      ctx.beginPath()
      ctx.moveTo(Math.round(w / 2) + 0.5, 0)
      ctx.lineTo(Math.round(w / 2) + 0.5, h)
      ctx.moveTo(0, Math.round(h / 2) + 0.5)
      ctx.lineTo(w, Math.round(h / 2) + 0.5)
      ctx.stroke()
      ctx.globalAlpha = 1

      // Corner tick labels (decorative).
      ctx.fillStyle = muted
      ctx.globalAlpha = 0.8
      ctx.font = `${Math.max(8, Math.min(10, h / 22))}px var(--font-space-mono), ui-monospace, monospace`
      ctx.textBaseline = "top"
      ctx.fillText("+1.0", 4, 2)
      ctx.fillText("0.0", 4, Math.round(h / 2) - 5)
      ctx.fillText("-1.0", 4, h - 10)
      ctx.textAlign = "right"
      const sweepMs = sampleIntervalMs * TRACE_LEN
      ctx.fillText(formatSweep(sweepMs), w - 4, 2)
      ctx.fillText("0s", w - 4, h - 10)
      ctx.textAlign = "left"
      ctx.globalAlpha = 1

      // Traces per step.
      const visibleSteps = stepsRef.current
      for (let idx = 0; idx < visibleSteps.length; idx += 1) {
        const step = visibleSteps[idx]
        const buf = getBuffer(step.id)
        const color = traceColor(step.status, {
          primary,
          destructive,
          muted,
          warning: "oklch(0.78 0.16 70)",
        })
        const baseAlpha =
          step.status === "running"
            ? 0.85
            : step.status === "success"
              ? 0.7
              : step.status === "pending"
                ? 0.35
                : 0.75
        const flashBoost = buf.flash * 0.35
        ctx.strokeStyle = color
        ctx.globalAlpha = Math.min(1, baseAlpha + flashBoost)
        // Each step gets a slightly different vertical offset so overlapping
        // traces remain visually legible.
        const offset = (idx - (visibleSteps.length - 1) / 2) * 4
        ctx.lineWidth = step.status === "running" ? 1.4 : 1
        ctx.beginPath()
        for (let i = 0; i < TRACE_LEN; i += 1) {
          const x = (i / (TRACE_LEN - 1)) * w
          const v = buf.samples[i]
          const y = h / 2 - v * (h * 0.42) + offset
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()

        // Rightmost "now" dot pulse on new chunks.
        if (buf.flash > 0.05) {
          const xN = w - 1
          const yN = h / 2 - buf.samples[TRACE_LEN - 1] * (h * 0.42) + offset
          ctx.globalAlpha = buf.flash
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(xN, yN, 2.4, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = 1
      }
    }
    rafId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
    }
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <div className="flex shrink-0 flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[0.55rem] tracking-wider uppercase">
        {steps.map((step) => (
          <ScopeLegend key={step.id} step={step} />
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

function formatSweep(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—"
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = ms / 1000
  return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`
}

function ScopeLegend({ step }: { step: InstrumentStep }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span
        aria-hidden
        className={cn(
          "inline-block size-1.5 translate-y-[-1px]",
          ledToneClass(step.status)
        )}
      />
      <span className={cn("tabular-nums", statusTone(step.status))}>
        {statusLabel(step.status)}
      </span>
      <span className="text-foreground/80">{step.label}</span>
    </span>
  )
}

function ledToneClass(status: InstrumentStep["status"]): string {
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

function traceColor(
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
