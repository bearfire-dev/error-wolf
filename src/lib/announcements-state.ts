export const ANNOUNCEMENTS_STATE_EVENT = "error-wolf:announcements-state"

const KEY_AT = "error-wolf:announcements-key-at-v1"
const VIEWED_AT = "error-wolf:announcements-viewed-at-v1"

function dispatchAnnouncementsStateChanged(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(ANNOUNCEMENTS_STATE_EVENT))
}

function readStoredMs(key: string): number | null {
  if (typeof window === "undefined") return null
  try {
    const v = window.localStorage.getItem(key)
    if (!v) return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

/** Call when a non-empty OpenRouter key cookie is persisted. */
export function setAnnouncementsTimestampsOnKeyPersisted(): void {
  if (typeof window === "undefined") return
  const now = Date.now().toString()
  try {
    window.localStorage.setItem(KEY_AT, now)
    window.localStorage.setItem(VIEWED_AT, now)
  } catch {
    // quota / private mode
  }
  dispatchAnnouncementsStateChanged()
}

export function clearAnnouncementsTimestamps(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(KEY_AT)
    window.localStorage.removeItem(VIEWED_AT)
  } catch {
    // ignore
  }
  dispatchAnnouncementsStateChanged()
}

export function markAnnouncementsViewedNow(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(VIEWED_AT, Date.now().toString())
  } catch {
    // ignore
  }
  dispatchAnnouncementsStateChanged()
}

/**
 * If the browser already has a key cookie but no stored key timestamp (e.g. first visit after
 * this feature shipped), align timestamps to now so old `lastUpdatedMs` values do not look "new".
 */
export function ensureAnnouncementsTimestampsIfKeyPresent(
  hasOpenRouterKey: boolean
): void {
  if (typeof window === "undefined" || !hasOpenRouterKey) return
  if (readStoredMs(KEY_AT) !== null) return
  setAnnouncementsTimestampsOnKeyPersisted()
}

export function computeAnnouncementsUnread(args: {
  hasOpenRouterKey: boolean
  latestAnnouncementMs: number
}): boolean {
  if (!args.hasOpenRouterKey) return false
  const latest = args.latestAnnouncementMs
  if (latest <= 0) return false
  const keyAt = readStoredMs(KEY_AT)
  const viewedAt = readStoredMs(VIEWED_AT)
  if (keyAt === null || viewedAt === null) return false
  return latest > keyAt && latest > viewedAt
}
