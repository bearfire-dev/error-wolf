/**
 * Parse Sentry DSN so the tunnel only forwards to this project's ingest endpoint (SSRF guard).
 * Host shapes: o{org}.ingest.sentry.io or o{org}.ingest.{region}.sentry.io
 */
export type SentryTunnelAllowlist = {
  orgId: string
  projectId: string
  /** Two-letter ingest region when not on default ingest.sentry.io */
  region: string | null
}

export function getSentryTunnelAllowlist(
  dsn: string | undefined
): SentryTunnelAllowlist | null {
  const raw = dsn?.trim()
  if (!raw) return null

  try {
    const u = new URL(raw)
    const host = u.hostname.toLowerCase()
    const m = host.match(/^o(\d+)\.ingest(?:\.([a-z]{2}))?\.sentry\.io$/)
    if (!m) return null

    const projectId = u.pathname.replace(/^\//, "").split("/")[0]
    if (!projectId || !/^\d+$/.test(projectId)) return null

    return {
      orgId: m[1],
      projectId,
      region: m[2] ?? null,
    }
  } catch {
    return null
  }
}

/**
 * Build the Sentry ingest envelope URL for this tunnel request.
 *
 * - `tunnel` in Sentry.init posts to the path only (no `?o=&p=`) — see
 *   `getEnvelopeEndpointWithUrlEncodedAuth` in @sentry/core.
 * - Next.js `tunnelRoute` rewrites used `?o=` org id, `p=` project id, optional `r=` region.
 */
export function resolveSentryTunnelUpstreamUrl(
  allow: SentryTunnelAllowlist,
  queryO: string | null,
  queryP: string | null,
  queryR: string | null
): string | null {
  const hasO = queryO != null && queryO !== ""
  const hasP = queryP != null && queryP !== ""
  if (hasO !== hasP) return null

  let orgId: string
  let projectId: string
  let regionForHost: string | null

  if (hasO && hasP) {
    if (queryO !== allow.orgId || queryP !== allow.projectId) return null
    orgId = queryO
    projectId = queryP
    regionForHost = queryR ?? allow.region
    if (allow.region) {
      if (queryR && queryR !== allow.region) return null
      if (!queryR) regionForHost = allow.region
    }
  } else {
    orgId = allow.orgId
    projectId = allow.projectId
    regionForHost = allow.region
  }

  const ingestHost = regionForHost
    ? `o${orgId}.ingest.${regionForHost}.sentry.io`
    : `o${orgId}.ingest.sentry.io`
  return `https://${ingestHost}/api/${projectId}/envelope/?hsts=0`
}
