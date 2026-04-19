"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { estimateFastestProvider } from "@/lib/openrouter/estimate-fastest-provider"
import type { FastestProviderEstimate } from "@/lib/openrouter/estimate-fastest-provider"
import { fetchModelEndpointsDirect } from "@/lib/openrouter/endpoints-client"
import type { OpenRouterPublicEndpoint } from "@/lib/openrouter/endpoints-types"
import { HUNT_ROUTING_E2E_TOKEN_ESTIMATE } from "@/lib/openrouter/hunt-routing-config"
import {
  rankProvidersByLatency,
  rankProvidersByThroughput,
  type RankedProvider,
} from "@/lib/openrouter/rank-providers"
import type { OpenRouterProviderPreferences } from "@/lib/simplify/types"

const REFRESH_MS = 5 * 60 * 1000

const EMPTY_ENDPOINTS: OpenRouterPublicEndpoint[] = []

export type OpenRouterProviderRankings = {
  byThroughput: RankedProvider[]
  byLatency: RankedProvider[]
}

type UseOpenRouterProviderRoutingArgs = {
  apiKey: string
  enabled: boolean
  routingModelId: string
  /** Total token budget for E2E heuristic (prompt + completion). */
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
    return {
      order: [fastestEstimate.slug],
      allow_fallbacks: true,
    }
  }, [fastestEstimate])

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
    lastUpdated: lastUpdatedView,
    error: errorView,
    refresh,
  }
}
