/**
 * Canonical site origin for metadata, sitemap, and robots.
 * Set NEXT_PUBLIC_SITE_URL in production (e.g. https://example.com).
 * On Vercel, VERCEL_URL is used when the public URL is unset.
 */
export function getSiteUrl(): URL {
  const trimTrailingSlashes = (value: string) => value.replace(/\/+$/, "")

  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) {
    return new URL(`${trimTrailingSlashes(explicit)}/`)
  }

  const vercel = process.env.VERCEL_URL?.trim()
  if (vercel) {
    return new URL(`${trimTrailingSlashes(`https://${vercel}`)}/`)
  }

  return new URL("http://localhost:3000/")
}
