import { getCookie } from "@tanstack/react-start/server"

import {
  hasConsentFromCookieStore,
  hasOpenRouterKeyFromCookieStore,
} from "@/lib/hunt-server-hints"

/**
 * Adapts the TanStack `getCookie` helper to the small cookie-store shape that
 * `lib/hunt-server-hints.ts` expects. Keeping that module free of framework
 * imports is what let it survive the port unchanged.
 */
const cookieStore = {
  get(name: string) {
    const value = getCookie(name)
    return value === undefined ? undefined : { value }
  },
  has(name: string) {
    return getCookie(name) !== undefined
  },
}

export function hasConsentFromRequest(): boolean {
  return hasConsentFromCookieStore(cookieStore)
}

export function hasOpenRouterKeyFromRequest(): boolean {
  return hasOpenRouterKeyFromCookieStore(cookieStore)
}
