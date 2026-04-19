export const CONSENT_STORAGE_KEY = "error-wolf:consent-v1"

/** Same-site cookie set by the server when the user accepts on the home page. */
export const CONSENT_COOKIE_NAME = "error-wolf-consent-v1"

const LEGACY_CONSENT_STORAGE_KEY = "better-errors:consent-v1"
const LEGACY_CONSENT_COOKIE_NAME = "better-errors-consent-v1"

function readConsentCookieFromDocument(): boolean {
  if (typeof document === "undefined") return false
  const names = [CONSENT_COOKIE_NAME, LEGACY_CONSENT_COOKIE_NAME]
  return document.cookie
    .split("; ")
    .some((part) => names.some((name) => part.startsWith(`${name}=`)))
}

/** Clear consent cookie from the browser (client-side). */
export function clearConsentCookie(): void {
  if (typeof document === "undefined") return
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
  for (const name of [CONSENT_COOKIE_NAME, LEGACY_CONSENT_COOKIE_NAME]) {
    const flags = [`${name}=`, "Path=/", "Max-Age=0", "SameSite=Lax"]
    if (secure) flags.push("Secure")
    document.cookie = flags.join("; ")
  }
}

export function hasConsent(): boolean {
  if (typeof window === "undefined") return false
  try {
    if (readConsentCookieFromDocument()) return true
    return (
      window.localStorage.getItem(CONSENT_STORAGE_KEY) === "1" ||
      window.localStorage.getItem(LEGACY_CONSENT_STORAGE_KEY) === "1"
    )
  } catch {
    return readConsentCookieFromDocument()
  }
}

/** @deprecated Prefer the server action + cookie; kept for any legacy call sites. */
export function setConsent(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, "1")
  } catch {
    // ignore quota / private mode
  }
}

export function clearConsent(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY)
    window.localStorage.removeItem(LEGACY_CONSENT_STORAGE_KEY)
  } catch {
    // ignore
  }
  clearConsentCookie()
}
