"use client"

import { useEffect, useRef, useState } from "react"

import { formatDuration } from "@/lib/recent-results"
import { cn } from "@/lib/utils"

import {
  normalizeRate,
  readCssVar,
  RATE_WINDOW_MS,
  statusLabel,
  statusTone,
  type InstrumentProps,
  type InstrumentStep,
} from "./types"

const BINS = 56
const SAMPLE_INTERVAL_MS = 55
const PEAK_DECAY_PER_SEC = 0.8

/**
 * Stacked spectrum analyzer: one horizontal strip per step with a trailing
 * bar history. Amplitude samples are derived from the throughput bus using
 * a short sliding window so the bars rise and decay with real stream bursts.
 */
export function SpectrumStack({ steps, bus }: InstrumentProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 overflow-hidden">
      {steps.map((step) => (
        <SpectrumStrip key={step.id} step={step} bus={bus} />
      ))}
    </div>
  )
}

function SpectrumStrip({
  step,
  bus,
}: {
  step: InstrumentStep
  bus: InstrumentProps["bus"]
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const stateRef = useRef({
    bins: new Float32Array(BINS),
    peaks: new Float32Array(BINS),
    lastSampleAt: 0,
    lastFrameAt: 0,
  })
  const stepRef = useRef(step)
  stepRef.current = step
  const busRef = useRef(bus ?? null)
  busRef.current = bus ?? null

  // Periodic state tick for the inline readouts (rate, elapsed). Kept off
  // the rAF loop so drawing is not gated by React reconciliation.
  const [readout, setReadout] = useState<{ rate: number; elapsed: number }>({
    rate: 0,
    elapsed: 0,
  })

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
      const st = stateRef.current
      const dt = Math.max(0, now - (st.lastFrameAt || now))
      st.lastFrameAt = now

      // Push a new amplitude sample into the rightmost bin.
      if (now - st.lastSampleAt >= SAMPLE_INTERVAL_MS) {
        st.lastSampleAt = now
        st.bins.copyWithin(0, 1, BINS)
        st.peaks.copyWithin(0, 1, BINS)
        const rate = busRef.current
          ? busRef.current.sampleRate(stepRef.current.id, RATE_WINDOW_MS, now)
          : 0
        const amp = normalizeRate(rate)
        st.bins[BINS - 1] = amp
        if (amp > st.peaks[BINS - 1]) st.peaks[BINS - 1] = amp
      }

      // Decay peaks toward current bin values.
      const decay = (PEAK_DECAY_PER_SEC * dt) / 1000
      for (let i = 0; i < BINS; i += 1) {
        if (st.peaks[i] > st.bins[i]) {
          st.peaks[i] = Math.max(st.bins[i], st.peaks[i] - decay)
        } else {
          st.peaks[i] = st.bins[i]
        }
      }

      // Draw.
      const rect = host.getBoundingClientRect()
      const w = rect.width
      const h = rect.height
      ctx.clearRect(0, 0, w, h)

      const s = stepRef.current
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
      const baseColor =
        s.status === "error"
          ? destructive
          : s.status === "warning"
            ? "oklch(0.78 0.16 70)"
            : s.status === "success" || s.status === "running"
              ? primary
              : muted

      const colWidth = w / BINS
      const barWidth = Math.max(1, colWidth * 0.78)
      const baseline = h - 1

      for (let i = 0; i < BINS; i += 1) {
        const v = st.bins[i]
        const isIdle = s.status !== "running" && v < 0.015
        const x = Math.round(i * colWidth)
        if (isIdle) {
          ctx.fillStyle = baseColor
          ctx.globalAlpha = s.status === "pending" ? 0.18 : 0.4
          ctx.fillRect(x, baseline - 1, barWidth, 1)
          ctx.globalAlpha = 1
          continue
        }
        const bh = Math.max(1.2, v * (h - 2))
        ctx.fillStyle = baseColor
        ctx.globalAlpha = 0.92
        ctx.fillRect(x, baseline - bh, barWidth, bh)

        const pk = st.peaks[i]
        if (pk > v + 0.05) {
          const py = Math.max(1, baseline - pk * (h - 2))
          ctx.globalAlpha = 0.7
          ctx.fillRect(x, py - 1, barWidth, 1)
        }
        ctx.globalAlpha = 1
      }

      // Thin baseline line under the strip for rhythm.
      ctx.globalAlpha = 0.25
      ctx.fillStyle = baseColor
      ctx.fillRect(0, baseline, w, 1)
      ctx.globalAlpha = 1
    }
    rafId = requestAnimationFrame(tick)

    const readoutId = window.setInterval(() => {
      const now = performance.now()
      const rate = busRef.current
        ? busRef.current.sampleRate(stepRef.current.id, 500, now)
        : 0
      const s = stepRef.current
      const elapsed =
        s.endedAtMs !== null && s.startedAtMs !== null
          ? s.endedAtMs - s.startedAtMs
          : s.startedAtMs !== null
            ? now - s.startedAtMs
            : 0
      setReadout({ rate, elapsed })
    }, 160)

    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
      window.clearInterval(readoutId)
    }
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-0.5 border-b border-foreground/10 pb-1 last:border-b-0 last:pb-0">
      <div className="flex shrink-0 items-baseline gap-2 font-mono text-[0.55rem] tracking-wider uppercase">
        <span className={cn("tabular-nums", statusTone(step.status))}>
          {statusLabel(step.status)}
        </span>
        <span className="min-w-0 truncate text-foreground/85">
          {step.label}
        </span>
        {step.retries > 0 && (
          <span className="shrink-0 text-muted-foreground">
            ×{step.retries + 1}
          </span>
        )}
        <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
          {formatDuration(Math.max(0, readout.elapsed))}
        </span>
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {readout.rate > 0 ? `${Math.round(readout.rate)} c/s` : "·"}
        </span>
      </div>
      <div
        ref={hostRef}
        className="relative min-h-0 flex-1 overflow-hidden"
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
