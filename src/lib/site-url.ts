/**
 * Canonical site origin for metadata, sitemap, and robots.
 * Set NEXT_PUBLIC_SITE_URL in production (e.g. https://example.com).
 * On Vercel, VERCEL_URL is used when the public URL is unset.
 */
const FALLBACK_SITE_URL = "http://localhost:3000/"

/** `new URL` throws on a malformed origin, and this runs while the root layout
 * module evaluates — so a typo would otherwise take down every route. */
function parseOrigin(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    console.warn("[site-url] ignoring malformed site origin", value)
    return null
  }
}

export function getSiteUrl(): URL {
  const trimTrailingSlashes = (value: string) => value.replace(/\/+$/, "")

  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) {
    const parsed = parseOrigin(`${trimTrailingSlashes(explicit)}/`)
    if (parsed) return parsed
  }

  const vercel = process.env.VERCEL_URL?.trim()
  if (vercel) {
    const parsed = parseOrigin(`${trimTrailingSlashes(`https://${vercel}`)}/`)
    if (parsed) return parsed
  }

  return new URL(FALLBACK_SITE_URL)
}
