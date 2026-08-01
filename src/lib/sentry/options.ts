import type { CloudflareOptions } from "@sentry/cloudflare"
import type { DataCollection, TracesSamplerSamplingContext } from "@sentry/core"
import type { BrowserOptions } from "@sentry/react"

import { SENTRY_DSN, SENTRY_TUNNEL_PATH } from "@/lib/sentry/constants"
import { scrubBreadcrumb, scrubEvent } from "@/lib/sentry/scrub"

/**
 * Option objects for both runtimes. Every SDK import is type-only, so a
 * mistyped key fails `pnpm typecheck` while nothing from the SDK enters either
 * bundle from this file.
 */

const isDev = import.meta.env.DEV

/** Trace rates in production. Dev always samples everything. */
const BROWSER_TRACE_RATE = 0.2
const WORKER_TRACE_RATE = 0.1

/**
 * Anonymous mode, stated field by field. Leaving these to the defaults would
 * mean a future change in Sentry could silently start sending headers, cookies,
 * or stack-frame variables — all of which carry the OpenRouter key here.
 */
const dataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: false, response: false },
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  stackFrameVariables: false,
  frameContextLines: 0,
} as const satisfies DataCollection

/**
 * Errors that are expected behaviour rather than bugs. A cancelled run is the
 * common one: the hunt view aborts its own fetch when the user stops a run.
 */
const ignoreErrors = [
  "ResizeObserver loop limit exceeded",
  "ResizeObserver loop completed with undelivered notifications",
  /^AbortError/,
  "The user aborted a request.",
  "signal is aborted without reason",
  /^Non-Error promise rejection captured/,
]

/** Transactions that are pure noise, plus the tunnel itself. */
const NON_SAMPLED_ROUTES =
  /\s\/(wdyd|robots\.txt|sitemap\.xml|favicon|manifest)/

function makeTracesSampler(productionRate: number) {
  return function tracesSampler(ctx: TracesSamplerSamplingContext): number {
    if (NON_SAMPLED_ROUTES.test(ctx.name)) return 0
    // Honour an upstream sampling decision so a browser-to-Worker trace stays
    // whole instead of being sampled independently at each end.
    return ctx.inheritOrSampleWith(isDev ? 1 : productionRate)
  }
}

export const browserTracesSampler = makeTracesSampler(BROWSER_TRACE_RATE)
export const workerTracesSampler = makeTracesSampler(WORKER_TRACE_RATE)

const sharedOptions = {
  dsn: SENTRY_DSN,
  release: __SENTRY_RELEASE__ ?? undefined,
  environment: isDev ? "development" : "production",
  sendDefaultPii: false,
  dataCollection,
  /** Console output here can echo pasted logs and raw model output. */
  enableLogs: false,
  /** Default is 100. Fewer breadcrumbs, less leak surface. */
  maxBreadcrumbs: 20,
  /** Default is 250. Truncates OpenRouter error bodies that quote user input. */
  maxValueLength: 200,
  /** Stops deep serialization of request and response objects. */
  normalizeDepth: 3,
  /** Never sample errors: the volume is tiny and every crash matters. */
  sampleRate: 1,
  ignoreErrors,
  beforeSend: scrubEvent,
  beforeSendTransaction: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
}

export const browserSentryOptions: BrowserOptions = {
  ...sharedOptions,
  /**
   * The reverse proxy. Set on the browser only — the Worker posts straight to
   * Sentry, which is what stops a tunnel error from tunnelling itself.
   */
  tunnel: SENTRY_TUNNEL_PATH,
  tracesSampler: browserTracesSampler,
  /**
   * Same-origin only. Without this the SDK appends `sentry-trace` and `baggage`
   * to the openrouter.ai fetches, which changes the CORS preflight on the
   * streaming completion request.
   */
  tracePropagationTargets: [/^\//],
  /** Browser extensions are the top noise source for a public site. */
  denyUrls: [
    /^chrome-extension:\/\//,
    /^moz-extension:\/\//,
    /^safari-(web-)?extension:\/\//,
  ],
  /** Only reports counts of discarded events, which we do not use. */
  sendClientReports: false,
}

export const workerSentryOptions: CloudflareOptions = {
  ...sharedOptions,
  tracesSampler: workerTracesSampler,
  /**
   * The Worker SDK installs a `Console` integration by default, which turns
   * every `console.*` call into a breadcrumb. `scrubBreadcrumb` drops those
   * anyway, but not collecting them is cheaper and mirrors the browser, where
   * `breadcrumbsIntegration({ console: false })` does the same job.
   */
  integrations: (defaults) =>
    defaults.filter((integration) => integration.name !== "Console"),
  /** Belt and braces behind the sampler, in case a span escapes it. */
  ignoreTransactions: ["POST /wdyd", "GET /robots.txt", "GET /sitemap.xml"],
}
