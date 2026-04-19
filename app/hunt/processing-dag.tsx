"use client"

import { useMemo } from "react"

import type { SimplifyPipelineNode } from "@/lib/simplify/pipeline-dag"
import type { ThroughputBus } from "@/lib/simplify/throughput-bus"
import type {
  SimplifyPipelineStepId,
  SimplifyProgressSnapshot,
  SimplifyProgressStep,
} from "@/lib/simplify/types"
import { cn } from "@/lib/utils"

import { ConsoleStream } from "./processing-instruments/console-stream"
import { Constellation } from "./processing-instruments/constellation"
import { Oscilloscope } from "./processing-instruments/oscilloscope"
import { SpectrumStack } from "./processing-instruments/spectrum-stack"
import type { InstrumentStep } from "./processing-instruments/types"
import { Waterfall } from "./processing-instruments/waterfall"

/**
 * Preserved for compatibility with existing call sites during the picker
 * round. The new layout is a single instrument panel + console, so the tier
 * distinctions only affect the container padding/radius — not the contents.
 */
export type DagTier = "roomy" | "compact" | "dense"

export type ProcessingInstrumentVariant =
  | "spectrum"
  | "scope"
  | "waterfall"
  | "constellation"

export const PROCESSING_INSTRUMENT_VARIANTS: {
  id: ProcessingInstrumentVariant
  label: string
}[] = [
  { id: "spectrum", label: "Stacked spectrum" },
  { id: "scope", label: "Oscilloscope" },
  { id: "waterfall", label: "Waterfall" },
  { id: "constellation", label: "Constellation" },
]

type ProcessingDagProps = {
  progress: SimplifyProgressSnapshot | null
  dag: SimplifyPipelineNode[]
  nowMs: number
  /** Disables the initial container stagger animation (used during replay). */
  disableEnter?: boolean
  /** Pins the container density. Currently only affects outer padding. */
  tier?: DagTier
  /** Kept for API compatibility with the previous DAG zoom-to-fit. No-op. */
  disableZoom?: boolean
  /** Throughput source — drives waveforms and the console tail. */
  bus?: ThroughputBus | null
  /**
   * Pins a specific instrument variant. When omitted, all four variants are
   * rendered under a `data-uidotsh-pick` wrapper so the ui.sh picker can
   * cycle through them; one is visible at a time.
   */
  variant?: ProcessingInstrumentVariant
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

/**
 * Top-level shell for the 03 COMP state. Renders a single decorative
 * "instrument" panel over a streaming console. The actual instrument is
 * wrapped in a `data-uidotsh-pick` group so the ui-picker can cycle between
 * variants; after finalize, unpicked branches and the wrapper attrs are
 * removed.
 */
export function ProcessingDag({
  progress,
  dag,
  nowMs,
  disableEnter,
  tier = "compact",
  bus,
  variant,
}: ProcessingDagProps) {
  const steps = useMemo<InstrumentStep[]>(() => {
    const byId = new Map<string, SimplifyProgressStep>()
    if (progress) {
      for (const step of progress.steps) byId.set(step.id, step)
    }
    return dag.map((node) => {
      const p = byId.get(node.id)
      return {
        id: node.id as SimplifyPipelineStepId,
        label: node.label,
        status: p?.status ?? PENDING_STEP.status,
        startedAtMs: p?.startedAtMs ?? PENDING_STEP.startedAtMs,
        endedAtMs: p?.endedAtMs ?? PENDING_STEP.endedAtMs,
        retries: p?.retries ?? PENDING_STEP.retries,
      }
    })
  }, [dag, progress])

  const instrumentProps = { steps, bus: bus ?? null, nowMs }

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full flex-col gap-2 overflow-hidden",
        tier === "dense" ? "p-1" : tier === "roomy" ? "p-2" : "p-1.5",
        !disableEnter && "ew-lane-enter"
      )}
    >
      <div className="min-h-0 flex-[7]">
        {variant ? (
          renderInstrument(variant, instrumentProps)
        ) : (
          <div
            data-uidotsh-pick="Processing instrument"
            className="contents"
          >
            <div
              data-uidotsh-option="Stacked spectrum"
              className="contents"
            >
              <SpectrumStack {...instrumentProps} />
            </div>
            <div
              data-uidotsh-option="Oscilloscope"
              className="contents"
              hidden
            >
              <Oscilloscope {...instrumentProps} />
            </div>
            <div
              data-uidotsh-option="Waterfall"
              className="contents"
              hidden
            >
              <Waterfall {...instrumentProps} />
            </div>
            <div
              data-uidotsh-option="Constellation"
              className="contents"
              hidden
            >
              <Constellation {...instrumentProps} />
            </div>
          </div>
        )}
      </div>
      <div className="min-h-0 flex-[3]">
        <ConsoleStream steps={steps} bus={bus ?? null} />
      </div>
    </div>
  )
}

function renderInstrument(
  variant: ProcessingInstrumentVariant,
  props: {
    steps: InstrumentStep[]
    bus: ThroughputBus | null
    nowMs: number
  }
) {
  switch (variant) {
    case "scope":
      return <Oscilloscope {...props} />
    case "waterfall":
      return <Waterfall {...props} />
    case "constellation":
      return <Constellation {...props} />
    case "spectrum":
    default:
      return <SpectrumStack {...props} />
  }
}
