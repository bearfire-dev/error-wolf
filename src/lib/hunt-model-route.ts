const HUNT_MODEL_ROUTE_STORAGE_KEY = "error-wolf:hunt-model-route-v1"
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const DEFAULT_HUNT_MODEL_ROUTE_ID = "auto"

type Stored = {
  v: 1
  routeId: string
  savedAt: string
}

function isStored(value: unknown): value is Stored {
  if (!value || typeof value !== "object") return false
  const o = value as Record<string, unknown>
  return (
    o.v === 1 &&
    typeof o.routeId === "string" &&
    o.routeId.trim().length > 0 &&
    typeof o.savedAt === "string"
  )
}

export function readHuntModelRouteId(): string {
  if (typeof window === "undefined") return DEFAULT_HUNT_MODEL_ROUTE_ID

  try {
    const raw = window.localStorage.getItem(HUNT_MODEL_ROUTE_STORAGE_KEY)
    if (!raw) return DEFAULT_HUNT_MODEL_ROUTE_ID

    const parsed: unknown = JSON.parse(raw)
    if (!isStored(parsed)) {
      window.localStorage.removeItem(HUNT_MODEL_ROUTE_STORAGE_KEY)
      return DEFAULT_HUNT_MODEL_ROUTE_ID
    }

    const savedAtMs = Date.parse(parsed.savedAt)
    if (Number.isNaN(savedAtMs) || Date.now() - savedAtMs > MAX_AGE_MS) {
      window.localStorage.removeItem(HUNT_MODEL_ROUTE_STORAGE_KEY)
      return DEFAULT_HUNT_MODEL_ROUTE_ID
    }

    return parsed.routeId
  } catch {
    return DEFAULT_HUNT_MODEL_ROUTE_ID
  }
}

export function persistHuntModelRouteId(routeId: string): void {
  if (typeof window === "undefined") return

  try {
    const payload: Stored = {
      v: 1,
      routeId,
      savedAt: new Date().toISOString(),
    }
    window.localStorage.setItem(
      HUNT_MODEL_ROUTE_STORAGE_KEY,
      JSON.stringify(payload)
    )
  } catch {
    // ignore quota / private mode
  }
}

export function clearHuntModelRouteId(): void {
  if (typeof window === "undefined") return

  try {
    window.localStorage.removeItem(HUNT_MODEL_ROUTE_STORAGE_KEY)
  } catch {
    // ignore
  }
}
