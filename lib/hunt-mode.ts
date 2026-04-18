/** Stored in localStorage with 30-day retention (aligned with recent-results). */

export const HUNT_MODE_STORAGE_KEY = "better-errors:hunt-mode-v1"

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export const HUNT_MODES = ["auto", "normal", "heavy"] as const
export type HuntMode = (typeof HUNT_MODES)[number]

type Stored = {
  v: 1
  mode: HuntMode
  savedAt: string
}

export function isHuntMode(value: string): value is HuntMode {
  return (HUNT_MODES as readonly string[]).includes(value)
}

function isStored(value: unknown): value is Stored {
  if (!value || typeof value !== "object") return false
  const o = value as Record<string, unknown>
  return (
    o.v === 1 &&
    typeof o.mode === "string" &&
    isHuntMode(o.mode) &&
    typeof o.savedAt === "string"
  )
}

export function readHuntMode(): HuntMode {
  if (typeof window === "undefined") return "auto"
  try {
    const raw = window.localStorage.getItem(HUNT_MODE_STORAGE_KEY)
    if (!raw) return "auto"
    const parsed: unknown = JSON.parse(raw)
    if (!isStored(parsed)) {
      window.localStorage.removeItem(HUNT_MODE_STORAGE_KEY)
      return "auto"
    }
    const t = Date.parse(parsed.savedAt)
    if (Number.isNaN(t) || Date.now() - t > MAX_AGE_MS) {
      window.localStorage.removeItem(HUNT_MODE_STORAGE_KEY)
      return "auto"
    }
    return parsed.mode
  } catch {
    return "auto"
  }
}

export function persistHuntMode(mode: HuntMode): void {
  if (typeof window === "undefined") return
  try {
    const payload: Stored = {
      v: 1,
      mode,
      savedAt: new Date().toISOString(),
    }
    window.localStorage.setItem(HUNT_MODE_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // ignore quota / private mode
  }
}

export function clearHuntMode(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(HUNT_MODE_STORAGE_KEY)
  } catch {
    // ignore
  }
}
