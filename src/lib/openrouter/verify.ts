import { createDirectBrowserOpenRouterError } from "@/lib/openrouter/direct-browser-errors"
import { HUNT_OPENROUTER_VERIFY_TIMEOUT_MS } from "@/lib/openrouter/hunt-routing-config"

/**
 * Verifies an OpenRouter API key by calling the models endpoint directly from the browser.
 * Network/CORS failures are treated as a hard product constraint and surfaced to the user.
 *
 * This runs on the first screen a new user sees, so it is time-boxed: without a
 * deadline a stalled connection leaves the verify button spinning with no escape
 * short of a reload.
 */
export async function verifyOpenRouterKey(
  apiKey: string,
  signal?: AbortSignal
): Promise<boolean> {
  const key = apiKey.trim()
  if (!key) return false

  const headers = { Authorization: `Bearer ${key}` }
  const timeout = AbortSignal.timeout(HUNT_OPENROUTER_VERIFY_TIMEOUT_MS)

  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      method: "GET",
      headers,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
    if (res.ok) return true
    if (res.status === 401 || res.status === 403) {
      console.error("[openrouter] verification rejected API key", {
        status: res.status,
      })
      return false
    }
    console.error("[openrouter] verification request failed", {
      status: res.status,
    })
    return false
  } catch (error) {
    console.error("[openrouter] verification request failed", error)
    throw createDirectBrowserOpenRouterError("verification")
  }
}
