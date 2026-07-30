import type {
  OpenRouterModelEndpointsResponse,
  OpenRouterPublicEndpoint,
} from "@/lib/openrouter/endpoints-types"
import { directBrowserOpenRouterErrorMessage } from "@/lib/openrouter/direct-browser-errors"
import { HUNT_OPENROUTER_ENDPOINTS_TIMEOUT_MS } from "@/lib/openrouter/hunt-routing-config"
import { openRouterEndpointsUrl } from "@/lib/openrouter/model-path"

export type FetchModelEndpointsErrorCode =
  | "bad_model_id"
  | "invalid_key"
  | "not_found"
  | "upstream"
  | "bad_response"

export type FetchModelEndpointsError = {
  code: FetchModelEndpointsErrorCode
  message: string
  httpStatus?: number
}

export type FetchModelEndpointsResult =
  | { ok: true; data: OpenRouterModelEndpointsResponse["data"] }
  | { ok: false; error: FetchModelEndpointsError }

function error(
  code: FetchModelEndpointsErrorCode,
  message: string,
  httpStatus?: number
): FetchModelEndpointsResult {
  return { ok: false, error: { code, message, httpStatus } }
}

/**
 * Guards the fields every consumer dereferences without a fallback:
 * `provider_name` in `rank-providers`, and `pricing.prompt` / `pricing.completion`
 * in `costs`. Everything else is read defensively already.
 */
function isPublicEndpoint(value: unknown): value is OpenRouterPublicEndpoint {
  if (!value || typeof value !== "object") return false
  const row = value as Record<string, unknown>
  if (typeof row.provider_name !== "string" || !row.provider_name.trim()) {
    return false
  }
  if (!row.pricing || typeof row.pricing !== "object") return false
  return true
}

export async function fetchModelEndpointsFromOpenRouter(
  apiKey: string,
  modelId: string,
  signal?: AbortSignal
): Promise<FetchModelEndpointsResult> {
  const key = apiKey.trim()
  if (!key) {
    return error("invalid_key", "OpenRouter API key is empty.")
  }

  const url = openRouterEndpointsUrl(modelId)
  if (!url) {
    return error("bad_model_id", `Invalid model id for endpoints: ${modelId}`)
  }

  // Rankings are advisory: a slow response must not pin an open connection or
  // stack up behind the 90s refresh interval.
  const timeout = AbortSignal.timeout(HUNT_OPENROUTER_ENDPOINTS_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
  } catch (e) {
    if (!(e instanceof Error && e.name === "AbortError")) {
      console.error("[openrouter] provider rankings request failed", e, {
        modelId,
        url,
      })
    }
    const message =
      e instanceof Error && e.name === "AbortError"
        ? e.message
        : directBrowserOpenRouterErrorMessage("provider rankings")
    return error("upstream", message)
  }

  if (response.status === 401 || response.status === 403) {
    return error(
      "invalid_key",
      "OpenRouter rejected this API key.",
      response.status
    )
  }

  if (response.status === 404) {
    return error(
      "not_found",
      "No endpoints listing for this model id.",
      response.status
    )
  }

  if (!response.ok) {
    return error(
      "upstream",
      `OpenRouter endpoints request failed (${response.status}).`,
      response.status
    )
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return error("bad_response", "OpenRouter returned non-JSON.")
  }

  if (!payload || typeof payload !== "object") {
    return error("bad_response", "OpenRouter returned an unexpected body.")
  }

  const record = payload as Record<string, unknown>
  const data = record.data
  if (!data || typeof data !== "object") {
    return error("bad_response", "OpenRouter response missing data.")
  }

  const d = data as Record<string, unknown>
  if (!Array.isArray(d.endpoints)) {
    return error("bad_response", "OpenRouter response missing endpoints array.")
  }

  // Rows feed ranking and pricing, both of which run inside `useMemo` during
  // render. An unchecked cast turns provider-side schema drift into a
  // render-phase throw that the error boundary cannot recover from.
  const endpoints = d.endpoints.filter(isPublicEndpoint)
  const dropped = d.endpoints.length - endpoints.length
  if (dropped > 0) {
    console.warn("[openrouter] dropped malformed endpoint rows", {
      modelId,
      dropped,
      kept: endpoints.length,
    })
  }

  return {
    ok: true,
    data: {
      ...(data as OpenRouterModelEndpointsResponse["data"]),
      endpoints,
    },
  }
}
