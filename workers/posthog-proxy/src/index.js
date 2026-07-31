/**
 * PostHog reverse proxy. Taken from the PostHog Cloudflare guide, US region:
 * https://posthog.com/docs/advanced/proxy/cloudflare
 *
 * It exists so the browser sends ingest traffic to a first-party hostname that
 * ad blockers do not match. Keep the subdomain free of the words analytics,
 * tracking, telemetry, posthog, and ph — blockers match all of those.
 *
 * This is a separate Worker from the app. Do not fold it into `src/server.ts`:
 * the app Worker answers on the site origin, and the whole point is that ingest
 * arrives on a different hostname that carries no cookies for the site.
 */
const API_HOST = "us.i.posthog.com"
const ASSET_HOST = "us-assets.i.posthog.com"

async function handleRequest(request, ctx) {
  const url = new URL(request.url)
  const pathname = url.pathname
  const search = url.search
  const pathWithParams = pathname + search

  if (pathname.startsWith("/static/") || pathname.startsWith("/array/")) {
    return retrieveAsset(request, pathWithParams, ctx)
  } else {
    return forwardRequest(request, pathWithParams)
  }
}

async function retrieveAsset(request, pathname, ctx) {
  let response = await caches.default.match(request)
  if (!response) {
    response = await fetch(`https://${ASSET_HOST}${pathname}`)
    ctx.waitUntil(caches.default.put(request, response.clone()))
  }
  return response
}

async function forwardRequest(request, pathWithSearch) {
  const ip = request.headers.get("CF-Connecting-IP") || ""
  const originHeaders = new Headers(request.headers)
  originHeaders.delete("cookie")
  originHeaders.set("X-Forwarded-For", ip)

  const originRequest = new Request(`https://${API_HOST}${pathWithSearch}`, {
    method: request.method,
    headers: originHeaders,
    body:
      request.method !== "GET" && request.method !== "HEAD"
        ? await request.arrayBuffer()
        : null,
    redirect: request.redirect,
  })

  return await fetch(originRequest)
}

// Named, not an anonymous object literal, so oxlint's
// `import/no-anonymous-default-export` stays quiet. Behavior is unchanged from
// the guide's snippet.
const worker = {
  async fetch(request, env, ctx) {
    return handleRequest(request, ctx)
  },
}

export default worker
