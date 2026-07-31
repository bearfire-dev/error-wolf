export type ParsedAnnouncements = {
  lastUpdatedMs: number
  body: string
}

/** Seconds are typical 10-digit Unix times; ms since ~2001 exceed 1e12. */
const LIKELY_SECONDS_BELOW = 10_000_000_000

export function normalizeAnnouncementEpochMs(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  if (value < LIKELY_SECONDS_BELOW) return Math.round(value * 1000)
  return Math.round(value)
}

/**
 * Expects optional YAML-like front matter:
 * ---
 * lastUpdatedMs: <Unix epoch as seconds or milliseconds>
 * ---
 */
export function parseAnnouncementsFile(raw: string): ParsedAnnouncements {
  const s = raw.trimStart()
  if (!s.startsWith("---")) {
    return { lastUpdatedMs: 0, body: raw.trim() }
  }
  const close = s.indexOf("\n---", 3)
  if (close === -1) {
    return { lastUpdatedMs: 0, body: raw.trim() }
  }
  const fmBlock = s.slice(3, close).trim()
  const body = s.slice(close + 4).replace(/^\r?\n/, "")

  let lastUpdatedMs = 0
  for (const line of fmBlock.split("\n")) {
    const m = line.match(/^\s*lastUpdatedMs:\s*(\d+)\s*$/)
    if (m) {
      lastUpdatedMs = Number(m[1])
      break
    }
  }

  const normalized = normalizeAnnouncementEpochMs(
    Number.isFinite(lastUpdatedMs) ? lastUpdatedMs : 0
  )

  return {
    lastUpdatedMs: normalized,
    body: body.trim(),
  }
}
