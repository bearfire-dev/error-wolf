// snapshot: not imported — see README.md in this folder.

export type BgPhotoThemeKey = "light" | "dark"

export type BgPhotoTune = {
  quality: number
  opacity: number
  maskSolidPct: number
  maskFadeEndPct: number
  blurPx: number
  brightness: number
  contrast: number
  saturate: number
  posX: number
  posY: number
  scale: number
  mixBlend: string
}

export const BG_PHOTO_STORAGE_PREFIX = "error-wolf:bg-photo-tune:"

export const BG_PHOTO_QUALITY_OPTIONS = [
  25, 35, 45, 55, 65, 75, 85, 90, 100,
] as const

export const BG_PHOTO_MIX_BLEND_OPTIONS = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "soft-light",
  "hard-light",
  "darken",
  "lighten",
  "color-dodge",
  "luminosity",
] as const

export const BG_PHOTO_DEFAULT_LIGHT: BgPhotoTune = {
  quality: 75,
  opacity: 0.44,
  maskSolidPct: 62,
  maskFadeEndPct: 100,
  blurPx: 0,
  brightness: 0.89,
  contrast: 0.8,
  saturate: 0.76,
  posX: 50,
  posY: 100,
  scale: 1.01,
  mixBlend: "normal",
}

export const BG_PHOTO_DEFAULT_DARK: BgPhotoTune = {
  quality: 75,
  opacity: 0.39,
  maskSolidPct: 41,
  maskFadeEndPct: 86,
  blurPx: 0,
  brightness: 0.79,
  contrast: 1.05,
  saturate: 0.95,
  posX: 50,
  posY: 100,
  scale: 1,
  mixBlend: "normal",
}

export function bgPhotoStorageKey(theme: BgPhotoThemeKey) {
  return `${BG_PHOTO_STORAGE_PREFIX}${theme}`
}

export function clampBgPhotoTune(
  theme: BgPhotoThemeKey,
  input: Partial<BgPhotoTune>
): BgPhotoTune {
  const base = theme === "dark" ? BG_PHOTO_DEFAULT_DARK : BG_PHOTO_DEFAULT_LIGHT
  const merged = { ...base, ...input }
  const q = BG_PHOTO_QUALITY_OPTIONS.includes(
    merged.quality as (typeof BG_PHOTO_QUALITY_OPTIONS)[number]
  )
    ? merged.quality
    : 75
  const maskSolid = Math.min(100, Math.max(0, merged.maskSolidPct))
  let maskEnd = Math.min(100, Math.max(0, merged.maskFadeEndPct))
  if (maskEnd <= maskSolid) maskEnd = Math.min(100, maskSolid + 4)
  return {
    quality: q,
    opacity: Math.min(1, Math.max(0, merged.opacity)),
    maskSolidPct: maskSolid,
    maskFadeEndPct: maskEnd,
    blurPx: Math.min(24, Math.max(0, merged.blurPx)),
    brightness: Math.min(1.6, Math.max(0.4, merged.brightness)),
    contrast: Math.min(1.6, Math.max(0.4, merged.contrast)),
    saturate: Math.min(1.8, Math.max(0, merged.saturate)),
    posX: Math.min(100, Math.max(0, merged.posX)),
    posY: Math.min(100, Math.max(0, merged.posY)),
    scale: Math.min(1.5, Math.max(0.85, merged.scale)),
    mixBlend: BG_PHOTO_MIX_BLEND_OPTIONS.includes(
      merged.mixBlend as (typeof BG_PHOTO_MIX_BLEND_OPTIONS)[number]
    )
      ? merged.mixBlend
      : "normal",
  }
}

export function parseBgPhotoTune(
  raw: string | null
): Partial<BgPhotoTune> | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as unknown
    if (!v || typeof v !== "object") return null
    return v as Partial<BgPhotoTune>
  } catch {
    return null
  }
}

export function tuneToCssVars(tune: BgPhotoTune): Record<string, string> {
  return {
    "--bg-photo-opacity": String(tune.opacity),
    "--bg-mask-solid-pct": `${tune.maskSolidPct}%`,
    "--bg-mask-fade-end-pct": `${tune.maskFadeEndPct}%`,
    "--bg-photo-blur": `${tune.blurPx}px`,
    "--bg-photo-brightness": String(tune.brightness),
    "--bg-photo-contrast": String(tune.contrast),
    "--bg-photo-saturate": String(tune.saturate),
    "--bg-photo-pos-x": `${tune.posX}%`,
    "--bg-photo-pos-y": `${tune.posY}%`,
    "--bg-photo-scale": String(tune.scale),
  }
}

export function formatTuneAsCssBlock(
  theme: BgPhotoThemeKey,
  tune: BgPhotoTune
): string {
  const selector = theme === "dark" ? ".dark" : ":root"
  const vars = tuneToCssVars(tune)
  const body = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n")
  return [
    `${selector} {`,
    body,
    `}`,
    ``,
    `/* Apply on inner photo wrapper (e.g. .bg-photo-strip-inner): */`,
    `/* mix-blend-mode: ${tune.mixBlend}; */`,
    `/* next/image quality: ${tune.quality} */`,
  ].join("\n")
}
