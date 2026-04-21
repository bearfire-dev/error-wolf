"use client"

// snapshot: not imported — see README.md in this folder.

import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { useBgPhotoTune } from "@/components/bg-photo-tune-provider"
import {
  BG_PHOTO_MIX_BLEND_OPTIONS,
  BG_PHOTO_QUALITY_OPTIONS,
  bgPhotoStorageKey,
  clampBgPhotoTune,
  formatTuneAsCssBlock,
  parseBgPhotoTune,
  type BgPhotoThemeKey,
  type BgPhotoTune,
} from "@/lib/bg-photo-tune"

function shouldShowTunerHud() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_BG_TUNER === "1"
  )
}

function RangeRow({
  id,
  label,
  min,
  max,
  step,
  value,
  onChange,
  hint,
}: {
  id: string
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-[0.625rem] text-muted-foreground tabular-nums">
          {value}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer accent-primary"
      />
      {hint ? (
        <p className="text-[0.625rem] leading-snug text-muted-foreground normal-case">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

function readTuneFromStorage(
  theme: BgPhotoThemeKey
): Partial<BgPhotoTune> | null {
  if (typeof window === "undefined") return null
  return parseBgPhotoTune(
    window.sessionStorage.getItem(bgPhotoStorageKey(theme))
  )
}

export function BackgroundTunerHud() {
  const { themeKey, tune, patchTune, resetTune } = useBgPhotoTune()
  const [copyState, setCopyState] = React.useState<"idle" | "done" | "err">(
    "idle"
  )

  const handleCopyCss = React.useCallback(async () => {
    const lightPartial = readTuneFromStorage("light") ?? {}
    const darkPartial = readTuneFromStorage("dark") ?? {}
    const light = clampBgPhotoTune("light", lightPartial)
    const dark = clampBgPhotoTune("dark", darkPartial)
    const text = [
      formatTuneAsCssBlock("light", light),
      "",
      formatTuneAsCssBlock("dark", dark),
    ].join("\n")
    try {
      await navigator.clipboard.writeText(text)
      setCopyState("done")
      window.setTimeout(() => setCopyState("idle"), 1400)
    } catch {
      setCopyState("err")
      window.setTimeout(() => setCopyState("idle"), 2000)
    }
  }, [])

  if (!shouldShowTunerHud()) return null

  return (
    <div
      className="pointer-events-auto fixed top-16 right-3 z-[100] no-scrollbar max-h-[calc(100dvh-5rem)] w-[min(18rem,calc(100vw-1.5rem))] overflow-y-auto"
      aria-label="Background photo tuner"
    >
      <Card
        size="sm"
        className="border-foreground/25 bg-background/95 shadow-none"
      >
        <CardHeader className="border-b border-foreground/15 pb-3">
          <CardTitle>bg tuner</CardTitle>
          <p className="text-[0.625rem] leading-snug text-muted-foreground normal-case">
            theme: {themeKey}. values persist in sessionStorage per theme.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <RangeRow
            id="bg-tuner-opacity"
            label="opacity"
            min={0}
            max={1}
            step={0.01}
            value={Number(tune.opacity.toFixed(2))}
            onChange={(v) => patchTune({ opacity: v })}
          />
          <RangeRow
            id="bg-tuner-mask-solid"
            label="mask solid (from bottom)"
            min={0}
            max={95}
            step={1}
            value={tune.maskSolidPct}
            onChange={(v) => patchTune({ maskSolidPct: v })}
            hint="How far up the strip stays fully visible before fading."
          />
          <RangeRow
            id="bg-tuner-mask-end"
            label="mask fade end"
            min={5}
            max={100}
            step={1}
            value={tune.maskFadeEndPct}
            onChange={(v) => patchTune({ maskFadeEndPct: v })}
            hint="Where the mask reaches fully transparent toward the top."
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bg-tuner-quality">image quality</Label>
            <select
              id="bg-tuner-quality"
              value={tune.quality}
              onChange={(e) => patchTune({ quality: Number(e.target.value) })}
              className="border border-foreground/20 bg-background px-2 py-1.5 font-mono text-[0.6875rem] text-foreground"
            >
              {BG_PHOTO_QUALITY_OPTIONS.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </div>
          <RangeRow
            id="bg-tuner-blur"
            label="blur (px)"
            min={0}
            max={16}
            step={0.5}
            value={tune.blurPx}
            onChange={(v) => patchTune({ blurPx: v })}
          />
          <RangeRow
            id="bg-tuner-bright"
            label="brightness"
            min={0.5}
            max={1.5}
            step={0.01}
            value={Number(tune.brightness.toFixed(2))}
            onChange={(v) => patchTune({ brightness: v })}
          />
          <RangeRow
            id="bg-tuner-contrast"
            label="contrast"
            min={0.5}
            max={1.5}
            step={0.01}
            value={Number(tune.contrast.toFixed(2))}
            onChange={(v) => patchTune({ contrast: v })}
          />
          <RangeRow
            id="bg-tuner-sat"
            label="saturate"
            min={0}
            max={1.8}
            step={0.01}
            value={Number(tune.saturate.toFixed(2))}
            onChange={(v) => patchTune({ saturate: v })}
          />
          <RangeRow
            id="bg-tuner-posx"
            label="object position X %"
            min={0}
            max={100}
            step={1}
            value={tune.posX}
            onChange={(v) => patchTune({ posX: v })}
          />
          <RangeRow
            id="bg-tuner-posy"
            label="object position Y %"
            min={0}
            max={100}
            step={1}
            value={tune.posY}
            onChange={(v) => patchTune({ posY: v })}
          />
          <RangeRow
            id="bg-tuner-scale"
            label="scale"
            min={0.85}
            max={1.5}
            step={0.01}
            value={Number(tune.scale.toFixed(2))}
            onChange={(v) => patchTune({ scale: v })}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bg-tuner-blend">mix blend mode</Label>
            <select
              id="bg-tuner-blend"
              value={tune.mixBlend}
              onChange={(e) => patchTune({ mixBlend: e.target.value })}
              className="border border-foreground/20 bg-background px-2 py-1.5 font-mono text-[0.6875rem] text-foreground"
            >
              {BG_PHOTO_MIX_BLEND_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-2 border-t border-foreground/15 pt-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={resetTune}
            >
              reset theme
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => void handleCopyCss()}
            >
              {copyState === "done"
                ? "copied"
                : copyState === "err"
                  ? "copy failed"
                  : "copy css"}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
