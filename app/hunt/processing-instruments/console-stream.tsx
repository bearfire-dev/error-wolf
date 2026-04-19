"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"

import type { ThroughputBus } from "@/lib/simplify/throughput-bus"
import type {
  SimplifyPipelineStepId,
  SimplifyPipelineStepStatus,
} from "@/lib/simplify/types"
import { cn } from "@/lib/utils"

import type { InstrumentStep } from "./types"

type ConsoleEntry = {
  /** Wall-clock ms when we observed this entry. */
  atMs: number
  kind: "chunk" | "status" | "boot"
  stepId: SimplifyPipelineStepId | null
  label: string
  detail: string
  tone: SimplifyPipelineStepStatus | "dim" | "accent"
}

type Props = {
  steps: InstrumentStep[]
  bus?: ThroughputBus | null
}

const MAX_ENTRIES = 160
const VISIBLE_TAIL = 10
const POLL_MS = 90

/**
 * Terminal-style tail of streaming activity. Watches `bus.getEvents` for new
 * chunk timestamps and diffs `steps[*].status` between polls to emit both
 * chunk lines and status transitions. Purely decorative — the log does not
 * reflect real token text (we never capture it).
 */
export function ConsoleStream({ steps, bus }: Props) {
  const entriesRef = useRef<ConsoleEntry[]>([])
  const lastSeenTsRef = useRef(new Map<SimplifyPipelineStepId, number>())
  const lastStatusRef = useRef(
    new Map<SimplifyPipelineStepId, SimplifyPipelineStepStatus>()
  )
  const epochRef = useRef<number | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    // Seed boot line once per mount so the console never looks empty during
    // pending state.
    if (entriesRef.current.length === 0) {
      entriesRef.current.push({
        atMs: performance.now(),
        kind: "boot",
        stepId: null,
        label: "sys",
        detail: "stream attached",
        tone: "accent",
      })
    }

    const id = window.setInterval(() => {
      const now = performance.now()
      let changed = false

      for (const step of steps) {
        // New chunk timestamps since last poll.
        const lastSeen = lastSeenTsRef.current.get(step.id) ?? 0
        const events = bus?.getEvents(step.id) ?? []
        let newest = lastSeen
        for (const evt of events) {
          if (evt.t <= lastSeen) continue
          if (epochRef.current === null) epochRef.current = evt.t
          entriesRef.current.push({
            atMs: evt.t,
            kind: "chunk",
            stepId: step.id,
            label: step.label,
            detail: `+${evt.n.toString().padStart(3, " ")}`,
            tone: "accent",
          })
          if (evt.t > newest) newest = evt.t
          changed = true
        }
        if (newest !== lastSeen) {
          lastSeenTsRef.current.set(step.id, newest)
        }

        // Status transitions.
        const prevStatus = lastStatusRef.current.get(step.id) ?? "pending"
        if (prevStatus !== step.status) {
          lastStatusRef.current.set(step.id, step.status)
          const duration =
            step.endedAtMs !== null && step.startedAtMs !== null
              ? Math.max(0, Math.round(step.endedAtMs - step.startedAtMs))
              : null
          entriesRef.current.push({
            atMs: now,
            kind: "status",
            stepId: step.id,
            label: step.label,
            detail:
              step.status === "success" && duration !== null
                ? `ok · ${duration}ms`
                : step.status === "error"
                  ? "fail"
                  : step.status === "warning"
                    ? "warn"
                    : step.status === "running"
                      ? `attempt ${step.retries + 1}`
                      : step.status,
            tone: step.status,
          })
          changed = true
        }
      }

      if (changed) {
        if (entriesRef.current.length > MAX_ENTRIES) {
          entriesRef.current.splice(
            0,
            entriesRef.current.length - MAX_ENTRIES
          )
        }
        setTick((t) => t + 1)
      }
    }, POLL_MS)

    return () => window.clearInterval(id)
  }, [steps, bus])

  const visible = entriesRef.current.slice(-VISIBLE_TAIL)
  const scrollerRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [visible.length, entriesRef.current.length])

  return (
    <div className="flex h-full min-h-0 flex-col gap-1 border border-foreground/15 bg-background/60 px-2 py-1.5 font-mono text-[0.55rem] tracking-wider uppercase">
      <div className="flex shrink-0 items-center justify-between gap-2 text-muted-foreground">
        <span>console · stream</span>
        <span className="tabular-nums">
          {entriesRef.current.length.toString().padStart(4, "0")}
        </span>
      </div>
      <div
        ref={scrollerRef}
        className="relative min-h-0 flex-1 overflow-hidden"
        aria-live="polite"
      >
        <ol role="list" className="flex flex-col gap-[1px]">
          {visible.map((entry, idx) => (
            <li
              key={`${entry.atMs}-${entry.kind}-${entry.stepId ?? "sys"}-${idx}`}
              className={cn(
                "flex items-baseline gap-2 tabular-nums",
                toneClass(entry.tone)
              )}
            >
              <span className="shrink-0 text-muted-foreground">
                {formatOffset(entry.atMs, epochRef.current)}
              </span>
              <span className="shrink-0 text-foreground/60">
                {kindGlyph(entry.kind)}
              </span>
              <span className="min-w-0 shrink-0 text-foreground/85">
                {entry.label}
              </span>
              <span className="min-w-0 flex-1 truncate">{entry.detail}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

function formatOffset(atMs: number, epoch: number | null): string {
  if (epoch === null) return "  --.---"
  const rel = Math.max(0, atMs - epoch)
  const s = Math.floor(rel / 1000)
  const ms = Math.floor(rel % 1000)
  return `${s.toString().padStart(3, " ")}.${ms.toString().padStart(3, "0")}`
}

function kindGlyph(kind: ConsoleEntry["kind"]): string {
  switch (kind) {
    case "chunk":
      return "»"
    case "status":
      return "·"
    case "boot":
      return "~"
  }
}

function toneClass(tone: ConsoleEntry["tone"]): string {
  switch (tone) {
    case "accent":
    case "success":
      return "text-primary"
    case "running":
      return "text-foreground"
    case "warning":
      return "text-amber-600 dark:text-amber-400"
    case "error":
      return "text-destructive"
    case "pending":
    case "dim":
    default:
      return "text-muted-foreground"
  }
}
