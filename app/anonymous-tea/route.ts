import { checkBotId } from "botid/server"
import { NextRequest, NextResponse } from "next/server"

import { getSentryDsn } from "@/lib/sentry-dsn"
import {
  getSentryTunnelAllowlist,
  resolveSentryTunnelUpstreamUrl,
} from "@/lib/sentry-tunnel-allowlist"

const isLocalDev = process.env.NODE_ENV === "development"

export async function POST(request: NextRequest) {
  const allow = getSentryTunnelAllowlist(getSentryDsn())
  if (!allow) {
    return new NextResponse(null, { status: 503 })
  }

  // Sentry may use transports that bypass BotID's fetch patch (no `x-is-human`), which
  // makes `checkBotId` noisy in dev. Skip verification locally; keep it on preview/prod.
  if (!isLocalDev) {
    const verification = await checkBotId({
      advancedOptions: { checkLevel: "basic" },
    })
    if (verification.isBot) {
      return new NextResponse(null, { status: 403 })
    }
  }

  const url = new URL(request.url)
  const upstreamUrl = resolveSentryTunnelUpstreamUrl(
    allow,
    url.searchParams.get("o"),
    url.searchParams.get("p"),
    url.searchParams.get("r")
  )
  if (!upstreamUrl) {
    return new NextResponse(null, { status: 400 })
  }

  const headers = new Headers()
  const ct = request.headers.get("content-type")
  if (ct) headers.set("content-type", ct)
  const auth = request.headers.get("x-sentry-auth")
  if (auth) headers.set("x-sentry-auth", auth)

  const body = await request.arrayBuffer()

  const upstream = await fetch(upstreamUrl, {
    method: "POST",
    headers,
    body,
  })

  const outHeaders = new Headers()
  const upstreamCt = upstream.headers.get("content-type")
  if (upstreamCt) outHeaders.set("content-type", upstreamCt)
  const retryAfter = upstream.headers.get("retry-after")
  if (retryAfter) outHeaders.set("retry-after", retryAfter)

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: outHeaders,
  })
}
