/** Current persistence: localStorage, up to 100 items, 30-day retention. */
export const RECENT_RESULTS_STORAGE_KEY = "better-errors:recent-results-v2"

const LEGACY_SESSION_KEY = "better-errors:recent-results-v1"

const MAX_ITEMS = 100
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export type RecentSimplifyResult = {
  id: string
  createdAt: string
  inputPreview: string
  output: string
  inputChars: number
  outputChars: number
  durationMs: number
  inputTokens?: number
  outputTokens?: number
}

export type SimplifyStatsRow = {
  durationMs: number
  inputChars: number
  outputChars: number
  /** Negative when output shrank vs input (good). Positive when it grew (bad). */
  reductionPct: number
  inputTokens?: number
  outputTokens?: number
  /** Same sign convention as reductionPct, computed over tokens. */
  reductionTokensPct?: number
}

export type SimplifyStats = {
  count: number
  current: SimplifyStatsRow | null
  average: SimplifyStatsRow | null
}

/** @deprecated Use RECENT_RESULTS_STORAGE_KEY. Kept for external references only. */
export const RECENT_RESULTS_SESSION_KEY = LEGACY_SESSION_KEY

export const RECENT_HISTORY_MAX_ITEMS = MAX_ITEMS

function normalize(entries: RecentSimplifyResult[]): RecentSimplifyResult[] {
  const cutoff = Date.now() - MAX_AGE_MS
  const filtered = entries.filter((e) => {
    const t = Date.parse(e.createdAt)
    return !Number.isNaN(t) && t >= cutoff
  })
  filtered.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  return filtered.slice(0, MAX_ITEMS)
}

function migrateFromV1IfNeeded(): void {
  if (typeof window === "undefined") return
  if (window.localStorage.getItem(RECENT_RESULTS_STORAGE_KEY)) return
  const raw = window.sessionStorage.getItem(LEGACY_SESSION_KEY)
  if (!raw) return
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return
    const rows = parsed.filter(isRecentResult)
    const normalized = normalize(rows)
    if (normalized.length > 0) {
      window.localStorage.setItem(
        RECENT_RESULTS_STORAGE_KEY,
        JSON.stringify(normalized)
      )
    }
  } catch {
    // ignore
  } finally {
    try {
      window.sessionStorage.removeItem(LEGACY_SESSION_KEY)
    } catch {
      // ignore
    }
  }
}

function readAll(): RecentSimplifyResult[] {
  if (typeof window === "undefined") return []
  try {
    migrateFromV1IfNeeded()
    const raw = window.localStorage.getItem(RECENT_RESULTS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const valid = parsed.filter(isRecentResult)
    const normalized = normalize(valid)
    const nextJson = JSON.stringify(normalized)
    if (nextJson !== raw) {
      window.localStorage.setItem(RECENT_RESULTS_STORAGE_KEY, nextJson)
    }
    return normalized
  } catch {
    return []
  }
}

function isRecentResult(value: unknown): value is RecentSimplifyResult {
  if (!value || typeof value !== "object") return false
  const v = value as RecentSimplifyResult
  const baseOk =
    typeof v.id === "string" &&
    typeof v.createdAt === "string" &&
    typeof v.inputPreview === "string" &&
    typeof v.output === "string" &&
    typeof v.inputChars === "number" &&
    typeof v.outputChars === "number" &&
    typeof v.durationMs === "number"
  if (!baseOk) return false
  // Tokens are optional; accept missing or numeric.
  if (v.inputTokens !== undefined && typeof v.inputTokens !== "number") {
    return false
  }
  if (v.outputTokens !== undefined && typeof v.outputTokens !== "number") {
    return false
  }
  return true
}

export function getRecentResults(): RecentSimplifyResult[] {
  return readAll()
}

export function addRecentResult(
  entry: Omit<RecentSimplifyResult, "id" | "createdAt"> & {
    id?: string
    createdAt?: string
  }
): RecentSimplifyResult[] {
  if (typeof window === "undefined") return []
  const id =
    entry.id ??
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`)
  const createdAt = entry.createdAt ?? new Date().toISOString()
  const row: RecentSimplifyResult = {
    id,
    createdAt,
    inputPreview: entry.inputPreview,
    output: entry.output,
    inputChars: entry.inputChars,
    outputChars: entry.outputChars,
    durationMs: entry.durationMs,
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
  }
  const prev = readAll()
  const next = normalize([row, ...prev.filter((r) => r.id !== id)])
  try {
    window.localStorage.setItem(
      RECENT_RESULTS_STORAGE_KEY,
      JSON.stringify(next)
    )
  } catch {
    // ignore quota
  }
  return next
}

export function updateRecentResultTokens(
  id: string,
  tokens: { inputTokens?: number; outputTokens?: number }
): RecentSimplifyResult[] {
  if (typeof window === "undefined") return []
  const prev = readAll()
  const next = prev.map((r) =>
    r.id === id
      ? {
          ...r,
          inputTokens:
            tokens.inputTokens !== undefined
              ? tokens.inputTokens
              : r.inputTokens,
          outputTokens:
            tokens.outputTokens !== undefined
              ? tokens.outputTokens
              : r.outputTokens,
        }
      : r
  )
  try {
    window.localStorage.setItem(
      RECENT_RESULTS_STORAGE_KEY,
      JSON.stringify(next)
    )
  } catch {
    // ignore quota
  }
  return next
}

export function clearRecentResults(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(RECENT_RESULTS_STORAGE_KEY)
    window.sessionStorage.removeItem(LEGACY_SESSION_KEY)
  } catch {
    // ignore
  }
}

export function previewText(text: string, maxChars: number): string {
  const t = text.replace(/\s+/g, " ").trim()
  if (t.length <= maxChars) return t
  return `${t.slice(0, maxChars - 1)}…`
}

/**
 * Reduction as a percent change: negative = shrunk (good), positive = grew (bad).
 * Rounded to an integer. Returns undefined when the base is missing/0.
 */
function reductionFrom(
  base: number | undefined,
  after: number | undefined
): number | undefined {
  if (base === undefined || after === undefined) return undefined
  if (base <= 0) return undefined
  return Math.round((after / base - 1) * 100)
}

function toRow(entry: RecentSimplifyResult): SimplifyStatsRow {
  const reductionPct = reductionFrom(entry.inputChars, entry.outputChars) ?? 0
  const reductionTokensPct = reductionFrom(
    entry.inputTokens,
    entry.outputTokens
  )
  return {
    durationMs: entry.durationMs,
    inputChars: entry.inputChars,
    outputChars: entry.outputChars,
    reductionPct,
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
    reductionTokensPct,
  }
}

export function getStats(
  entries: RecentSimplifyResult[] = readAll()
): SimplifyStats {
  if (entries.length === 0) {
    return { count: 0, current: null, average: null }
  }
  const current = toRow(entries[0]!)
  const n = entries.length
  const total = entries.reduce(
    (acc, entry) => {
      acc.durationMs += entry.durationMs
      acc.inputChars += entry.inputChars
      acc.outputChars += entry.outputChars
      if (entry.inputTokens !== undefined) {
        acc.inputTokens += entry.inputTokens
        acc.inputTokensN += 1
      }
      if (entry.outputTokens !== undefined) {
        acc.outputTokens += entry.outputTokens
        acc.outputTokensN += 1
      }
      return acc
    },
    {
      durationMs: 0,
      inputChars: 0,
      outputChars: 0,
      inputTokens: 0,
      inputTokensN: 0,
      outputTokens: 0,
      outputTokensN: 0,
    }
  )
  const avgInput = total.inputChars / n
  const avgOutput = total.outputChars / n
  const avgInputTokens =
    total.inputTokensN > 0 ? total.inputTokens / total.inputTokensN : undefined
  const avgOutputTokens =
    total.outputTokensN > 0
      ? total.outputTokens / total.outputTokensN
      : undefined
  const average: SimplifyStatsRow = {
    durationMs: Math.round(total.durationMs / n),
    inputChars: Math.round(avgInput),
    outputChars: Math.round(avgOutput),
    reductionPct:
      avgInput > 0 ? Math.round((avgOutput / avgInput - 1) * 100) : 0,
    inputTokens:
      avgInputTokens !== undefined ? Math.round(avgInputTokens) : undefined,
    outputTokens:
      avgOutputTokens !== undefined ? Math.round(avgOutputTokens) : undefined,
    reductionTokensPct:
      avgInputTokens !== undefined &&
      avgOutputTokens !== undefined &&
      avgInputTokens > 0
        ? Math.round((avgOutputTokens / avgInputTokens - 1) * 100)
        : undefined,
  }
  return { count: n, current, average }
}

export function formatChars(n: number): string {
  if (n < 1000) return `${n}`
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`
  return `${Math.round(n / 1000)}k`
}

export function formatTokens(n: number): string {
  if (n < 1000) return `${n}`
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`
  return `${Math.round(n / 1000)}k`
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}
