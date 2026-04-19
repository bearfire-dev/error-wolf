"use client"

import { useEffect, useRef } from "react"

import type { ThroughputBus } from "@/lib/simplify/throughput-bus"
import type {
  SimplifyPipelineStepId,
  SimplifyPipelineStepStatus,
} from "@/lib/simplify/types"
import { cn } from "@/lib/utils"

type LaneWaveformProps = {
  status: SimplifyPipelineStepStatus
  retries: number
  startedAtMs: number | null
  endedAtMs: number | null
  className?: string
  /** Optional throughput source; drives live amplitude when provided. */
  bus?: ThroughputBus | null
  /** Step ID used to query the bus. Required if `bus` is provided. */
  stepId?: SimplifyPipelineStepId
  /** Sliding window (ms) for rate measurement. Defaults to 300. */
  windowMs?: number
}

/**
 * Saturates a chars/sec rate to [0, 1]. `K` sets the "knee" — the rate at
 * which the curve hits ~63% activity. Tuned for typical LLM stream rates
 * where bursts land in the 200-1200 chars/sec range.
 */
const RATE_KNEE_CHARS_PER_SEC = 600
function normalizeRate(charsPerSec: number): number {
  if (charsPerSec <= 0) return 0
  return 1 - Math.exp(-charsPerSec / RATE_KNEE_CHARS_PER_SEC)
}

type Palette = {
  line: string
  glow: string
  baseline: string
}

type TargetProfile = {
  amplitude: number
  density: number
  noise: number
  speed: number
  palette: Palette
  ageBoost: number
}

function readCssColor(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  return raw || fallback
}

function buildPalettes(element: HTMLElement): {
  primary: Palette
  muted: Palette
  amber: Palette
  destructive: Palette
} {
  void element
  const primary = readCssColor("--primary", "oklch(0.55 0.16 150)")
  const muted = readCssColor("--muted-foreground", "oklch(0.5 0.02 150)")
  const amber = "oklch(0.78 0.17 78)"
  const destructive = readCssColor("--destructive", "oklch(0.55 0.22 27)")
  return {
    primary: { line: primary, glow: primary, baseline: muted },
    muted: { line: muted, glow: muted, baseline: muted },
    amber: { line: amber, glow: amber, baseline: muted },
    destructive: { line: destructive, glow: destructive, baseline: muted },
  }
}

function profileFor(
  status: SimplifyPipelineStepStatus,
  palettes: ReturnType<typeof buildPalettes>
): TargetProfile {
  switch (status) {
    case "running":
      return {
        // Base breath when there's no real throughput signal; the bus-driven
        // amplitude adds on top of this so the lane still feels alive during
        // the pre-first-token wait.
        amplitude: 0.18,
        density: 2.6,
        noise: 0.12,
        speed: 0.9,
        palette: palettes.primary,
        ageBoost: 0.08,
      }
    case "success":
      return {
        amplitude: 0,
        density: 0,
        noise: 0,
        speed: 0,
        palette: palettes.primary,
        ageBoost: 0,
      }
    case "warning":
      return {
        amplitude: 0.28,
        density: 1.6,
        noise: 0.12,
        speed: 0.35,
        palette: palettes.amber,
        ageBoost: 0,
      }
    case "error":
      return {
        amplitude: 0.72,
        density: 6,
        noise: 0.55,
        speed: 1.8,
        palette: palettes.destructive,
        ageBoost: 0,
      }
    case "pending":
    default:
      return {
        amplitude: 0,
        density: 0,
        noise: 0,
        speed: 0,
        palette: palettes.muted,
        ageBoost: 0,
      }
  }
}

function lerp(current: number, target: number, alpha: number): number {
  return current + (target - current) * Math.min(1, Math.max(0, alpha))
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/**
 * Pseudo-random 1D noise — cheap, deterministic per seed, good enough
 * to make the signal feel organic without a dependency.
 */
function noise1d(x: number, seed: number): number {
  const s = Math.sin(x * 12.9898 + seed * 78.233) * 43758.5453
  return (s - Math.floor(s)) * 2 - 1
}

export function LaneWaveform({
  status,
  retries,
  startedAtMs,
  endedAtMs,
  className,
  bus,
  stepId,
  windowMs = 300,
}: LaneWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stateRef = useRef({
    amplitude: 0,
    density: 0,
    noise: 0,
    speed: 0,
    retryPulse: 0,
    chunkPulse: 0,
    lastRetries: 0,
    lastStatus: "pending" as SimplifyPipelineStepStatus,
    startT: 0,
    lastFrame: 0,
    lastBusTickAt: 0,
  })
  // Keep the latest runtime inputs (bus/stepId/windowMs) accessible from the
  // rAF loop without forcing it to re-subscribe on every render. Updated via
  // effect so we don't touch refs during render.
  const runtimeRef = useRef<{
    bus: ThroughputBus | null
    stepId: SimplifyPipelineStepId | undefined
    windowMs: number
  }>({ bus: bus ?? null, stepId, windowMs })

  useEffect(() => {
    runtimeRef.current = { bus: bus ?? null, stepId, windowMs }
  }, [bus, stepId, windowMs])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const palettes = buildPalettes(canvas)
    const reduced = prefersReducedMotion()

    let rafId = 0
    let disposed = false

    const dpr = Math.min(
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
      2
    )

    const draw = (nowMs: number) => {
      if (disposed) return

      const st = stateRef.current
      const rect = canvas.getBoundingClientRect()
      const w = rect.width
      const h = rect.height
      if (w <= 0 || h <= 0) {
        rafId = requestAnimationFrame(draw)
        return
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const target = profileFor(status, palettes)

      // Age boost: while running, amplitude climbs gently with time
      // so that long-running branches read as "working harder". Real
      // throughput takes over once tokens start flowing.
      let ageBoostAmp = 0
      if (status === "running" && startedAtMs !== null) {
        const ageSec = Math.max(0, (nowMs - startedAtMs) / 1000)
        ageBoostAmp = Math.min(target.ageBoost, ageSec * 0.02)
      }

      // Throughput-driven amplitude from the bus (if any). Sampling a short
      // sliding window gives the "heartbeat" feel requested: amplitude
      // rises with bursts and falls when the stream quiets.
      let busAmp = 0
      const rt = runtimeRef.current
      const b = rt.bus
      const sid = rt.stepId
      if (b && sid && status === "running") {
        const rate = b.sampleRate(sid, rt.windowMs, nowMs)
        busAmp = normalizeRate(rate) * 0.8

        const lastAt = b.lastTickAt(sid)
        if (lastAt !== null && lastAt > st.lastBusTickAt) {
          // New chunk(s) since last frame — pulse the amplitude briefly.
          st.lastBusTickAt = lastAt
          st.chunkPulse = 1
        }
      } else if (status !== "running") {
        st.chunkPulse = 0
      }

      const dt = st.lastFrame === 0 ? 16 : nowMs - st.lastFrame
      st.lastFrame = nowMs
      const k = reduced ? 1 : 1 - Math.exp(-dt / 190)

      const targetAmp = target.amplitude + ageBoostAmp + busAmp
      // Density tracks activity too: more throughput → more wobble.
      const densityBoost = status === "running" ? busAmp * 2.5 : 0
      st.amplitude = lerp(st.amplitude, targetAmp, k)
      st.density = lerp(st.density, target.density + densityBoost, k)
      st.noise = lerp(st.noise, target.noise, k)
      st.speed = lerp(st.speed, target.speed + busAmp * 0.4, k)

      if (retries !== st.lastRetries) {
        st.lastRetries = retries
        st.retryPulse = 1
      }
      st.retryPulse = Math.max(0, st.retryPulse - dt / 650)
      // Chunk pulse decays in ~180ms.
      st.chunkPulse = Math.max(0, st.chunkPulse - dt / 180)

      const baselineY = h / 2
      const amp =
        (st.amplitude + st.retryPulse * 0.35 + st.chunkPulse * 0.28) *
        (h * 0.42)
      const phase = reduced ? 0 : (nowMs / 1000) * st.speed * 2.2
      const seed = startedAtMs ?? 1
      const palette = target.palette

      // Baseline: soft dotted line behind the signal.
      ctx.save()
      ctx.globalAlpha = status === "pending" ? 0.6 : 0.25
      ctx.setLineDash([2, 3])
      ctx.lineWidth = 1
      ctx.strokeStyle = palette.baseline
      ctx.beginPath()
      ctx.moveTo(0, baselineY)
      ctx.lineTo(w, baselineY)
      ctx.stroke()
      ctx.restore()

      if (amp < 0.4 && status !== "running" && status !== "error") {
        // Settled: draw a single solid hairline in the status color.
        ctx.save()
        ctx.globalAlpha = status === "pending" ? 0.35 : 1
        ctx.lineWidth = status === "success" ? 1.25 : 1
        ctx.strokeStyle = palette.line
        ctx.beginPath()
        ctx.moveTo(0, baselineY)
        ctx.lineTo(w, baselineY)
        ctx.stroke()
        ctx.restore()

        if (!reduced) rafId = requestAnimationFrame(draw)
        return
      }

      // Sample the signal across pixel-width columns.
      const step = 2
      const points: Array<[number, number]> = []
      for (let x = 0; x <= w; x += step) {
        const u = x / Math.max(1, w)
        const k1 = st.density * Math.PI * 2
        const k2 = st.density * Math.PI * 2 * 1.7 + 0.3
        const s1 = Math.sin(k1 * u + phase)
        const s2 = Math.sin(k2 * u + phase * 0.6)
        const n = st.noise * noise1d(x * 0.08 + phase * 0.3, seed)
        const y = baselineY + amp * (0.58 * s1 + 0.3 * s2 + n)
        points.push([x, y])
      }

      // Glow pass (under).
      if (!reduced && (status === "running" || status === "error")) {
        ctx.save()
        ctx.globalAlpha = 0.35
        ctx.lineWidth = 3
        ctx.strokeStyle = palette.glow
        ctx.filter = "blur(2px)"
        ctx.beginPath()
        for (let i = 0; i < points.length; i++) {
          const [x, y] = points[i]
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
        ctx.restore()
      }

      // Main signal.
      ctx.save()
      ctx.lineWidth = status === "error" ? 1.1 : 1.25
      ctx.strokeStyle = palette.line
      ctx.globalAlpha = 0.95
      ctx.beginPath()
      for (let i = 0; i < points.length; i++) {
        const [x, y] = points[i]
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.restore()

      if (!reduced) rafId = requestAnimationFrame(draw)
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const w = Math.max(2, Math.floor(rect.width))
      const h = Math.max(2, Math.floor(rect.height))
      canvas.width = w * dpr
      canvas.height = h * dpr
      if (reduced) {
        cancelAnimationFrame(rafId)
        rafId = requestAnimationFrame(draw)
      }
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()
    rafId = requestAnimationFrame(draw)

    return () => {
      disposed = true
      cancelAnimationFrame(rafId)
      observer.disconnect()
    }
  }, [status, retries, startedAtMs, endedAtMs])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn("block h-full w-full", className)}
    />
  )
}
