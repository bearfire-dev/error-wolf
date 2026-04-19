import { createDirectBrowserOpenRouterError } from "@/lib/openrouter/direct-browser-errors"

/**
 * Verifies an OpenRouter API key by calling the models endpoint directly from the browser.
 * Network/CORS failures are treated as a hard product constraint and surfaced to the user.
 */
export async function verifyOpenRouterKey(apiKey: string): Promise<boolean> {
  const key = apiKey.trim()
  if (!key) return false

  const headers = { Authorization: `Bearer ${key}` }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      method: "GET",
      headers,
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
