/**
 * Verifies an OpenRouter API key by calling the models endpoint.
 * Tries the browser first; falls back to the local Next route if the request fails (e.g. CORS).
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
  } catch {
    // CORS or network error — use same-origin proxy
  }

  try {
    const res = await fetch("/api/openrouter/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: key }),
    })
    if (!res.ok) return false
    const data = (await res.json()) as { ok?: boolean }
    return data.ok === true
  } catch {
    return false
  }
}
