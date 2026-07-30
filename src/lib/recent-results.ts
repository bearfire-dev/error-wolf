import type {
  SimplifyRunCostSource,
  SimplifyRunCostSpan,
} from "@/lib/simplify/types"
import {
  isSimplifyEngineId,
  type SimplifyEngineId,
} from "@/lib/simplify/engines/types"

/** Current persistence: localStorage, up to `MAX_ITEMS` rows, 30-day retention. */
export const RECENT_RESULTS_STORAGE_KEY = "error-wolf:recent-results-v2"

/** Pre-rename localStorage key (migrated on read). */
const LEGACY_LOCAL_V2_KEY = "better-errors:recent-results-v2"

const LEGACY_SESSION_KEY = "better-errors:recent-results-v1"

/**
 * Every row holds a full model output, so this is a byte budget in disguise:
 * 1024 rows routinely passed the ~5 MB origin quota, after which every write
 * failed silently and history quietly stopped recording.
 */
const MAX_ITEMS = 200
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export type RecentSimplifyResult = {
  id: string
  createdAt: string
  engineId?: SimplifyEngineId
  inputPreview: string
  output: string
  inputChars: number
  outputChars: number
  durationMs: number
  /**
   * Fast local estimate of tokens in the user's original paste
   * (pre-compression), for reference pricing comparisons and paste-vs-output
   * shrink metrics.
   */
  pasteInputTokens?: number
  /**
   * Fast local estimate of the normalized trace body sent into the compressor
   * (post-preprocess), used to approximate billed prompt minus raw paste when
   * splitting IN for display.
   */
  cleanedInputTokens?: number
  /**
   * Sum of OpenRouter-reported prompt tokens across compressor LLM calls for this run
   * (includes system + user messages as billed).
   */
  compressorPromptTokens?: number
  /**
   * @deprecated Legacy alias for `pasteInputTokens` from older stored rows.
   */
  inputTokens?: number
  outputTokens?: number
  estimatedCostUsd?: number
  reportedCostUsd?: number
  displayCostUsd?: number
  costSource?: SimplifyRunCostSource
  costSpans?: SimplifyRunCostSpan[]
}

export type SimplifyStatsRow = {
  durationMs: number
  inputChars: number
  outputChars: number
  /** Negative when output shrank vs input (good). Positive when it grew (bad). */
  reductionPct: number
  pasteInputTokens?: number
  cleanedInputTokens?: number
  compressorPromptTokens?: number
  /**
   * @deprecated Legacy alias for `pasteInputTokens` (same value in aggregate rows).
   */
  inputTokens?: number
  outputTokens?: number
  /**
   * Paste → output token change (negative = shrank). Based on the app's local
   * estimate for **user paste** vs **output** tokens — not compressor/OpenRouter
   * prompt (IN) vs output.
   */
  reductionTokensPct?: number
  estimatedCostUsd?: number
  reportedCostUsd?: number
  displayCostUsd?: number
  costSource?: SimplifyRunCostSource
}

export type SimplifyStats = {
  count: number
  current: SimplifyStatsRow | null
  /**
   * Aggregate across stored runs: duration, chars, and token counts are **sums** (Σ);
   * `estimatedCostUsd`, `reportedCostUsd`, and `displayCostUsd` are **sums** (Σ).
   * Token reduction uses paired runs only (paste + output both present per run).
   */
  all: SimplifyStatsRow | null
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

function migrateFromLegacyLocalV2IfNeeded(): void {
  if (typeof window === "undefined") return
  if (window.localStorage.getItem(RECENT_RESULTS_STORAGE_KEY)) return
  const raw = window.localStorage.getItem(LEGACY_LOCAL_V2_KEY)
  if (!raw) return
  try {
    window.localStorage.setItem(RECENT_RESULTS_STORAGE_KEY, raw)
  } catch {
    // ignore
  } finally {
    try {
      window.localStorage.removeItem(LEGACY_LOCAL_V2_KEY)
    } catch {
      // ignore
    }
  }
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

let migrationsRun = false

/** Legacy-key migrations only matter once per session, not once per read. */
function runMigrationsOnce(): void {
  if (migrationsRun) return
  migrationsRun = true
  migrateFromLegacyLocalV2IfNeeded()
  migrateFromV1IfNeeded()
}

/**
 * Memoizes the parsed history against the exact stored string. Reads happen on
 * every render of the stats strip, and parsing megabytes of JSON per render was
 * a measurable part of the typing lag.
 */
let parseCache: { raw: string; parsed: RecentSimplifyResult[] } | null = null

export type RecentResultsWriteStatus = "ok" | "quota" | "unavailable"

let lastWriteStatus: RecentResultsWriteStatus = "ok"

/** Whether the last persist attempt made it to storage. */
export function getRecentResultsWriteStatus(): RecentResultsWriteStatus {
  return lastWriteStatus
}

function isQuotaError(error: unknown): boolean {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return (
      error.name === "QuotaExceededError" ||
      error.name === "NS_ERROR_DOM_QUOTA_REACHED"
    )
  }
  return error instanceof Error && /quota/i.test(error.name + error.message)
}

/**
 * Persists history, shedding the oldest half once on quota rather than dropping
 * the write on the floor. Returns what actually landed in storage.
 */
function writeAll(entries: RecentSimplifyResult[]): RecentSimplifyResult[] {
  if (typeof window === "undefined") {
    lastWriteStatus = "unavailable"
    return entries
  }

  const persist = (rows: RecentSimplifyResult[]) => {
    const json = JSON.stringify(rows)
    window.localStorage.setItem(RECENT_RESULTS_STORAGE_KEY, json)
    parseCache = { raw: json, parsed: rows }
  }

  try {
    persist(entries)
    lastWriteStatus = "ok"
    return entries
  } catch (error) {
    if (!isQuotaError(error)) {
      lastWriteStatus = "unavailable"
      return entries
    }
  }

  const trimmed = entries.slice(0, Math.max(1, Math.floor(entries.length / 2)))
  try {
    persist(trimmed)
    lastWriteStatus = "ok"
    return trimmed
  } catch {
    lastWriteStatus = "quota"
    return entries
  }
}

function readAll(): RecentSimplifyResult[] {
  if (typeof window === "undefined") return []
  try {
    runMigrationsOnce()
    const raw = window.localStorage.getItem(RECENT_RESULTS_STORAGE_KEY)
    if (!raw) return []
    if (parseCache?.raw === raw) return parseCache.parsed
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    // Normalizing on read must not write back: a read should stay a read, and
    // this one runs inside React's render phase.
    const normalized = normalize(parsed.filter(isRecentResult))
    parseCache = { raw, parsed: normalized }
    return normalized
  } catch {
    return []
  }
}

/** Test seam: drops the in-process cache and the once-per-session migration flag. */
export function resetRecentResultsCacheForTests(): void {
  parseCache = null
  migrationsRun = false
  lastWriteStatus = "ok"
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
  if (v.engineId !== undefined && !isSimplifyEngineId(v.engineId)) {
    return false
  }
  // Tokens are optional; accept missing or numeric.
  if (
    v.pasteInputTokens !== undefined &&
    typeof v.pasteInputTokens !== "number"
  ) {
    return false
  }
  if (
    v.cleanedInputTokens !== undefined &&
    typeof v.cleanedInputTokens !== "number"
  ) {
    return false
  }
  if (
    v.compressorPromptTokens !== undefined &&
    typeof v.compressorPromptTokens !== "number"
  ) {
    return false
  }
  if (v.inputTokens !== undefined && typeof v.inputTokens !== "number") {
    return false
  }
  if (v.outputTokens !== undefined && typeof v.outputTokens !== "number") {
    return false
  }
  if (
    v.estimatedCostUsd !== undefined &&
    typeof v.estimatedCostUsd !== "number"
  ) {
    return false
  }
  if (
    v.reportedCostUsd !== undefined &&
    typeof v.reportedCostUsd !== "number"
  ) {
    return false
  }
  if (v.displayCostUsd !== undefined && typeof v.displayCostUsd !== "number") {
    return false
  }
  if (
    v.costSource !== undefined &&
    !["exact", "estimated", "mixed", "unavailable"].includes(v.costSource)
  ) {
    return false
  }
  if (v.costSpans !== undefined && !Array.isArray(v.costSpans)) {
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
  const pasteInputTokens =
    entry.pasteInputTokens !== undefined
      ? entry.pasteInputTokens
      : entry.inputTokens
  const row: RecentSimplifyResult = {
    id,
    createdAt,
    engineId: entry.engineId,
    inputPreview: entry.inputPreview,
    output: entry.output,
    inputChars: entry.inputChars,
    outputChars: entry.outputChars,
    durationMs: entry.durationMs,
    pasteInputTokens,
    cleanedInputTokens: entry.cleanedInputTokens,
    compressorPromptTokens: entry.compressorPromptTokens,
    inputTokens:
      entry.inputTokens !== undefined ? entry.inputTokens : pasteInputTokens,
    outputTokens: entry.outputTokens,
    estimatedCostUsd: entry.estimatedCostUsd,
    reportedCostUsd: entry.reportedCostUsd,
    displayCostUsd: entry.displayCostUsd,
    costSource: entry.costSource,
    costSpans: entry.costSpans,
  }
  const prev = readAll()
  const next = normalize([row, ...prev.filter((r) => r.id !== id)])
  return writeAll(next)
}

export function updateRecentResultTokens(
  id: string,
  tokens: {
    pasteInputTokens?: number
    cleanedInputTokens?: number
    compressorPromptTokens?: number
    inputTokens?: number
    outputTokens?: number
    estimatedCostUsd?: number
    reportedCostUsd?: number
    displayCostUsd?: number
    costSource?: SimplifyRunCostSource
    costSpans?: SimplifyRunCostSpan[]
  }
): RecentSimplifyResult[] {
  if (typeof window === "undefined") return []
  const prev = readAll()
  const next = prev.map((r) =>
    r.id === id
      ? {
          ...r,
          pasteInputTokens:
            tokens.pasteInputTokens !== undefined
              ? tokens.pasteInputTokens
              : tokens.inputTokens !== undefined
                ? tokens.inputTokens
                : r.pasteInputTokens,
          cleanedInputTokens:
            tokens.cleanedInputTokens !== undefined
              ? tokens.cleanedInputTokens
              : r.cleanedInputTokens,
          compressorPromptTokens:
            tokens.compressorPromptTokens !== undefined
              ? tokens.compressorPromptTokens
              : r.compressorPromptTokens,
          inputTokens:
            tokens.inputTokens !== undefined
              ? tokens.inputTokens
              : tokens.pasteInputTokens !== undefined
                ? tokens.pasteInputTokens
                : r.inputTokens,
          outputTokens:
            tokens.outputTokens !== undefined
              ? tokens.outputTokens
              : r.outputTokens,
          estimatedCostUsd:
            tokens.estimatedCostUsd !== undefined
              ? tokens.estimatedCostUsd
              : r.estimatedCostUsd,
          reportedCostUsd:
            tokens.reportedCostUsd !== undefined
              ? tokens.reportedCostUsd
              : r.reportedCostUsd,
          displayCostUsd:
            tokens.displayCostUsd !== undefined
              ? tokens.displayCostUsd
              : r.displayCostUsd,
          costSource:
            tokens.costSource !== undefined ? tokens.costSource : r.costSource,
          costSpans:
            tokens.costSpans !== undefined ? tokens.costSpans : r.costSpans,
        }
      : r
  )
  return writeAll(next)
}

export function clearRecentResults(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(RECENT_RESULTS_STORAGE_KEY)
    window.localStorage.removeItem(LEGACY_LOCAL_V2_KEY)
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
  const pasteTokens = entry.pasteInputTokens ?? entry.inputTokens
  // TOK % is user paste vs model output size, not billed prompt (compressor) vs out.
  const reductionTokensPct = reductionFrom(pasteTokens, entry.outputTokens)
  return {
    durationMs: entry.durationMs,
    inputChars: entry.inputChars,
    outputChars: entry.outputChars,
    reductionPct,
    pasteInputTokens: pasteTokens,
    cleanedInputTokens: entry.cleanedInputTokens,
    compressorPromptTokens: entry.compressorPromptTokens,
    inputTokens: pasteTokens,
    outputTokens: entry.outputTokens,
    reductionTokensPct,
    estimatedCostUsd: entry.estimatedCostUsd,
    reportedCostUsd: entry.reportedCostUsd,
    displayCostUsd: entry.displayCostUsd,
    costSource: entry.costSource,
  }
}

export function getStats(
  entries: RecentSimplifyResult[] = readAll()
): SimplifyStats {
  if (entries.length === 0) {
    return { count: 0, current: null, all: null }
  }
  const current = toRow(entries[0]!)
  const n = entries.length
  const total = entries.reduce(
    (acc, entry) => {
      acc.durationMs += entry.durationMs
      acc.inputChars += entry.inputChars
      acc.outputChars += entry.outputChars
      const pasteTokens = entry.pasteInputTokens ?? entry.inputTokens
      if (pasteTokens !== undefined) {
        acc.pasteInputTokens += pasteTokens
        acc.pasteInputTokensN += 1
      }
      if (entry.cleanedInputTokens !== undefined) {
        acc.cleanedInputTokens += entry.cleanedInputTokens
        acc.cleanedInputTokensN += 1
      }
      if (entry.compressorPromptTokens !== undefined) {
        acc.compressorPromptTokens += entry.compressorPromptTokens
        acc.compressorPromptTokensN += 1
      }
      if (pasteTokens !== undefined) {
        acc.inputTokens += pasteTokens
        acc.inputTokensN += 1
      }
      if (entry.outputTokens !== undefined) {
        acc.outputTokens += entry.outputTokens
        acc.outputTokensN += 1
      }
      if (entry.estimatedCostUsd !== undefined) {
        acc.estimatedCostUsd += entry.estimatedCostUsd
        acc.estimatedCostUsdN += 1
      }
      if (entry.reportedCostUsd !== undefined) {
        acc.reportedCostUsd += entry.reportedCostUsd
        acc.reportedCostUsdN += 1
      }
      if (entry.displayCostUsd !== undefined) {
        acc.displayCostUsd += entry.displayCostUsd
        acc.displayCostUsdN += 1
        if (entry.costSource === "exact") acc.exactCostRows += 1
        else if (entry.costSource === "estimated") acc.estimatedCostRows += 1
        else if (entry.costSource === "mixed") {
          acc.exactCostRows += 1
          acc.estimatedCostRows += 1
        }
      }
      return acc
    },
    {
      durationMs: 0,
      inputChars: 0,
      outputChars: 0,
      pasteInputTokens: 0,
      pasteInputTokensN: 0,
      cleanedInputTokens: 0,
      cleanedInputTokensN: 0,
      compressorPromptTokens: 0,
      compressorPromptTokensN: 0,
      inputTokens: 0,
      inputTokensN: 0,
      outputTokens: 0,
      outputTokensN: 0,
      estimatedCostUsd: 0,
      estimatedCostUsdN: 0,
      reportedCostUsd: 0,
      reportedCostUsdN: 0,
      displayCostUsd: 0,
      displayCostUsdN: 0,
      exactCostRows: 0,
      estimatedCostRows: 0,
    }
  )
  const allCostSource: SimplifyRunCostSource | undefined =
    total.displayCostUsdN === 0
      ? undefined
      : total.exactCostRows === total.displayCostUsdN &&
          total.estimatedCostRows === 0
        ? "exact"
        : total.estimatedCostRows === total.displayCostUsdN &&
            total.exactCostRows === 0
          ? "estimated"
          : "mixed"

  const sumDurationMs = Math.round(total.durationMs)
  const sumInputChars = total.inputChars
  const sumOutputChars = total.outputChars
  const sumPasteInputTokens =
    total.pasteInputTokensN > 0 ? total.pasteInputTokens : undefined
  const sumCleanedInputTokens =
    total.cleanedInputTokensN > 0 ? total.cleanedInputTokens : undefined
  const sumCompressorPromptTokens =
    total.compressorPromptTokensN > 0 ? total.compressorPromptTokens : undefined
  const sumInputTokens = total.inputTokensN > 0 ? total.inputTokens : undefined
  const sumOutputTokens =
    total.outputTokensN > 0 ? total.outputTokens : undefined

  // Aggregate TOK %: sum paste and sum output only for runs that have both (user paste vs out, not compressor IN).
  let pairedPasteTokens = 0
  let pairedOutputTokens = 0
  for (const entry of entries) {
    const paste = entry.pasteInputTokens ?? entry.inputTokens
    if (paste !== undefined && entry.outputTokens !== undefined) {
      pairedPasteTokens += paste
      pairedOutputTokens += entry.outputTokens
    }
  }
  const reductionTokensPctFromPairs =
    pairedPasteTokens > 0
      ? Math.round((pairedOutputTokens / pairedPasteTokens - 1) * 100)
      : undefined

  const all: SimplifyStatsRow = {
    durationMs: sumDurationMs,
    inputChars: sumInputChars,
    outputChars: sumOutputChars,
    reductionPct:
      sumInputChars > 0
        ? Math.round((sumOutputChars / sumInputChars - 1) * 100)
        : 0,
    pasteInputTokens: sumPasteInputTokens,
    cleanedInputTokens: sumCleanedInputTokens,
    compressorPromptTokens: sumCompressorPromptTokens,
    inputTokens: sumPasteInputTokens ?? sumInputTokens,
    outputTokens: sumOutputTokens,
    reductionTokensPct: reductionTokensPctFromPairs,
    estimatedCostUsd:
      total.estimatedCostUsdN > 0 ? total.estimatedCostUsd : undefined,
    reportedCostUsd:
      total.reportedCostUsdN > 0 ? total.reportedCostUsd : undefined,
    displayCostUsd:
      total.displayCostUsdN > 0 ? total.displayCostUsd : undefined,
    costSource: allCostSource,
  }
  return { count: n, current, all }
}

/** Hunt input UI preference; same localStorage stack as run history (`RECENT_RESULTS_*`). */
const HUNT_SMART_SUBMIT_STORAGE_KEY = "error-wolf:hunt-smart-submit-v1"

/** @deprecated Migrated to {@link HUNT_SMART_SUBMIT_STORAGE_KEY} on read. */
const LEGACY_HUNT_PASTE_AUTO_SUBMIT_KEY = "error-wolf:hunt-paste-auto-submit-v1"

type HuntSmartSubmitStored = {
  v: 1
  enabled: boolean
  savedAt: string
}

function isHuntSmartSubmitStored(
  value: unknown
): value is HuntSmartSubmitStored {
  if (!value || typeof value !== "object") return false
  const o = value as Record<string, unknown>
  return (
    o.v === 1 && typeof o.enabled === "boolean" && typeof o.savedAt === "string"
  )
}

export function readHuntSmartSubmitPreference(): boolean {
  if (typeof window === "undefined") return false

  try {
    const tryParse = (raw: string | null): boolean | null => {
      if (!raw) return null
      const parsed: unknown = JSON.parse(raw)
      if (!isHuntSmartSubmitStored(parsed)) return null
      const savedAtMs = Date.parse(parsed.savedAt)
      if (Number.isNaN(savedAtMs) || Date.now() - savedAtMs > MAX_AGE_MS) {
        return null
      }
      return parsed.enabled
    }

    const primary = tryParse(
      window.localStorage.getItem(HUNT_SMART_SUBMIT_STORAGE_KEY)
    )
    if (primary !== null) return primary

    const legacyRaw = window.localStorage.getItem(
      LEGACY_HUNT_PASTE_AUTO_SUBMIT_KEY
    )
    const migrated = tryParse(legacyRaw)
    if (migrated !== null) {
      persistHuntSmartSubmitPreference(migrated)
      try {
        window.localStorage.removeItem(LEGACY_HUNT_PASTE_AUTO_SUBMIT_KEY)
      } catch {
        // ignore
      }
      return migrated
    }

    if (legacyRaw) {
      try {
        window.localStorage.removeItem(LEGACY_HUNT_PASTE_AUTO_SUBMIT_KEY)
      } catch {
        // ignore
      }
    }
    return false
  } catch {
    return false
  }
}

export function persistHuntSmartSubmitPreference(enabled: boolean): void {
  if (typeof window === "undefined") return

  try {
    const payload: HuntSmartSubmitStored = {
      v: 1,
      enabled,
      savedAt: new Date().toISOString(),
    }
    window.localStorage.setItem(
      HUNT_SMART_SUBMIT_STORAGE_KEY,
      JSON.stringify(payload)
    )
  } catch {
    // ignore quota / private mode
  }
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

export function formatUsdCost(value: number): string {
  if (value >= 1) return `$${value.toFixed(2)}`
  if (value >= 0.1) return `$${value.toFixed(3)}`
  if (value >= 0.01) return `$${value.toFixed(4)}`
  return `$${value.toFixed(5)}`
}
