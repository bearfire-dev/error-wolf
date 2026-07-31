import { CONSENT_COOKIE_NAME, LEGACY_CONSENT_COOKIE_NAME } from "@/lib/consent"

const OPENROUTER_KEY_COOKIE = "error_wolf_openrouter_key"
const OPENROUTER_KEY_COOKIE_LEGACY = "better_errors_openrouter_key"

/** Minimal cookie-store shape, so this module stays framework-free.
 * `lib/server/hunt-hints.ts` adapts the TanStack request helpers to it. */
type CookieStore = {
  get(name: string): { value: string } | undefined
  has(name: string): boolean
}

function cookieValueLooksNonEmpty(raw: string | undefined): boolean {
  if (!raw) return false
  try {
    return decodeURIComponent(raw).trim().length > 0
  } catch {
    return raw.trim().length > 0
  }
}

/** Server-only: consent cookies set by the initialize flow (and legacy name). */
export function hasConsentFromCookieStore(jar: CookieStore): boolean {
  return jar.has(CONSENT_COOKIE_NAME) || jar.has(LEGACY_CONSENT_COOKIE_NAME)
}

/** Server-only: non-httpOnly OpenRouter key cookie present (value not read into HTML). */
export function hasOpenRouterKeyFromCookieStore(jar: CookieStore): boolean {
  const raw =
    jar.get(OPENROUTER_KEY_COOKIE)?.value ??
    jar.get(OPENROUTER_KEY_COOKIE_LEGACY)?.value
  return cookieValueLooksNonEmpty(raw)
}
