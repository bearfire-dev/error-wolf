import type { Breadcrumb, Event as SentryEvent } from "@sentry/core"

/**
 * The privacy layer. Every event and every breadcrumb passes through here
 * before it leaves the browser or the Worker.
 *
 * Two things in this app make aggressive scrubbing necessary:
 *
 * 1. The OpenRouter key lives in a `SameSite=Lax; Path=/` cookie, so every
 *    same-origin request carries `sk-or-v1-…` in the `Cookie` header.
 * 2. Users paste stack traces and build logs. `src/lib/simplify/openrouter`
 *    builds error messages out of OpenRouter's JSON error body, and a
 *    moderation refusal echoes the flagged input back — that is, the pasted
 *    trace ends up inside an exception message.
 *
 * The imports are type-only, so `src/lib/` keeps no runtime SDK dependency.
 */

/** Longest error message or breadcrumb text that leaves the browser. */
const MAX_TEXT_LENGTH = 200

const REDACTED = "[redacted]"

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/sk-or-v1-[A-Za-z0-9._-]{8,}/g, `sk-or-v1-${REDACTED}`],
  [/\bsk-[A-Za-z0-9._-]{16,}/g, `sk-${REDACTED}`],
  [/\b([Bb]earer)\s+[A-Za-z0-9._-]{8,}/g, `$1 ${REDACTED}`],
]

const EXTENSION_SCHEMES = [
  "chrome-extension:",
  "moz-extension:",
  "safari-extension:",
  "safari-web-extension:",
]

/**
 * Breadcrumb categories worth keeping. Everything else is dropped rather than
 * filtered, because an unknown category is an unknown payload.
 */
const ALLOWED_BREADCRUMB_CATEGORIES = new Set([
  "navigation",
  "fetch",
  "xhr",
  "ui.click",
  "sentry.event",
  "sentry.transaction",
])

/** Breadcrumb `data` keys that carry no user input. */
const ALLOWED_BREADCRUMB_DATA_KEYS = new Set([
  "url",
  "method",
  "status_code",
  "from",
  "to",
])

export function redactSecrets(text: string): string {
  let result = text
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    result = result.replace(pattern, replacement)
  }
  return result
}

export function truncate(text: string, max: number = MAX_TEXT_LENGTH): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`
}

/** Redact, then truncate. Order matters: truncating first can split a key. */
function clean(text: string): string {
  return truncate(redactSecrets(text))
}

/**
 * Drop the query string and the fragment. A URL in this app can carry a model
 * id or a provider token, and neither is worth the risk.
 */
export function scrubUrl(url: string): string {
  const cut = url.search(/[?#]/)
  const trimmed = cut === -1 ? url : url.slice(0, cut)
  return redactSecrets(trimmed)
}

function isExtensionFrame(filename: string | undefined): boolean {
  if (!filename) return false
  return EXTENSION_SCHEMES.some((scheme) => filename.startsWith(scheme))
}

/**
 * Returns `null` to drop the breadcrumb.
 *
 * `console` is the single biggest leak vector here: the OpenRouter client logs
 * malformed stream frames, which are raw model output. Console breadcrumbs are
 * also off at the integration level — this is the second lock.
 */
export function scrubBreadcrumb<T extends Breadcrumb>(crumb: T): T | null {
  const category = crumb.category ?? ""
  if (!ALLOWED_BREADCRUMB_CATEGORIES.has(category)) return null

  if (typeof crumb.message === "string") {
    crumb.message = clean(crumb.message)
  }

  if (crumb.data) {
    for (const key of Object.keys(crumb.data)) {
      if (!ALLOWED_BREADCRUMB_DATA_KEYS.has(key)) {
        delete crumb.data[key]
        continue
      }
      const value = crumb.data[key]
      if (typeof value === "string") {
        crumb.data[key] = key === "url" ? scrubUrl(value) : redactSecrets(value)
      }
    }
  }

  return crumb
}

/**
 * The `beforeSend` and `beforeSendTransaction` body. The generic is what lets
 * one function serve both hooks without a cast: it instantiates as `ErrorEvent`
 * for the first and `TransactionEvent` for the second.
 *
 * Mutates in place and returns the same reference.
 */
export function scrubEvent<T extends SentryEvent>(event: T): T {
  // Anonymous mode. `dataCollection` should already prevent these, but a
  // future SDK default must not be able to turn them back on.
  delete event.user
  delete event.server_name
  delete event.extra

  if (event.contexts) {
    // Locale and timezone are fingerprinting surface.
    delete event.contexts.culture
  }

  if (event.request) {
    delete event.request.cookies
    delete event.request.headers
    delete event.request.data
    delete event.request.query_string
    delete event.request.env
    if (event.request.url) {
      event.request.url = scrubUrl(event.request.url)
    }
  }

  if (event.transaction) {
    event.transaction = scrubUrl(event.transaction)
  }

  if (event.message) {
    event.message = clean(event.message)
  }

  for (const exception of event.exception?.values ?? []) {
    if (exception.value) {
      exception.value = clean(exception.value)
    }
    const stacktrace = exception.stacktrace
    if (stacktrace?.frames) {
      for (const frame of stacktrace.frames) {
        // Local variables can hold the pasted trace or the API key.
        delete frame.vars
      }
      stacktrace.frames = stacktrace.frames.filter(
        (frame) => !isExtensionFrame(frame.filename ?? frame.abs_path)
      )
    }
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map((crumb) => scrubBreadcrumb(crumb))
      .filter((crumb) => crumb !== null)
  }

  for (const span of event.spans ?? []) {
    if (span.description) {
      span.description = scrubUrl(span.description)
    }
  }

  return event
}
