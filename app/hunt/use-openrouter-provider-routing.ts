"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { estimateFastestProvider } from "@/lib/openrouter/estimate-fastest-provider"
import type { FastestProviderEstimate } from "@/lib/openrouter/estimate-fastest-provider"
import { fetchModelEndpointsDirect } from "@/lib/openrouter/endpoints-client"
import type { OpenRouterPublicEndpoint } from "@/lib/openrouter/endpoints-types"
import {
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
  OpenRouterProviderSortConfig,
} from "@/lib/simplify/types"

// Keep provider metadata fresh enough for interactive sessions without
// hammering the public endpoints API on every keystroke.
const REFRESH_MS = 90 * 1000
const ROUTING_PERCENTILE: PercentileKey = "p90"
const MAX_PROVIDER_ORDER = 4
const SMALL_REQUEST_MAX_TOKENS = 3500
const LARGE_REQUEST_MIN_TOKENS = 12000
const LATENCY_PROFILE_MAX_LATENCY: OpenRouterPercentilePreferenceMap = {
  p50: 1.1,
  p90: 2.2,
  p99: 4.5,
}
const LATENCY_PROFILE_MIN_THROUGHPUT: OpenRouterPercentilePreferenceMap = {
  p50: 8,
  p90: 4,
}
const BALANCED_PROFILE_MAX_LATENCY: OpenRouterPercentilePreferenceMap = {
  p50: 1.7,
  p90: 3.2,
  p99: 6,
}
const BALANCED_PROFILE_MIN_THROUGHPUT: OpenRouterPercentilePreferenceMap = {
  p50: 12,
  p90: 6,
}
const THROUGHPUT_PROFILE_MAX_LATENCY: OpenRouterPercentilePreferenceMap = {
  p50: 2.3,
  p90: 4.4,
  p99: 8,
}
const THROUGHPUT_PROFILE_MIN_THROUGHPUT: OpenRouterPercentilePreferenceMap = {
  p50: 18,
  p90: 9,
}

const EMPTY_ENDPOINTS: OpenRouterPublicEndpoint[] = []
type RoutingProfileKind = "latency" | "balanced" | "throughput"
type RoutingSort = OpenRouterProviderSortConfig["by"]

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

function topProviderSlugs(
  rows: readonly RankedProvider[],
  limit: number
): string[] {
  return uniqueProviderOrder(rows.map((row) => row.slug)).slice(0, limit)
}

function profileKindForTokens(totalTokens: number): RoutingProfileKind {
  if (totalTokens <= SMALL_REQUEST_MAX_TOKENS) return "latency"
  if (totalTokens >= LARGE_REQUEST_MIN_TOKENS) return "throughput"
  return "balanced"
}

function preferredMaxLatencyForProfile(
  kind: RoutingProfileKind
): OpenRouterPercentilePreferenceMap {
  switch (kind) {
    case "latency":
      return LATENCY_PROFILE_MAX_LATENCY
    case "throughput":
      return THROUGHPUT_PROFILE_MAX_LATENCY
    default:
      return BALANCED_PROFILE_MAX_LATENCY
  }
}

function preferredMinThroughputForProfile(
  kind: RoutingProfileKind
): OpenRouterPercentilePreferenceMap {
  switch (kind) {
    case "latency":
      return LATENCY_PROFILE_MIN_THROUGHPUT
    case "throughput":
      return THROUGHPUT_PROFILE_MIN_THROUGHPUT
    default:
      return BALANCED_PROFILE_MIN_THROUGHPUT
  }
}

function primarySortForProfile(
  kind: RoutingProfileKind,
  fastestEstimate: FastestProviderEstimate | null
): RoutingSort {
  if (kind === "latency") return "latency"
  if (kind === "throughput") return "throughput"

  return fastestEstimate &&
    fastestEstimate.breakdown.generationSeconds >
      fastestEstimate.breakdown.ttftSeconds
    ? "throughput"
    : "latency"
}

function secondarySortForProfile(
  kind: RoutingProfileKind,
  fastestEstimate: FastestProviderEstimate | null
): RoutingSort {
  return primarySortForProfile(kind, fastestEstimate) === "latency"
    ? "throughput"
    : "latency"
}

function buildProviderShortlist(params: {
  anchorSlug: string
  rankings: OpenRouterProviderRankings
  sort: RoutingSort
  exclude?: readonly string[]
}): string[] {
  const excluded = new Set(
    (params.exclude ?? []).map((slug) => slug.trim().toLowerCase())
  )
  const latencyCandidates = topProviderSlugs(
    params.rankings.byLatency,
    MAX_PROVIDER_ORDER
  )
  const throughputCandidates = topProviderSlugs(
    params.rankings.byThroughput,
    MAX_PROVIDER_ORDER
  )
  const ordered =
    params.sort === "latency"
      ? [params.anchorSlug, ...latencyCandidates, ...throughputCandidates]
      : [params.anchorSlug, ...throughputCandidates, ...latencyCandidates]

  return uniqueProviderOrder(ordered)
    .filter((slug) => !excluded.has(slug))
    .slice(0, MAX_PROVIDER_ORDER)
}

function buildProviderPreferences(params: {
  shortlist: readonly string[]
  sort: RoutingSort
  kind: RoutingProfileKind
}): OpenRouterProviderPreferences | undefined {
  const shortlist = uniqueProviderOrder(params.shortlist).slice(
    0,
    MAX_PROVIDER_ORDER
  )
  if (shortlist.length === 0) return undefined

  return {
    only: shortlist,
    allow_fallbacks: true,
    require_parameters: true,
    sort: params.sort,
    preferred_max_latency: preferredMaxLatencyForProfile(params.kind),
    preferred_min_throughput: preferredMinThroughputForProfile(params.kind),
  }
}

function preferredProviderSlug(
  provider: OpenRouterProviderPreferences | undefined
): string | null {
  return (
    provider?.order?.[0]?.trim().toLowerCase() ??
    provider?.only?.[0]?.trim().toLowerCase() ??
    null
  )
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

function isSlowStartModel(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase()
  return normalized.includes("gpt-oss-120b") || normalized.includes("405b")
}

function deriveLatencyPolicy(params: {
  primaryProvider: OpenRouterProviderPreferences | undefined
  secondaryProvider: OpenRouterProviderPreferences | undefined
  endpoints: OpenRouterPublicEndpoint[]
  totalTokens: number
  routingModelId: string
}): OpenRouterLatencyPolicy | undefined {
  const secondaryProvider = params.secondaryProvider
  const primarySlug = preferredProviderSlug(params.primaryProvider)
  const secondarySlug = preferredProviderSlug(secondaryProvider)
  if (
    !primarySlug ||
    !secondaryProvider ||
    !secondarySlug ||
    secondarySlug === primarySlug
  ) {
    return undefined
  }

  // Use a stricter percentile than p50 so interactive traffic responds to
  // tail latency instead of inheriting long waits from median-only stats.
  const baselineLatencyMs = providerLatencyMs(
    primarySlug,
    params.endpoints,
    ROUTING_PERCENTILE
  )
  const tokenScale =
    params.totalTokens >= LARGE_REQUEST_MIN_TOKENS
      ? 1.2
      : params.totalTokens <= SMALL_REQUEST_MAX_TOKENS
        ? 0.9
        : 1
  const modelScale = isSlowStartModel(params.routingModelId) ? 1.15 : 1
  const hedgeAfterMs =
    baselineLatencyMs !== null
      ? clampMs(
          Math.round(baselineLatencyMs * 0.8 * tokenScale * modelScale),
          HUNT_OPENROUTER_LATENCY_HEDGE_FALLBACK_MS,
          HUNT_OPENROUTER_LATENCY_HEDGE_MAX_MS
        )
      : HUNT_OPENROUTER_LATENCY_HEDGE_FALLBACK_MS

  return {
    hedgeAfterMs,
    secondaryProvider,
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

  const routingProfileKind = useMemo(
    (): RoutingProfileKind => profileKindForTokens(e2eTokenEstimate),
    [e2eTokenEstimate]
  )

  const primarySort = useMemo(
    (): RoutingSort =>
      primarySortForProfile(routingProfileKind, fastestEstimate),
    [fastestEstimate, routingProfileKind]
  )

  const secondarySort = useMemo(
    (): RoutingSort =>
      secondarySortForProfile(routingProfileKind, fastestEstimate),
    [fastestEstimate, routingProfileKind]
  )

  const providerShortlists = useMemo(() => {
    const anchorSlug =
      fastestEstimate?.slug ??
      rankings.byLatency[0]?.slug ??
      rankings.byThroughput[0]?.slug ??
      null
    if (!anchorSlug) {
      return { primary: [] as string[], secondary: [] as string[] }
    }

    const primary = buildProviderShortlist({
      anchorSlug,
      rankings,
      sort: primarySort,
    })
    const secondary = buildProviderShortlist({
      anchorSlug,
      rankings,
      sort: secondarySort,
      exclude: primary.slice(0, 1),
    })

    return { primary, secondary }
  }, [fastestEstimate, primarySort, rankings, secondarySort])

  const providerPreferences = useMemo(
    (): OpenRouterProviderPreferences | undefined =>
      buildProviderPreferences({
        shortlist: providerShortlists.primary,
        sort: primarySort,
        kind: routingProfileKind,
      }),
    [primarySort, providerShortlists.primary, routingProfileKind]
  )

  const secondaryProviderPreferences = useMemo(
    (): OpenRouterProviderPreferences | undefined =>
      buildProviderPreferences({
        shortlist: providerShortlists.secondary,
        sort: secondarySort,
        kind: routingProfileKind,
      }),
    [providerShortlists.secondary, routingProfileKind, secondarySort]
  )

  const providerLatencyPolicy = useMemo(
    (): OpenRouterLatencyPolicy | undefined =>
      deriveLatencyPolicy({
        primaryProvider: providerPreferences,
        secondaryProvider: secondaryProviderPreferences,
        endpoints: endpointsView,
        totalTokens: e2eTokenEstimate,
        routingModelId,
      }),
    [
      e2eTokenEstimate,
      endpointsView,
      providerPreferences,
      routingModelId,
      secondaryProviderPreferences,
    ]
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
    if (!active || !providerPreferences) return

    console.info("[hunt] OpenRouter provider routing updated", {
      model: routingModelId.trim(),
      percentile: ROUTING_PERCENTILE,
      routingProfile: routingProfileKind,
      primaryProvider: preferredProviderSlug(providerPreferences),
      primaryCandidates:
        providerPreferences.only ?? providerPreferences.order ?? [],
      secondaryProvider: preferredProviderSlug(secondaryProviderPreferences),
      secondaryCandidates:
        secondaryProviderPreferences?.only ??
        secondaryProviderPreferences?.order ??
        [],
      allowFallbacks: providerPreferences.allow_fallbacks ?? null,
      requireParameters: providerPreferences.require_parameters ?? null,
      providerSort: providerPreferences.sort ?? null,
      preferredMaxLatency: providerPreferences.preferred_max_latency ?? null,
      preferredMinThroughput:
        providerPreferences.preferred_min_throughput ?? null,
      hedgeAfterMs: providerLatencyPolicy?.hedgeAfterMs ?? null,
      cancelAfterMs: providerLatencyPolicy?.cancelAfterMs ?? null,
      e2eTokenEstimate,
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
    e2eTokenEstimate,
    lastUpdatedView,
    providerLatencyPolicy,
    providerPreferences,
    rankings,
    routingProfileKind,
    routingModelId,
    secondaryProviderPreferences,
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
