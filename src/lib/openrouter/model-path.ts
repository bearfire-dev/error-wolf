/**
 * Build `{ author, slug }` for `GET /api/v1/models/{author}/{slug}/endpoints`.
 *
 * The hunt flow uses a configurable concrete model id (see `hunt-routing-config.ts`)
 * so `/endpoints` matches the provider pool you care about; wire that constant to
 * the same base model you use for completions when you switch off `openrouter/auto`.
 */

const ROUTING_VARIANT_SUFFIXES = new Set(["nitro", "floor", "exacto"])

function stripKnownRoutingVariant(slugWithOptionalVariant: string): string {
  const i = slugWithOptionalVariant.lastIndexOf(":")
  if (i === -1) return slugWithOptionalVariant
  const variant = slugWithOptionalVariant.slice(i + 1).toLowerCase()
  if (ROUTING_VARIANT_SUFFIXES.has(variant)) {
    return slugWithOptionalVariant.slice(0, i)
  }
  return slugWithOptionalVariant
}

export function modelIdToEndpointsPath(modelId: string): {
  author: string
  slug: string
} | null {
  const trimmed = modelId.trim()
  const slash = trimmed.indexOf("/")
  if (slash <= 0 || slash === trimmed.length - 1) return null

  const author = trimmed.slice(0, slash).trim()
  const rest = trimmed.slice(slash + 1).trim()
  if (!author || !rest) return null

  const slug = stripKnownRoutingVariant(rest)
  return { author, slug }
}

export function openRouterEndpointsUrl(modelId: string): string | null {
  const parts = modelIdToEndpointsPath(modelId)
  if (!parts) return null
  return `https://openrouter.ai/api/v1/models/${encodeURIComponent(parts.author)}/${encodeURIComponent(parts.slug)}/endpoints`
}
