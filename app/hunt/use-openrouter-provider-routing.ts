"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { estimateFastestProvider } from "@/lib/openrouter/estimate-fastest-provider"
import type { FastestProviderEstimate } from "@/lib/openrouter/estimate-fastest-provider"
import { fetchModelEndpointsDirect } from "@/lib/openrouter/endpoints-client"
import type { OpenRouterPublicEndpoint } from "@/lib/openrouter/endpoints-types"
import {
  HUNT_OPENROUTER_LATENCY_CANCEL_FALLBACK_MS,
  HUNT_OPENROUTER_LATENCY_CANCEL_MAX_MS,
  HUNT_OPENROUTER_LATENCY_HEDGE_FALLBACK_MS,
  HUNT_OPENROUTER_LATENCY_HEDGE_MAX_MS,
  HUNT_ROUTING_E2E_TOKEN_ESTIMATE,
} from "@/lib/openrouter/hunt-routing-config"
import {
  endpointProviderSlug,
  rankProvidersByLatency,
  rankProvidersByThroughput,
  type PercentileKey,
  type RankedProvider,
} from "@/lib/openrouter/rank-providers"
import type {
  OpenRouterLatencyPolicy,
  OpenRouterPercentilePreferenceMap,
  OpenRouterProviderPreferences,
} from "@/lib/simplify/types"

// Keep provider metadata fresh enough for interactive sessions without
// hammering the public endpoints API on every keystroke.
const REFRESH_MS = 90 * 1000
const ROUTING_PERCENTILE: PercentileKey = "p90"
const MAX_PROVIDER_ORDER = 4
const PROVIDER_PREFERRED_MAX_LATENCY: OpenRouterPercentilePreferenceMap = {
  p50: 1.5,
  p90: 3,
  p99: 6,
}
const PROVIDER_PREFERRED_MIN_THROUGHPUT: OpenRouterPercentilePreferenceMap = {
  p50: 12,
  p90: 6,
}

const EMPTY_ENDPOINTS: OpenRouterPublicEndpoint[] = []

export type OpenRouterProviderRankings = {
  byThroughput: RankedProvider[]
  byLatency: RankedProvider[]
}

function clampMs(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function uniqueProviderOrder(slugs: readonly string[]): string[] {
  const seen = new Set<string>()
  const order: string[] = []

  for (const slug of slugs) {
    const normalized = slug.trim().toLowerCase()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    order.push(normalized)
  }

  return order
}

function buildProviderPreferences(
  order: readonly string[]
): OpenRouterProviderPreferences {
  return {
    order: uniqueProviderOrder(order).slice(0, MAX_PROVIDER_ORDER),
    allow_fallbacks: true,
    preferred_max_latency: PROVIDER_PREFERRED_MAX_LATENCY,
    preferred_min_throughput: PROVIDER_PREFERRED_MIN_THROUGHPUT,
  }
}

function providerLatencyMs(
  slug: string | null | undefined,
  endpoints: OpenRouterPublicEndpoint[],
  percentile: PercentileKey
): number | null {
  const normalizedSlug = slug?.trim().toLowerCase()
  if (!normalizedSlug) return null

  for (const endpoint of endpoints) {
    if (endpointProviderSlug(endpoint) !== normalizedSlug) continue
    const latencyMs = endpoint.latency_last_30m?.[percentile]
    if (typeof latencyMs === "number" && Number.isFinite(latencyMs)) {
      return latencyMs
    }
  }

  return null
}

function buildProviderOrder(params: {
  primarySlug: string
  rankings: OpenRouterProviderRankings
}): string[] {
  return uniqueProviderOrder([
    params.primarySlug,
    ...params.rankings.byLatency.map((row) => row.slug),
    ...params.rankings.byThroughput.map((row) => row.slug),
  ]).slice(0, MAX_PROVIDER_ORDER)
}

function deriveLatencyPolicy(params: {
  provider: OpenRouterProviderPreferences | undefined
  endpoints: OpenRouterPublicEndpoint[]
}): OpenRouterLatencyPolicy | undefined {
  const providerOrder = params.provider?.order
  const primarySlug = providerOrder?.[0]?.trim().toLowerCase()
  if (!primarySlug) return undefined

  const secondaryOrder = providerOrder
    ?.map((slug) => slug.trim().toLowerCase())
    .filter((slug) => slug && slug !== primarySlug)
  if (!secondaryOrder?.length) return undefined

  // Use a stricter percentile than p50 so interactive traffic responds to
  // tail latency instead of inheriting long waits from median-only stats.
  const baselineLatencyMs = providerLatencyMs(
    primarySlug,
    params.endpoints,
    ROUTING_PERCENTILE
  )
  const hedgeAfterMs =
    baselineLatencyMs !== null
      ? clampMs(
          Math.round(baselineLatencyMs * 0.8),
          HUNT_OPENROUTER_LATENCY_HEDGE_FALLBACK_MS,
          HUNT_OPENROUTER_LATENCY_HEDGE_MAX_MS
        )
      : HUNT_OPENROUTER_LATENCY_HEDGE_FALLBACK_MS
  const cancelAfterMs =
    baselineLatencyMs !== null
      ? clampMs(
          Math.max(Math.round(baselineLatencyMs * 1.4), hedgeAfterMs + 1200),
          HUNT_OPENROUTER_LATENCY_CANCEL_FALLBACK_MS,
          HUNT_OPENROUTER_LATENCY_CANCEL_MAX_MS
        )
      : HUNT_OPENROUTER_LATENCY_CANCEL_FALLBACK_MS

  return {
    hedgeAfterMs,
    cancelAfterMs,
    secondaryProvider: buildProviderPreferences(secondaryOrder),
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
    console.info("[hunt] OpenRouter provider rankings refreshed", {
      model,
      endpointCount: result.data.endpoints.length,
    })
  }, [apiKey, enabled, routingModelId])

  const endpointsView = useMemo(
    () => (active ? endpoints : EMPTY_ENDPOINTS),
    [active, endpoints]
  )
  const lastUpdatedView = active ? lastUpdated : null
  const errorView = active ? error : null

  const rankings = useMemo((): OpenRouterProviderRankings => {
    return {
      byThroughput: rankProvidersByThroughput(
        endpointsView,
        ROUTING_PERCENTILE
      ),
      byLatency: rankProvidersByLatency(endpointsView, ROUTING_PERCENTILE),
    }
  }, [endpointsView])

  const fastestEstimate = useMemo(
    (): FastestProviderEstimate | null =>
      estimateFastestProvider(endpointsView, e2eTokenEstimate, {
        percentile: ROUTING_PERCENTILE,
      }),
    [endpointsView, e2eTokenEstimate]
  )

  const providerPreferences = useMemo(():
    | OpenRouterProviderPreferences
    | undefined => {
    if (!fastestEstimate?.slug) return undefined
    return buildProviderPreferences(
      buildProviderOrder({
        primarySlug: fastestEstimate.slug,
        rankings,
      })
    )
  }, [fastestEstimate, rankings])

  const providerLatencyPolicy = useMemo(
    (): OpenRouterLatencyPolicy | undefined =>
      deriveLatencyPolicy({
        provider: providerPreferences,
        endpoints: endpointsView,
      }),
    [endpointsView, providerPreferences]
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

  useEffect(() => {
    if (!active || !providerPreferences?.order?.length) return

    console.info("[hunt] OpenRouter provider routing updated", {
      model: routingModelId.trim(),
      percentile: ROUTING_PERCENTILE,
      primaryProvider: providerPreferences.order[0] ?? null,
      fallbackProviders: providerPreferences.order.slice(1),
      allowFallbacks: providerPreferences.allow_fallbacks ?? null,
      preferredMaxLatency: providerPreferences.preferred_max_latency ?? null,
      preferredMinThroughput:
        providerPreferences.preferred_min_throughput ?? null,
      hedgeAfterMs: providerLatencyPolicy?.hedgeAfterMs ?? null,
      cancelAfterMs: providerLatencyPolicy?.cancelAfterMs ?? null,
      rankingLastUpdatedAt: lastUpdatedView,
      topLatencyProviders: rankings.byLatency
        .slice(0, 3)
        .map((row) => row.slug),
      topThroughputProviders: rankings.byThroughput
        .slice(0, 3)
        .map((row) => row.slug),
    })
  }, [
    active,
    lastUpdatedView,
    providerLatencyPolicy,
    providerPreferences,
    rankings,
    routingModelId,
  ])

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
