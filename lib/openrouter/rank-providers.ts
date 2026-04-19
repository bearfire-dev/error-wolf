import type {
  OpenRouterPercentileStats,
  OpenRouterPublicEndpoint,
} from "@/lib/openrouter/endpoints-types"

export type PercentileKey = keyof OpenRouterPercentileStats

export type RankedProvider = {
  slug: string
  endpoint: OpenRouterPublicEndpoint
  score: number
}

function percentileValue(
  stats: OpenRouterPercentileStats | null | undefined,
  p: PercentileKey
): number | null {
  if (!stats) return null
  const v = stats[p]
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

/** Prefer `tag` prefix (`deepinfra/bf16` → `deepinfra`), else slugify `provider_name`. */
export function endpointProviderSlug(
  endpoint: OpenRouterPublicEndpoint
): string {
  const tag = endpoint.tag?.trim() ?? ""
  const slash = tag.indexOf("/")
  if (slash > 0) {
    return tag.slice(0, slash).trim().toLowerCase()
  }

  return endpoint.provider_name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function dedupeBySlugBestScore(
  rows: RankedProvider[],
  higherIsBetter: boolean
): RankedProvider[] {
  const best = new Map<string, RankedProvider>()

  for (const row of rows) {
    const prev = best.get(row.slug)
    if (!prev) {
      best.set(row.slug, row)
      continue
    }
    if (higherIsBetter) {
      if (row.score > prev.score) best.set(row.slug, row)
    } else if (row.score < prev.score) {
      best.set(row.slug, row)
    }
  }

  return [...best.values()]
}

export function rankProvidersByThroughput(
  endpoints: OpenRouterPublicEndpoint[],
  percentile: PercentileKey = "p50"
): RankedProvider[] {
  const rows: RankedProvider[] = []

  for (const endpoint of endpoints) {
    const tput = percentileValue(endpoint.throughput_last_30m, percentile)
    if (tput === null || tput <= 0) continue
    rows.push({
      slug: endpointProviderSlug(endpoint),
      endpoint,
      score: tput,
    })
  }

  const deduped = dedupeBySlugBestScore(rows, true)
  return deduped.sort((a, b) => b.score - a.score)
}

/** Ascending TTFT (ms); lower is better. */
export function rankProvidersByLatency(
  endpoints: OpenRouterPublicEndpoint[],
  percentile: PercentileKey = "p50"
): RankedProvider[] {
  const rows: RankedProvider[] = []

  for (const endpoint of endpoints) {
    const ms = percentileValue(endpoint.latency_last_30m, percentile)
    if (ms === null || ms < 0) continue
    rows.push({
      slug: endpointProviderSlug(endpoint),
      endpoint,
      score: ms,
    })
  }

  const deduped = dedupeBySlugBestScore(rows, false)
  return deduped.sort((a, b) => a.score - b.score)
}
