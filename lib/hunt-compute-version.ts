import { DEFAULT_SIMPLIFY_ENGINE_ID } from "@/lib/simplify/engines/registry"
import {
  isSimplifyEngineId,
  type SimplifyEngineId,
} from "@/lib/simplify/engines/types"

export const HUNT_COMPUTE_VERSION_STORAGE_KEY =
  "error-wolf:hunt-compute-version-v1"

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

type Stored = {
  v: 1
  engineId: SimplifyEngineId
  savedAt: string
}

function isStored(value: unknown): value is Stored {
  if (!value || typeof value !== "object") return false
  const o = value as Record<string, unknown>
  return (
    o.v === 1 &&
    typeof o.engineId === "string" &&
    isSimplifyEngineId(o.engineId) &&
    typeof o.savedAt === "string"
  )
}

export function readHuntComputeVersion(): SimplifyEngineId {
  if (typeof window === "undefined") return DEFAULT_SIMPLIFY_ENGINE_ID

  try {
    const raw = window.localStorage.getItem(HUNT_COMPUTE_VERSION_STORAGE_KEY)
    if (!raw) return DEFAULT_SIMPLIFY_ENGINE_ID

    const parsed: unknown = JSON.parse(raw)
    if (!isStored(parsed)) {
      window.localStorage.removeItem(HUNT_COMPUTE_VERSION_STORAGE_KEY)
      return DEFAULT_SIMPLIFY_ENGINE_ID
    }

    const savedAtMs = Date.parse(parsed.savedAt)
    if (Number.isNaN(savedAtMs) || Date.now() - savedAtMs > MAX_AGE_MS) {
      window.localStorage.removeItem(HUNT_COMPUTE_VERSION_STORAGE_KEY)
      return DEFAULT_SIMPLIFY_ENGINE_ID
    }

    return parsed.engineId
  } catch {
    return DEFAULT_SIMPLIFY_ENGINE_ID
  }
}

export function persistHuntComputeVersion(engineId: SimplifyEngineId): void {
  if (typeof window === "undefined") return

  try {
    const payload: Stored = {
      v: 1,
      engineId,
      savedAt: new Date().toISOString(),
    }
    window.localStorage.setItem(
      HUNT_COMPUTE_VERSION_STORAGE_KEY,
      JSON.stringify(payload)
    )
  } catch {
    // ignore quota / private mode
  }
}

export function clearHuntComputeVersion(): void {
  if (typeof window === "undefined") return

  try {
    window.localStorage.removeItem(HUNT_COMPUTE_VERSION_STORAGE_KEY)
  } catch {
    // ignore
  }
}
