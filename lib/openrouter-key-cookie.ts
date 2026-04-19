import {
  clearAnnouncementsTimestamps,
  setAnnouncementsTimestampsOnKeyPersisted,
} from "@/lib/announcements-state"

/** 30 days in seconds */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30

const COOKIE_NAME = "error_wolf_openrouter_key"
const LEGACY_COOKIE_NAME = "better_errors_openrouter_key"

function cookieParts(): string[] {
  if (typeof document === "undefined") return []
  return document.cookie.split("; ").filter(Boolean)
}

function readRawCookie(name: string): string | null {
  const prefix = `${name}=`
  for (const part of cookieParts()) {
    if (part.startsWith(prefix)) {
      return decodeURIComponent(part.slice(prefix.length))
    }
  }
  return null
}

export function getOpenRouterKeyFromCookie(): string {
  const current = readRawCookie(COOKIE_NAME)
  if (current) return current
  const legacy = readRawCookie(LEGACY_COOKIE_NAME)
  if (legacy) {
    setOpenRouterKeyCookie(legacy)
  }
  return legacy ?? ""
}

export function setOpenRouterKeyCookie(apiKey: string): void {
  if (typeof document === "undefined") return
  const trimmed = apiKey.trim()
  if (!trimmed) {
    clearOpenRouterKeyCookie()
    return
  }
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
  const flags = [
    `${COOKIE_NAME}=${encodeURIComponent(trimmed)}`,
    "Path=/",
    `Max-Age=${MAX_AGE_SECONDS}`,
    "SameSite=Lax",
  ]
  if (secure) flags.push("Secure")
  document.cookie = flags.join("; ")
  const legacyClear = [
    `${LEGACY_COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "SameSite=Lax",
  ]
  if (secure) legacyClear.push("Secure")
  document.cookie = legacyClear.join("; ")
  setAnnouncementsTimestampsOnKeyPersisted()
}

export function clearOpenRouterKeyCookie(): void {
  if (typeof document === "undefined") return
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
  for (const name of [COOKIE_NAME, LEGACY_COOKIE_NAME]) {
    const flags = [`${name}=`, "Path=/", "Max-Age=0", "SameSite=Lax"]
    if (secure) flags.push("Secure")
    document.cookie = flags.join("; ")
  }
  clearAnnouncementsTimestamps()
}
