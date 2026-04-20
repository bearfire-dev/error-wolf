"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { estimateFastestProvider } from "@/lib/openrouter/estimate-fastest-provider"
import type { FastestProviderEstimate } from "@/lib/openrouter/estimate-fastest-provider"
import { fetchModelEndpointsDirect } from "@/lib/openrouter/endpoints-client"
import type { OpenRouterPublicEndpoint } from "@/lib/openrouter/endpoints-types"
import {
  HUNT_OPENROUTER_LATENCY_CANCEL_FALLBACK_MS,
  HUNT_OPENROUTER_LATENCY_HEDGE_FALLBACK_MS,
  HUNT_ROUTING_E2E_TOKEN_ESTIMATE,
} from "@/lib/openrouter/hunt-routing-config"
import {
  endpointProviderSlug,
  rankProvidersByLatency,
  rankProvidersByThroughput,
  type RankedProvider,
} from "@/lib/openrouter/rank-providers"
import type {
  OpenRouterLatencyPolicy,
  OpenRouterProviderPreferences,
} from "@/lib/simplify/types"

const REFRESH_MS = 5 * 60 * 1000

const EMPTY_ENDPOINTS: OpenRouterPublicEndpoint[] = []

export type OpenRouterProviderRankings = {
  byThroughput: RankedProvider[]
  byLatency: RankedProvider[]
}

function singleProviderPreferences(
  slug: string,
  allowFallbacks: boolean
): OpenRouterProviderPreferences {
  return {
    order: [slug],
    allow_fallbacks: allowFallbacks,
  }
}

function primaryLatencyMs(
  provider: OpenRouterProviderPreferences | undefined,
  endpoints: OpenRouterPublicEndpoint[]
): number | null {
  const slug = provider?.order?.[0]?.trim().toLowerCase()
  if (!slug) return null

  for (const endpoint of endpoints) {
    if (endpointProviderSlug(endpoint) !== slug) continue
    const latencyMs = endpoint.latency_last_30m?.p50
    if (typeof latencyMs === "number" && Number.isFinite(latencyMs)) {
      return latencyMs
    }
  }

  return null
}

function deriveLatencyPolicy(params: {
  provider: OpenRouterProviderPreferences | undefined
  endpoints: OpenRouterPublicEndpoint[]
  rankings: OpenRouterProviderRankings
}): OpenRouterLatencyPolicy | undefined {
  const primarySlug = params.provider?.order?.[0]?.trim().toLowerCase()
  if (!primarySlug) return undefined

  const secondary = params.rankings.byLatency.find(
    (row) => row.slug !== primarySlug
  )
  if (!secondary?.slug) return undefined

  // The endpoints payload exposes percentile TTFT stats, not a true average.
  // Approximate from p50 and keep conservative floors so we do not hedge on
  // normal sub-second variance.
  const baselineLatencyMs = primaryLatencyMs(params.provider, params.endpoints)
  const hedgeAfterMs =
    baselineLatencyMs !== null
      ? Math.max(
          HUNT_OPENROUTER_LATENCY_HEDGE_FALLBACK_MS,
          Math.round(baselineLatencyMs * 2)
        )
      : HUNT_OPENROUTER_LATENCY_HEDGE_FALLBACK_MS
  const cancelAfterMs =
    baselineLatencyMs !== null
      ? Math.max(
          HUNT_OPENROUTER_LATENCY_CANCEL_FALLBACK_MS,
          hedgeAfterMs + 250,
          Math.round(baselineLatencyMs * 4)
        )
      : HUNT_OPENROUTER_LATENCY_CANCEL_FALLBACK_MS

  return {
    hedgeAfterMs,
    cancelAfterMs,
    secondaryProvider: singleProviderPreferences(secondary.slug, false),
  }
}

type UseOpenRouterProviderRoutingArgs = {
  apiKey: string
  enabled: boolean
  routingModelId: string
  /** Rough local E2E budget heuristic (prompt + completion), not billed usage. */
  e2eTokenEstimate?: number
}

export function useOpenRouterProviderRouting({
  apiKey,
  enabled,
  routingModelId,
  e2eTokenEstimate = HUNT_ROUTING_E2E_TOKEN_ESTIMATE,
}: UseOpenRouterProviderRoutingArgs) {
  const [endpoints, setEndpoints] = useState<OpenRouterPublicEndpoint[]>([])
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const active =
    enabled && Boolean(apiKey.trim()) && Boolean(routingModelId.trim())

  const refresh = useCallback(async () => {
    const key = apiKey.trim()
    const model = routingModelId.trim()
    if (!enabled || !key || !model) return

    const result = await fetchModelEndpointsDirect(key, model)

    if (!result.ok) {
      console.error("[hunt] OpenRouter provider rankings refresh failed", {
        code: result.error.code,
        httpStatus: result.error.httpStatus ?? null,
        message: result.error.message,
        model,
      })
      setEndpoints([])
      setLastUpdated(null)
      setError(result.error.message)
      return
    }

    setEndpoints(result.data.endpoints)
    setLastUpdated(Date.now())
    setError(null)
  }, [apiKey, enabled, routingModelId])

  const endpointsView = useMemo(
    () => (active ? endpoints : EMPTY_ENDPOINTS),
    [active, endpoints]
  )
  const lastUpdatedView = active ? lastUpdated : null
  const errorView = active ? error : null

  const rankings = useMemo((): OpenRouterProviderRankings => {
    return {
      byThroughput: rankProvidersByThroughput(endpointsView),
      byLatency: rankProvidersByLatency(endpointsView),
    }
  }, [endpointsView])

  const fastestEstimate = useMemo(
    (): FastestProviderEstimate | null =>
      estimateFastestProvider(endpointsView, e2eTokenEstimate),
    [endpointsView, e2eTokenEstimate]
  )

  const providerPreferences = useMemo(():
    | OpenRouterProviderPreferences
    | undefined => {
    if (!fastestEstimate?.slug) return undefined
    return singleProviderPreferences(fastestEstimate.slug, true)
  }, [fastestEstimate])

  const providerLatencyPolicy = useMemo(
    (): OpenRouterLatencyPolicy | undefined =>
      deriveLatencyPolicy({
        provider: providerPreferences,
        endpoints: endpointsView,
        rankings,
      }),
    [endpointsView, providerPreferences, rankings]
  )

  useEffect(() => {
    if (!active) return

    let cancelled = false
    const run = () => {
      if (!cancelled) void refresh()
    }

    const initial = window.setTimeout(run, 0)
    const id = window.setInterval(run, REFRESH_MS)

    return () => {
      cancelled = true
      window.clearTimeout(initial)
      window.clearInterval(id)
    }
  }, [active, refresh])

  useEffect(() => {
    if (!active) return

    const onVis = () => {
      if (document.visibilityState === "visible") {
        window.setTimeout(() => void refresh(), 0)
      }
    }

    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [active, refresh])

  return {
    endpoints: endpointsView,
    rankings,
    fastestEstimate,
    providerPreferences,
    providerLatencyPolicy,
    lastUpdated: lastUpdatedView,
    error: errorView,
    refresh,
  }
}
