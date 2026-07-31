import type { Breadcrumb, Event as SentryEvent } from "@sentry/core"
import { describe, expect, it } from "vitest"

import {
  redactSecrets,
  scrubBreadcrumb,
  scrubEvent,
  scrubUrl,
  truncate,
} from "@/lib/sentry/scrub"

/**
 * These assertions are the privacy contract, not style checks. Weakening one
 * means a real key or a user's pasted stack trace reaches Sentry.
 */

const FAKE_KEY = "sk-or-v1-0123456789abcdef0123456789abcdef"

describe("redactSecrets", () => {
  it("redacts an OpenRouter key inside a longer sentence", () => {
    const result = redactSecrets(`request failed for ${FAKE_KEY} on attempt 2`)
    expect(result).not.toContain("0123456789abcdef")
    expect(result).toContain("sk-or-v1-[redacted]")
    expect(result).toContain("on attempt 2")
  })

  it("redacts a bearer token but keeps the scheme", () => {
    const result = redactSecrets("Authorization: Bearer abcdef0123456789xyz")
    expect(result).toBe("Authorization: Bearer [redacted]")
  })

  it("leaves ordinary prose alone", () => {
    const prose = "TypeError: cannot read properties of undefined"
    expect(redactSecrets(prose)).toBe(prose)
  })
})

describe("truncate", () => {
  it("keeps text under the limit unchanged", () => {
    expect(truncate("short", 200)).toBe("short")
  })

  it("cuts longer text and marks the cut", () => {
    expect(truncate("a".repeat(500))).toHaveLength(201)
    expect(truncate("a".repeat(500)).endsWith("…")).toBe(true)
  })
})

describe("scrubUrl", () => {
  it("drops the query string and the fragment", () => {
    expect(scrubUrl("https://errorwolf.dev/hunt?key=abc#frag")).toBe(
      "https://errorwolf.dev/hunt"
    )
  })
})

describe("scrubEvent", () => {
  it("removes every identifying field", () => {
    const event = scrubEvent({
      user: { id: "42", ip_address: "203.0.113.7" },
      server_name: "worker-1",
      extra: { note: "anything" },
      contexts: { culture: { locale: "en-US", timezone: "America/Denver" } },
      request: {
        url: "https://errorwolf.dev/hunt?token=abc",
        cookies: { error_wolf_openrouter_key: FAKE_KEY },
        headers: { authorization: `Bearer ${FAKE_KEY}` },
        data: { pasted: "a stack trace" },
        query_string: "token=abc",
      },
    } satisfies SentryEvent)

    expect(event.user).toBeUndefined()
    expect(event.server_name).toBeUndefined()
    expect(event.extra).toBeUndefined()
    expect(event.contexts?.culture).toBeUndefined()
    expect(event.request?.cookies).toBeUndefined()
    expect(event.request?.headers).toBeUndefined()
    expect(event.request?.data).toBeUndefined()
    expect(event.request?.query_string).toBeUndefined()
    expect(event.request?.url).toBe("https://errorwolf.dev/hunt")
    expect(JSON.stringify(event)).not.toContain("0123456789abcdef")
  })

  it("redacts and truncates a pasted stack trace in an exception value", () => {
    const pasted = `at Object.<anonymous> key=${FAKE_KEY}\n${"noise ".repeat(1000)}`
    const event = scrubEvent({
      exception: { values: [{ type: "Error", value: pasted }] },
    } satisfies SentryEvent)

    const value = event.exception?.values?.[0]?.value ?? ""
    expect(value).not.toContain("0123456789abcdef")
    expect(value).toContain("sk-or-v1-[redacted]")
    expect(value.length).toBeLessThanOrEqual(201)
  })

  it("drops frame variables and browser-extension frames", () => {
    const event = scrubEvent({
      exception: {
        values: [
          {
            type: "Error",
            stacktrace: {
              frames: [
                { filename: "chrome-extension://abc/content.js" },
                { filename: "/src/routes/hunt.tsx", vars: { key: FAKE_KEY } },
              ],
            },
          },
        ],
      },
    } satisfies SentryEvent)

    const frames = event.exception?.values?.[0]?.stacktrace?.frames ?? []
    expect(frames).toHaveLength(1)
    expect(frames[0]?.filename).toBe("/src/routes/hunt.tsx")
    expect(frames[0]?.vars).toBeUndefined()
  })

  it("scrubs a transaction event, proving the generic serves both hooks", () => {
    const event = scrubEvent({
      type: "transaction",
      transaction: "/hunt?token=abc",
      spans: [
        {
          description: "POST https://openrouter.ai/api/v1/chat?key=abc",
          span_id: "a",
          trace_id: "b",
          start_timestamp: 0,
          data: {},
        },
      ],
    } satisfies SentryEvent)

    expect(event.transaction).toBe("/hunt")
    expect(event.spans?.[0]?.description).toBe(
      "POST https://openrouter.ai/api/v1/chat"
    )
  })

  it("filters breadcrumbs through scrubBreadcrumb", () => {
    const event = scrubEvent({
      breadcrumbs: [
        { category: "console", message: `raw model output ${FAKE_KEY}` },
        { category: "navigation", data: { from: "/", to: "/hunt" } },
      ],
    } satisfies SentryEvent)

    expect(event.breadcrumbs).toHaveLength(1)
    expect(event.breadcrumbs?.[0]?.category).toBe("navigation")
  })
})

describe("scrubBreadcrumb", () => {
  it("drops console breadcrumbs", () => {
    expect(
      scrubBreadcrumb({ category: "console", message: "anything" })
    ).toBeNull()
  })

  it("drops typed input", () => {
    expect(
      scrubBreadcrumb({ category: "ui.input", message: "anything" })
    ).toBeNull()
  })

  it("drops an unrecognized category rather than guessing", () => {
    expect(scrubBreadcrumb({ category: "something.new" })).toBeNull()
  })

  it("keeps navigation and strips the query string from a url", () => {
    const crumb = scrubBreadcrumb({
      category: "fetch",
      data: { url: "https://errorwolf.dev/api?token=abc", method: "POST" },
    } satisfies Breadcrumb)

    expect(crumb?.data?.url).toBe("https://errorwolf.dev/api")
    expect(crumb?.data?.method).toBe("POST")
  })

  it("drops data keys outside the allowlist", () => {
    const crumb = scrubBreadcrumb({
      category: "fetch",
      data: { url: "https://errorwolf.dev/api", body: `key ${FAKE_KEY}` },
    } satisfies Breadcrumb)

    expect(crumb?.data?.body).toBeUndefined()
  })
})
