"use client"

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next"

function stripUrlQuery(urlStr: string): string {
  try {
    const url = new URL(urlStr)
    url.search = ""
    return url.toString()
  } catch {
    return urlStr
  }
}

export function VercelWebAnalytics() {
  return (
    <Analytics
      beforeSend={(event: BeforeSendEvent) => ({
        ...event,
        url: stripUrlQuery(event.url),
      })}
    />
  )
}
