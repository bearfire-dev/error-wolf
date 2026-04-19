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

type Comet = {
  /** 0 = fresh arrival, increases each frame. */
  ageMs: number
  /** Radians the head sits at when this comet spawned. */
  angle: number
  /** Radius of the orbit this comet rides on. */
  radius: number
  /** Which step ring this comet belongs to. */
  stepIdx: number
  /** Initial intensity in [0, 1]. */
  intensity: number
}

type OrbitState = {
  lastTickAt: number
  /** Angular velocity in radians/sec (varies with status). */
  omega: number
  /** Smoothed activity in [0, 1] for ring thickness. */
  glow: number
}

/**
 * Baseline comet life; scaled dynamically at runtime against the adaptive
 * timebase so slow runs keep comets visible while bursty runs don't smear.
 */
const COMET_LIFE_BASE_MS = 900
const COMET_LIFE_MIN_MS = 180
const COMET_LIFE_MAX_MS = 2200

/**
 * Orbital constellation / radar. A central pulsar responds to summed
 * throughput; each step is a concentric ring with an orbiting glyph. A
 * chunk arrival spawns a comet streak that decays around the ring.
 */
export function Constellation({ steps, bus }: InstrumentProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const orbitsRef = useRef(new Map<string, OrbitState>())
  const cometsRef = useRef<Comet[]>([])
  const pulseRef = useRef(0)
  const timebaseRef = useRef(
    createAdaptiveTimebase({ defaultIntervalMs: 50, defaultWindowMs: 180 })
  )
  const cometLifeRef = useRef(COMET_LIFE_BASE_MS)
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
    let prevFrameAt = 0
    let angle = 0
    const tick = () => {
      rafId = requestAnimationFrame(tick)
      const now = performance.now()
      const dt = prevFrameAt === 0 ? 16 : now - prevFrameAt
      prevFrameAt = now
      angle += dt / 1000

      const current = stepsRef.current
      const count = Math.max(1, current.length)

      timebaseRef.current.update(busRef.current, current, now)
      const windowMs = timebaseRef.current.windowMs
      // Comet life scales so a chunk-streak lasts roughly 18 sample intervals
      // — long enough to see when arrivals are sparse, short enough that a
      // burst doesn't paint over itself.
      cometLifeRef.current = Math.min(
        COMET_LIFE_MAX_MS,
        Math.max(COMET_LIFE_MIN_MS, timebaseRef.current.intervalMs * 18)
      )

      // Update per-step orbit state and spawn comets on new ticks.
      let summedGlow = 0
      for (let i = 0; i < current.length; i += 1) {
        const step = current[i]
        let state = orbitsRef.current.get(step.id)
        if (!state) {
          state = { lastTickAt: 0, omega: 0.35, glow: 0 }
          orbitsRef.current.set(step.id, state)
        }
        const rate = busRef.current
          ? busRef.current.sampleRate(step.id, windowMs, now)
          : 0
        const activity = normalizeRate(rate)
        state.glow = state.glow * 0.9 + activity * 0.1
        summedGlow += state.glow
        state.omega =
          step.status === "running"
            ? 0.9 + activity * 1.8
            : step.status === "success"
              ? 0.35
              : step.status === "pending"
                ? 0.1
                : 0.5

        const tickAt = busRef.current?.lastTickAt(step.id) ?? 0
        if (tickAt && tickAt > state.lastTickAt) {
          state.lastTickAt = tickAt
          cometsRef.current.push({
            ageMs: 0,
            angle: angle * state.omega + i * 0.37,
            radius: 0, // set at draw time from geometry
            stepIdx: i,
            intensity: Math.min(1, 0.55 + activity * 0.8),
          })
        }
      }

      // Central pulsar reacts to summed glow.
      const aggregate = Math.min(1, summedGlow / Math.max(1, count * 0.7))
      pulseRef.current = pulseRef.current * 0.85 + aggregate * 0.15

      // Age comets.
      const life = cometLifeRef.current
      const alive: Comet[] = []
      for (const c of cometsRef.current) {
        c.ageMs += dt
        if (c.ageMs < life) alive.push(c)
      }
      cometsRef.current = alive

      // Draw.
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
      const warning = "oklch(0.78 0.16 70)"

      const cx = w / 2
      const cy = h / 2
      const maxR = Math.min(w, h) * 0.45
      const innerR = Math.max(10, maxR * 0.18)
      const ringStep = Math.max(8, (maxR - innerR) / Math.max(count, 1))

      // Tick marks around the perimeter.
      ctx.strokeStyle = muted
      ctx.globalAlpha = 0.35
      ctx.lineWidth = 1
      for (let t = 0; t < 72; t += 1) {
        const a = (t / 72) * Math.PI * 2
        const r0 = maxR - 2
        const r1 = t % 6 === 0 ? maxR - 9 : maxR - 4
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0)
        ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // Rings.
      for (let i = 0; i < count; i += 1) {
        const step = current[i]
        const state = orbitsRef.current.get(step.id)
        const r = innerR + ringStep * (i + 0.5)
        const color = ringColor(step.status, {
          primary,
          destructive,
          muted,
          warning,
        })
        const baseAlpha =
          step.status === "pending" ? 0.2 : step.status === "running" ? 0.7 : 0.45
        const glow = state?.glow ?? 0
        ctx.strokeStyle = color
        ctx.globalAlpha = baseAlpha + glow * 0.35
        ctx.lineWidth = 1 + glow * 2
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.stroke()

        // Orbiting glyph.
        const omega = state?.omega ?? 0.3
        const a = angle * omega + i * 0.37
        const gx = cx + Math.cos(a) * r
        const gy = cy + Math.sin(a) * r
        ctx.fillStyle = color
        ctx.globalAlpha = Math.min(1, baseAlpha + 0.3)
        ctx.beginPath()
        ctx.arc(gx, gy, 2.4 + glow * 1.6, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1

        // Tick label (decorative — step index on outer side of ring).
        ctx.fillStyle = muted
        ctx.globalAlpha = 0.55
        ctx.font = `${Math.max(8, Math.min(10, h / 26))}px var(--font-space-mono), ui-monospace, monospace`
        ctx.textBaseline = "middle"
        ctx.textAlign = "left"
        const labelAngle = i * 0.37 + Math.PI / 2
        const lx = cx + Math.cos(labelAngle) * (r + 6)
        const ly = cy + Math.sin(labelAngle) * (r + 6)
        ctx.fillText(
          `${(i + 1).toString().padStart(2, "0")}`,
          lx,
          ly
        )
        ctx.globalAlpha = 1
      }

      // Comets.
      for (const c of cometsRef.current) {
        const step = current[c.stepIdx]
        if (!step) continue
        const state = orbitsRef.current.get(step.id)
        const omega = state?.omega ?? 0.3
        const r = innerR + ringStep * (c.stepIdx + 0.5)
        c.radius = r
        const progress = c.ageMs / life
        const alpha = (1 - progress) * c.intensity
        const head = c.angle + (c.ageMs / 1000) * omega
        const tail = head - 0.9
        const color = ringColor(step.status, {
          primary,
          destructive,
          muted,
          warning,
        })
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.globalAlpha = alpha
        ctx.beginPath()
        ctx.arc(cx, cy, r, tail, head)
        ctx.stroke()

        // Head dot.
        ctx.fillStyle = color
        ctx.globalAlpha = alpha
        ctx.beginPath()
        ctx.arc(
          cx + Math.cos(head) * r,
          cy + Math.sin(head) * r,
          2.4,
          0,
          Math.PI * 2
        )
        ctx.fill()
        ctx.globalAlpha = 1
      }

      // Central pulsar.
      const pulse = pulseRef.current
      const haloR = innerR * (0.9 + pulse * 0.6)
      const haloGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR)
      haloGrad.addColorStop(0, primary)
      haloGrad.addColorStop(0.6, `color-mix(in oklch, ${primary} 40%, transparent)`)
      haloGrad.addColorStop(1, "transparent")
      ctx.fillStyle = haloGrad
      ctx.globalAlpha = 0.5 + pulse * 0.5
      ctx.beginPath()
      ctx.arc(cx, cy, haloR, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1

      ctx.fillStyle = primary
      ctx.beginPath()
      ctx.arc(cx, cy, 2.8 + pulse * 2.4, 0, Math.PI * 2)
      ctx.fill()
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
        {steps.map((step, idx) => (
          <RingLegend key={step.id} step={step} idx={idx} />
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

function RingLegend({ step, idx }: { step: InstrumentStep; idx: number }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="tabular-nums text-muted-foreground">
        {(idx + 1).toString().padStart(2, "0")}
      </span>
      <span
        aria-hidden
        className={cn(
          "inline-block size-1.5 translate-y-[-1px] rounded-full",
          dotToneClass(step.status)
        )}
      />
      <span className={cn("tabular-nums", statusTone(step.status))}>
        {statusLabel(step.status)}
      </span>
      <span className="text-foreground/80">{step.label}</span>
    </span>
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

function ringColor(
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
