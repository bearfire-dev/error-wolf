import type { TracesSamplerSamplingContext } from "@sentry/core"
import { describe, expect, it } from "vitest"

import {
  browserSentryOptions,
  browserTracesSampler,
  workerSentryOptions,
  workerTracesSampler,
} from "@/lib/sentry/options"
import { scrubBreadcrumb, scrubEvent } from "@/lib/sentry/scrub"

/**
 * Guards on the anonymity settings. A regression in any of these is a live PII
 * leak rather than a style problem, so they are asserted instead of reviewed.
 */

/**
 * Records the fallback rate the sampler offers, so a test can tell "returned 0
 * outright" apart from "delegated and the parent said no".
 */
function samplingContext(name: string) {
  const offered: number[] = []
  const ctx = {
    name,
    inheritOrSampleWith: (fallback: number) => {
      offered.push(fallback)
      // Stand in for a parent that sampled the trace in.
      return 1
    },
  } as unknown as TracesSamplerSamplingContext
  return { ctx, offered }
}

describe("tracesSampler", () => {
  it("drops the tunnel outright, without consulting the parent", () => {
    for (const sampler of [workerTracesSampler, browserTracesSampler]) {
      const { ctx, offered } = samplingContext("POST /wdyd")
      expect(sampler(ctx)).toBe(0)
      expect(offered).toEqual([])
    }
  })

  it("drops robots and sitemap", () => {
    for (const name of ["GET /robots.txt", "GET /sitemap.xml"]) {
      const { ctx } = samplingContext(name)
      expect(workerTracesSampler(ctx)).toBe(0)
    }
  })

  it("honours an upstream sampling decision for a normal route", () => {
    const { ctx, offered } = samplingContext("GET /hunt")
    expect(workerTracesSampler(ctx)).toBe(1)
    // Delegated rather than deciding alone, so a browser-to-Worker trace stays
    // whole instead of being sampled independently at each end.
    expect(offered).toHaveLength(1)
  })

  it("offers the browser a higher fallback rate than the Worker", () => {
    const browser = samplingContext("GET /hunt")
    const worker = samplingContext("GET /hunt")
    browserTracesSampler(browser.ctx)
    workerTracesSampler(worker.ctx)
    expect(browser.offered[0]).toBeGreaterThanOrEqual(worker.offered[0] ?? 0)
  })
})

describe("tunnel wiring", () => {
  it("tunnels the browser and not the Worker", () => {
    // The Worker posting straight to Sentry is what stops an error thrown
    // while handling a tunnel request from tunnelling itself.
    expect(browserSentryOptions.tunnel).toBe("/wdyd")
    expect(workerSentryOptions.tunnel).toBeUndefined()
  })
})

describe("worker integrations", () => {
  it("drops the Console integration that captures console output", () => {
    const defaults = [
      { name: "Console", setupOnce: () => {} },
      { name: "Dedupe", setupOnce: () => {} },
    ]
    const configure = workerSentryOptions.integrations
    // Narrowed rather than asserted: the option also accepts a plain array.
    if (typeof configure !== "function") {
      throw new Error("worker integrations must stay a filter function")
    }
    expect(configure(defaults).map((i) => i.name)).toEqual(["Dedupe"])
  })
})

describe("anonymous mode", () => {
  for (const [label, options] of [
    ["browser", browserSentryOptions],
    ["worker", workerSentryOptions],
  ] as const) {
    it(`keeps ${label} reporting anonymous`, () => {
      expect(options.sendDefaultPii).toBe(false)
      expect(options.enableLogs).toBe(false)

      const collection = options.dataCollection
      expect(collection?.userInfo).toBe(false)
      expect(collection?.cookies).toBe(false)
      expect(collection?.httpHeaders?.request).toBe(false)
      expect(collection?.httpHeaders?.response).toBe(false)
      expect(collection?.httpBodies).toEqual([])
      expect(collection?.urlQueryParams).toBe(false)
      expect(collection?.stackFrameVariables).toBe(false)
      expect(collection?.databaseQueryData).toBe(false)
      expect(collection?.frameContextLines).toBe(0)
    })

    it(`routes every ${label} event through the scrubber`, () => {
      expect(options.beforeSend).toBe(scrubEvent)
      expect(options.beforeSendTransaction).toBe(scrubEvent)
      expect(options.beforeBreadcrumb).toBe(scrubBreadcrumb)
    })
  }
})
