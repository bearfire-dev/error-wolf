/** 30 days in seconds */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30

const COOKIE_NAME = "better_errors_openrouter_key"

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
  return readRawCookie(COOKIE_NAME) ?? ""
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
}

export function clearOpenRouterKeyCookie(): void {
  if (typeof document === "undefined") return
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
  const flags = [`${COOKIE_NAME}=`, "Path=/", "Max-Age=0", "SameSite=Lax"]
  if (secure) flags.push("Secure")
  document.cookie = flags.join("; ")
}
