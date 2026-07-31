import type {
  OpenRouterChatMessage,
  OpenRouterLatencyPolicy,
  OpenRouterProviderPreferences,
  OpenRouterTextRequest,
  OpenRouterTextResponse,
  OpenRouterTextStream,
  OpenRouterTextStreamEvent,
  OpenRouterUsage,
} from "@/lib/simplify/types"
import { createDirectBrowserOpenRouterError } from "@/lib/openrouter/direct-browser-errors"

/** OpenRouter HTTP 402 / error.code 402: insufficient credits (see openrouter.ai/docs/errors). */
export class OpenRouterInsufficientCreditsError extends Error {
  override readonly name = "OpenRouterInsufficientCreditsError"

  constructor(message: string) {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class OpenRouterLatencyTimeoutError extends Error {
  override readonly name = "OpenRouterLatencyTimeoutError"

  constructor(message: string) {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/** HTTP 429. Carries the server's own backoff hint when it sends one. */
export class OpenRouterRateLimitError extends Error {
  override readonly name = "OpenRouterRateLimitError"
  readonly retryAfterMs: number | null

  constructor(message: string, retryAfterMs: number | null) {
    super(message)
    this.retryAfterMs = retryAfterMs
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/**
 * Whether retrying this failure could plausibly succeed. A bad key or a
 * malformed request fails identically every time, and retrying it just burns
 * the user's time across three analysis branches plus synthesis.
 */
export function isRetryableOpenRouterError(error: unknown): boolean {
  if (error instanceof OpenRouterInsufficientCreditsError) return false
  if (error instanceof OpenRouterTerminalRequestError) return false
  return true
}

/** A 4xx that will fail the same way no matter how often it is retried. */
export class OpenRouterTerminalRequestError extends Error {
  override readonly name = "OpenRouterTerminalRequestError"
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

const TERMINAL_HTTP_STATUSES = new Set([400, 401, 403, 404, 422])

/** Parses `Retry-After`, which is either delta-seconds or an HTTP date. */
function parseRetryAfterMs(headerValue: string | null): number | null {
  if (!headerValue) return null
  const trimmed = headerValue.trim()
  if (!trimmed) return null

  const seconds = Number(trimmed)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000)
  }

  const at = Date.parse(trimmed)
  if (Number.isNaN(at)) return null
  return Math.max(0, at - Date.now())
}

export type OpenRouterStreamTimeoutKind = "first_token" | "idle" | "total"

/** A streaming request that exceeded one of its watchdog budgets. */
export class OpenRouterStreamTimeoutError extends Error {
  override readonly name = "OpenRouterStreamTimeoutError"
  readonly kind: OpenRouterStreamTimeoutKind

  constructor(kind: OpenRouterStreamTimeoutKind, message: string) {
    super(message)
    this.kind = kind
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

const STREAM_TIMEOUT_MESSAGES: Record<OpenRouterStreamTimeoutKind, string> = {
  first_token: "OpenRouter did not send a first token in time.",
  idle: "OpenRouter stopped sending output mid-stream.",
  total: "OpenRouter request exceeded its time budget.",
}

function streamTimeoutError(
  kind: OpenRouterStreamTimeoutKind
): OpenRouterStreamTimeoutError {
  return new OpenRouterStreamTimeoutError(kind, STREAM_TIMEOUT_MESSAGES[kind])
}

export type OpenRouterStreamTimeouts = {
  firstTokenMs?: number
  idleMs?: number
  totalMs?: number
}

/**
 * Single-timer watchdog for one streaming request. `kick()` is called on every
 * delta and switches the budget from first-token to idle, so a slow start and a
 * mid-stream stall are distinguishable without extra flags.
 */
function createStreamWatchdog(params: {
  timeouts: OpenRouterStreamTimeouts | undefined
  onExpire: (kind: OpenRouterStreamTimeoutKind) => void
}): { kick: () => void; dispose: () => void } {
  const { firstTokenMs, idleMs, totalMs } = params.timeouts ?? {}
  let stageTimer: ReturnType<typeof setTimeout> | null = null
  let totalTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  const armStage = (
    ms: number | undefined,
    kind: OpenRouterStreamTimeoutKind
  ) => {
    if (stageTimer !== null) clearTimeout(stageTimer)
    stageTimer = null
    if (disposed || ms === undefined || !Number.isFinite(ms) || ms <= 0) return
    stageTimer = setTimeout(() => {
      if (!disposed) params.onExpire(kind)
    }, ms)
  }

  armStage(firstTokenMs, "first_token")
  if (totalMs !== undefined && Number.isFinite(totalMs) && totalMs > 0) {
    totalTimer = setTimeout(() => {
      if (!disposed) params.onExpire("total")
    }, totalMs)
  }

  return {
    kick: () => armStage(idleMs, "idle"),
    dispose: () => {
      disposed = true
      if (stageTimer !== null) clearTimeout(stageTimer)
      if (totalTimer !== null) clearTimeout(totalTimer)
      stageTimer = null
      totalTimer = null
    },
  }
}

const OPENROUTER_CHAT_COMPLETIONS_URL =
  "https://openrouter.ai/api/v1/chat/completions"

function nowMs(): number {
  if (typeof performance !== "undefined") return performance.now()
  return Date.now()
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError"
}

function cloneProviderPreferences(
  provider: OpenRouterProviderPreferences | undefined
): OpenRouterProviderPreferences | undefined {
  if (!provider) return undefined

  const cloneThresholds = (
    value: OpenRouterProviderPreferences["preferred_max_latency"]
  ) => (typeof value === "object" && value !== null ? { ...value } : value)

  return {
    ...provider,
    order: provider.order ? [...provider.order] : undefined,
    only: provider.only ? [...provider.only] : undefined,
    ignore: provider.ignore ? [...provider.ignore] : undefined,
    preferred_max_latency: cloneThresholds(provider.preferred_max_latency),
    preferred_min_throughput: cloneThresholds(
      provider.preferred_min_throughput
    ),
    sort:
      typeof provider.sort === "object" && provider.sort !== null
        ? { ...provider.sort }
        : provider.sort,
  }
}

function normalizeProviderSlugs(
  value: string[] | undefined
): string[] | undefined {
  if (!value?.length) return undefined

  const seen = new Set<string>()
  const normalized: string[] = []
  for (const slug of value) {
    const next = slug.trim().toLowerCase()
    if (!next || seen.has(next)) continue
    seen.add(next)
    normalized.push(next)
  }
  return normalized.length > 0 ? normalized : undefined
}

function normalizeProviderSort(
  sort: OpenRouterProviderPreferences["sort"]
): OpenRouterProviderPreferences["sort"] | null {
  if (!sort) return null
  return typeof sort === "object" ? { ...sort } : sort
}

function serializeProviderPreference(
  value:
    | OpenRouterProviderPreferences["preferred_max_latency"]
    | OpenRouterProviderPreferences["preferred_min_throughput"]
): string {
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value)
  }
  return String(value ?? "")
}

function providerRoutingIdentity(
  provider: OpenRouterProviderPreferences | undefined
): string {
  if (!provider) return ""

  return JSON.stringify({
    order: normalizeProviderSlugs(provider.order) ?? null,
    only: normalizeProviderSlugs(provider.only) ?? null,
    ignore: normalizeProviderSlugs(provider.ignore) ?? null,
    sort: normalizeProviderSort(provider.sort),
    allowFallbacks: provider.allow_fallbacks ?? null,
    requireParameters: provider.require_parameters ?? null,
    preferredMaxLatency: serializeProviderPreference(
      provider.preferred_max_latency
    ),
    preferredMinThroughput: serializeProviderPreference(
      provider.preferred_min_throughput
    ),
  })
}

function normalizeLatencyPolicy(
  policy: OpenRouterLatencyPolicy | undefined,
  primaryProvider: OpenRouterProviderPreferences | undefined
): OpenRouterLatencyPolicy | null {
  if (!policy) return null

  const hedgeAfterMs = Math.round(policy.hedgeAfterMs)
  if (!Number.isFinite(hedgeAfterMs) || hedgeAfterMs <= 0) return null

  const secondaryProvider = cloneProviderPreferences(policy.secondaryProvider)
  if (!secondaryProvider) return null
  if (
    providerRoutingIdentity(secondaryProvider) ===
    providerRoutingIdentity(primaryProvider)
  ) {
    return null
  }

  const cancelAfterMs =
    typeof policy.cancelAfterMs === "number" &&
    Number.isFinite(policy.cancelAfterMs)
      ? Math.max(Math.round(policy.cancelAfterMs), hedgeAfterMs + 1)
      : undefined

  return {
    hedgeAfterMs,
    cancelAfterMs,
    secondaryProvider,
  }
}

function buildMessages(
  request: OpenRouterTextRequest
): OpenRouterChatMessage[] {
  if (request.messages?.length) {
    return request.messages
  }

  if (!request.prompt) {
    throw new Error("OpenRouter request is missing prompt text.")
  }

  const messages: OpenRouterChatMessage[] = []
  if (request.systemPrompt) {
    messages.push({ role: "system", content: request.systemPrompt })
  }
  messages.push({ role: "user", content: request.prompt })
  return messages
}

function buildHeaders(apiKey: string): HeadersInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey.trim()}`,
    "Content-Type": "application/json",
  }

  if (typeof window !== "undefined") {
    headers["HTTP-Referer"] = window.location.origin
    headers["X-OpenRouter-Title"] = "error wolf"
  }

  return headers
}

function buildCompletionBody(
  request: OpenRouterTextRequest,
  stream: boolean
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.model,
    messages: buildMessages(request),
    temperature: request.temperature,
    stream,
  }

  if (stream) {
    body.stream_options = { include_usage: true }
  }
  if (typeof request.maxOutputTokens === "number") {
    body.max_tokens = request.maxOutputTokens
  }
  if (request.provider) {
    body.provider = request.provider
  }

  return body
}

function readContentText(value: unknown): string {
  if (typeof value === "string") return value
  if (!Array.isArray(value)) return ""

  return value
    .map((part) => {
      if (!part || typeof part !== "object") return ""
      const record = part as Record<string, unknown>
      if (typeof record.text === "string") return record.text
      if (typeof record.content === "string") return record.content
      return ""
    })
    .join("")
}

function extractCompletionText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return ""
  const record = payload as Record<string, unknown>
  const choices = Array.isArray(record.choices) ? record.choices : []
  const firstChoice =
    choices[0] && typeof choices[0] === "object"
      ? (choices[0] as Record<string, unknown>)
      : null
  if (!firstChoice) return ""

  const message =
    firstChoice.message && typeof firstChoice.message === "object"
      ? (firstChoice.message as Record<string, unknown>)
      : null

  return readContentText(message?.content)
}

function extractStreamDeltaText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return ""
  const record = payload as Record<string, unknown>
  const choices = Array.isArray(record.choices) ? record.choices : []
  const firstChoice =
    choices[0] && typeof choices[0] === "object"
      ? (choices[0] as Record<string, unknown>)
      : null
  if (!firstChoice) return ""

  const delta =
    firstChoice.delta && typeof firstChoice.delta === "object"
      ? (firstChoice.delta as Record<string, unknown>)
      : null
  if (!delta) return ""

  return readContentText(delta.content)
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null
  const record = payload as Record<string, unknown>
  const error =
    record.error && typeof record.error === "object"
      ? (record.error as Record<string, unknown>)
      : null
  if (typeof error?.message === "string" && error.message.trim()) {
    return error.message.trim()
  }
  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim()
  }
  return null
}

function extractErrorCode(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null
  const record = payload as Record<string, unknown>
  const error =
    record.error && typeof record.error === "object"
      ? (record.error as Record<string, unknown>)
      : null
  const code = error?.code
  if (typeof code === "number" && Number.isFinite(code)) return code
  return null
}

function readOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function extractUsage(payload: unknown): OpenRouterTextResponse["usage"] {
  if (!payload || typeof payload !== "object") return null
  const record = payload as Record<string, unknown>
  const usage =
    record.usage && typeof record.usage === "object"
      ? (record.usage as Record<string, unknown>)
      : null
  if (!usage) return null

  const promptTokens = readOptionalNumber(usage.prompt_tokens)
  const completionTokens = readOptionalNumber(usage.completion_tokens)
  const totalTokens = readOptionalNumber(usage.total_tokens)
  let reportedCostUsd = readOptionalNumber(usage.cost)

  if (reportedCostUsd === undefined && usage.cost_details) {
    const cd =
      typeof usage.cost_details === "object" && usage.cost_details !== null
        ? (usage.cost_details as Record<string, unknown>)
        : null
    if (cd) {
      const upstream = readOptionalNumber(cd.upstream_inference_cost)
      const promptPart = readOptionalNumber(cd.upstream_inference_prompt_cost)
      const completionPart = readOptionalNumber(
        cd.upstream_inference_completions_cost
      )
      if (upstream !== undefined) {
        reportedCostUsd = upstream
      } else if (promptPart !== undefined && completionPart !== undefined) {
        reportedCostUsd = promptPart + completionPart
      }
    }
  }

  if (
    promptTokens === undefined &&
    completionTokens === undefined &&
    totalTokens === undefined &&
    reportedCostUsd === undefined
  ) {
    return null
  }

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    reportedCostUsd,
  }
}

function requestDebugMeta(
  request: OpenRouterTextRequest,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  return {
    model: request.model,
    maxOutputTokens: request.maxOutputTokens ?? null,
    providerOrder: request.provider?.order ?? null,
    providerOnly: request.provider?.only ?? null,
    providerIgnore: request.provider?.ignore ?? null,
    allowFallbacks: request.provider?.allow_fallbacks ?? null,
    requireParameters: request.provider?.require_parameters ?? null,
    providerSort: request.provider?.sort ?? null,
    preferredMaxLatency: request.provider?.preferred_max_latency ?? null,
    preferredMinThroughput: request.provider?.preferred_min_throughput ?? null,
    ...extra,
  }
}

function roundDurationMs(value: number): number {
  return Math.max(0, Math.round(value))
}

function firstTokenDurationMs(
  startedAtMs: number,
  firstDeltaAtMs: number | null
): number | null {
  if (firstDeltaAtMs === null) return null
  return roundDurationMs(firstDeltaAtMs - startedAtMs)
}

async function parseOpenRouterFailure(response: Response): Promise<{
  message: string
  insufficientCredits: boolean
}> {
  const status = response.status
  try {
    const payload = (await response.json()) as unknown
    const message =
      extractErrorMessage(payload) ??
      `OpenRouter request failed with status ${status}.`
    const errorCode = extractErrorCode(payload)
    const insufficientCredits = status === 402 || errorCode === 402
    return { message, insufficientCredits }
  } catch {
    return {
      message: `OpenRouter request failed with status ${status}.`,
      insufficientCredits: status === 402,
    }
  }
}

/** Parses one SSE payload, returning `undefined` rather than throwing on junk. */
function safeParseJson(payload: string): unknown | undefined {
  try {
    return JSON.parse(payload) as unknown
  } catch {
    console.warn(
      "[openrouter] skipping malformed stream frame",
      payload.slice(0, 200)
    )
    return undefined
  }
}

function extractStreamMeta(
  payload: unknown
): Extract<OpenRouterTextStreamEvent, { type: "meta" }> | null {
  if (!payload || typeof payload !== "object") return null
  const record = payload as Record<string, unknown>
  const id = typeof record.id === "string" ? record.id : undefined
  const model = typeof record.model === "string" ? record.model : undefined
  const provider =
    typeof record.provider === "string" ? record.provider : undefined
  if (!id && !model && !provider) return null
  return { type: "meta", id, model, provider }
}

function* eventsForPayload(
  parsed: unknown,
  emitMeta: boolean
): Generator<OpenRouterTextStreamEvent> {
  if (emitMeta) {
    const meta = extractStreamMeta(parsed)
    if (meta) yield meta
  }

  // OpenRouter can report a failure mid-stream instead of as an HTTP status.
  const errorMessage = extractErrorMessage(parsed)
  if (errorMessage) {
    yield {
      type: "error",
      message: errorMessage,
      code: extractErrorCode(parsed),
    }
    return
  }

  const delta = extractStreamDeltaText(parsed)
  if (delta) yield { type: "delta", text: delta }
  const usage = extractUsage(parsed)
  if (usage) yield { type: "usage", usage }
}

async function* parseServerSentEvents(
  body: ReadableStream<Uint8Array>
): AsyncIterable<OpenRouterTextStreamEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let eventData: string[] = []
  let sawFirstPayload = false

  /** Yields one accumulated `data:` block, if it holds anything meaningful. */
  function* flushEvent(): Generator<OpenRouterTextStreamEvent> {
    const payload = eventData.join("\n").trim()
    eventData = []
    if (!payload || payload === "[DONE]") return
    const parsed = safeParseJson(payload)
    if (parsed === undefined) return
    const emitMeta = !sawFirstPayload
    sawFirstPayload = true
    yield* eventsForPayload(parsed, emitMeta)
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })

      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        if (!line) {
          yield* flushEvent()
          continue
        }

        if (line.startsWith("data:")) {
          eventData.push(line.slice(5).trimStart())
        }
      }

      if (done) {
        // A final frame may arrive with no terminating blank line.
        if (buffer.startsWith("data:")) {
          eventData.push(buffer.slice(5).trimStart())
        }
        buffer = ""
        yield* flushEvent()
        return
      }
    }
  } finally {
    // Releases the connection when a consumer exits the loop early, which the
    // hedged path does as soon as a losing leg is identified.
    try {
      reader.releaseLock()
      await body.cancel()
    } catch {
      // Already closed or errored; nothing to release.
    }
  }
}

async function fetchOpenRouterResponse(params: {
  request: OpenRouterTextRequest
  body: Record<string, unknown>
  signal?: AbortSignal
  mode: "completion" | "streaming"
}): Promise<Response> {
  const { request, body, signal, mode } = params
  const logPrefix =
    mode === "completion"
      ? "completion request failed"
      : "stream request failed"

  let response: Response
  try {
    response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: buildHeaders(request.apiKey),
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (isAbortError(error)) throw error
    console.error(`[openrouter] ${logPrefix}`, error, requestDebugMeta(request))
    throw createDirectBrowserOpenRouterError(mode)
  }

  if (!response.ok) {
    const { message, insufficientCredits } =
      await parseOpenRouterFailure(response)
    const requestError = insufficientCredits
      ? new OpenRouterInsufficientCreditsError(message)
      : response.status === 429
        ? new OpenRouterRateLimitError(
            message,
            parseRetryAfterMs(response.headers.get("retry-after"))
          )
        : TERMINAL_HTTP_STATUSES.has(response.status)
          ? new OpenRouterTerminalRequestError(message, response.status)
          : new Error(message)
    console.error(`[openrouter] ${logPrefix}`, requestError, {
      ...requestDebugMeta(request),
      status: response.status,
    })
    throw requestError
  }

  return response
}

async function fetchOpenRouterCompletionResponse(
  request: OpenRouterTextRequest,
  signal = request.signal
): Promise<{ response: Response; startedAtMs: number }> {
  const startedAtMs = nowMs()
  const response = await fetchOpenRouterResponse({
    request,
    body: buildCompletionBody(request, false),
    signal,
    mode: "completion",
  })
  return { response, startedAtMs }
}

async function fetchOpenRouterStreamResponse(
  request: OpenRouterTextRequest,
  signal = request.signal
): Promise<{ response: Response; startedAtMs: number }> {
  const startedAtMs = nowMs()
  const response = await fetchOpenRouterResponse({
    request,
    body: buildCompletionBody(request, true),
    signal,
    mode: "streaming",
  })

  if (!response.body) {
    const missingBodyError = new Error(
      "OpenRouter stream response did not include a readable body."
    )
    console.error(
      "[openrouter] stream response missing body",
      missingBodyError,
      requestDebugMeta(request)
    )
    throw missingBodyError
  }

  return { response, startedAtMs }
}

/**
 * OpenRouter returns `x-generation-id`, and its `access-control-expose-headers`
 * lists only `X-Generation-Id`, `X-Provider-Name`, and `cf-ray`. `x-request-id`
 * is neither sent nor readable cross-origin, so it is not consulted here — the
 * in-band `id` from the stream payload is the primary source.
 */
function streamRequestIdFromHeaders(response: Response): string | null {
  return response.headers.get("x-generation-id")
}

/** Maps an in-stream error frame to the same error types as an HTTP failure. */
function streamErrorToThrowable(
  event: Extract<OpenRouterTextStreamEvent, { type: "error" }>
): Error {
  if (event.code === 402) {
    return new OpenRouterInsufficientCreditsError(event.message)
  }
  return new Error(event.message)
}

function createLinkedAbortController(signal?: AbortSignal): {
  controller: AbortController
  detach: () => void
} {
  const controller = new AbortController()
  if (!signal) {
    return { controller, detach: () => {} }
  }

  if (signal.aborted) {
    controller.abort()
    return { controller, detach: () => {} }
  }

  const onAbort = () => controller.abort()
  signal.addEventListener("abort", onAbort, { once: true })
  return {
    controller,
    detach: () => signal.removeEventListener("abort", onAbort),
  }
}

export async function generateOpenRouterText(
  request: OpenRouterTextRequest
): Promise<OpenRouterTextResponse> {
  const { response, startedAtMs } =
    await fetchOpenRouterCompletionResponse(request)

  const payload = (await response.json()) as unknown
  const text = extractCompletionText(payload).trim()
  if (!text) {
    const emptyResponseError = new Error(
      "OpenRouter returned an empty response."
    )
    console.error(
      "[openrouter] completion returned empty response",
      emptyResponseError,
      requestDebugMeta(request)
    )
    throw emptyResponseError
  }

  return {
    text,
    durationMs: nowMs() - startedAtMs,
    raw: payload,
    requestId:
      typeof (payload as Record<string, unknown>).id === "string"
        ? ((payload as Record<string, unknown>).id as string)
        : null,
    modelId:
      typeof (payload as Record<string, unknown>).model === "string"
        ? ((payload as Record<string, unknown>).model as string)
        : request.model,
    usage: extractUsage(payload),
    resolvedProvider: cloneProviderPreferences(request.provider),
  }
}

export async function streamOpenRouterText(
  request: OpenRouterTextRequest,
  signal = request.signal
): Promise<OpenRouterTextStream> {
  const { response, startedAtMs } = await fetchOpenRouterStreamResponse(
    request,
    signal
  )

  return {
    stream: parseServerSentEvents(response.body!),
    response,
    startedAtMs,
  }
}

export type RunStreamingCompletionOptions = {
  onChunk?: (delta: string) => void
  latencyPolicy?: OpenRouterLatencyPolicy
  /** Watchdog budgets. Omit a field to leave that budget unbounded. */
  timeouts?: OpenRouterStreamTimeouts
  /**
   * First-token budget for the unhedged retry after both hedge legs time out.
   * A solo request has no racing partner, so it earns the longer budget.
   */
  soloFirstTokenMs?: number
}

type StreamingLegName = "primary" | "secondary"
type SecondaryLaunchReason =
  | "hedge_timer"
  | "primary_empty"
  | "primary_abort"
  | "primary_latency_timeout"
  | "primary_error"
  | "all_legs_failed"

type StreamingLeg = {
  name: StreamingLegName
  request: OpenRouterTextRequest
  resolvedProvider?: OpenRouterProviderPreferences
  controller: AbortController
  detachAbort: () => void
  cancelTimer: ReturnType<typeof setTimeout> | null
  cancelTriggered: boolean
  startedAtMs: number
  response: Response | null
  requestId: string | null
  modelId: string
  text: string
  usage: OpenRouterUsage | null
  sawDelta: boolean
  firstDeltaAtMs: number | null
  resolvedProviderName: string | null
  timeoutKind: OpenRouterStreamTimeoutKind | null
}

function createStreamingLeg(
  name: StreamingLegName,
  request: OpenRouterTextRequest
): StreamingLeg {
  const { controller, detach } = createLinkedAbortController(request.signal)
  return {
    name,
    request,
    resolvedProvider: cloneProviderPreferences(request.provider),
    controller,
    detachAbort: detach,
    cancelTimer: null,
    cancelTriggered: false,
    startedAtMs: 0,
    response: null,
    requestId: null,
    modelId: request.model,
    text: "",
    usage: null,
    sawDelta: false,
    firstDeltaAtMs: null,
    resolvedProviderName: null,
    timeoutKind: null,
  }
}

function clearStreamingLegTimer(leg: StreamingLeg): void {
  if (leg.cancelTimer !== null) {
    clearTimeout(leg.cancelTimer)
    leg.cancelTimer = null
  }
}

async function runSingleStreamingCompletion(
  request: OpenRouterTextRequest,
  options: RunStreamingCompletionOptions
): Promise<OpenRouterTextResponse> {
  const { controller, detach } = createLinkedAbortController(request.signal)
  let expiredKind: OpenRouterStreamTimeoutKind | null = null
  const watchdog = createStreamWatchdog({
    timeouts: options.timeouts,
    onExpire: (kind) => {
      expiredKind = kind
      controller.abort(streamTimeoutError(kind))
    },
  })

  let text = ""
  let usage: OpenRouterUsage | null = null
  let firstDeltaAtMs: number | null = null
  let modelId = request.model
  let resolvedProviderName: string | null = null
  let requestId: string | null = null
  let startedAtMs = nowMs()

  try {
    const opened = await streamOpenRouterText(request, controller.signal)
    startedAtMs = opened.startedAtMs
    requestId = streamRequestIdFromHeaders(opened.response)

    for await (const event of opened.stream) {
      if (event.type === "meta") {
        requestId = event.id ?? requestId
        modelId = event.model ?? modelId
        resolvedProviderName = event.provider ?? resolvedProviderName
      } else if (event.type === "error") {
        throw streamErrorToThrowable(event)
      } else if (event.type === "delta") {
        watchdog.kick()
        if (firstDeltaAtMs === null) {
          firstDeltaAtMs = nowMs()
          console.info(
            "[openrouter] stream first token",
            requestDebugMeta(request, {
              requestId,
              firstTokenMs: firstTokenDurationMs(startedAtMs, firstDeltaAtMs),
            })
          )
        }
        text += event.text
        options.onChunk?.(event.text)
      } else if (event.type === "usage") {
        usage = event.usage
      }
    }
  } catch (error) {
    // A watchdog expiry aborts the fetch, so the surfaced error would otherwise
    // be an opaque AbortError. Report the budget that was actually blown.
    if (expiredKind !== null) {
      const timeoutError = streamTimeoutError(expiredKind)
      console.error(
        "[openrouter] stream watchdog expired",
        timeoutError,
        requestDebugMeta(request, { requestId, kind: expiredKind })
      )
      throw timeoutError
    }
    if (isAbortError(error)) throw error
    console.error(
      "[openrouter] stream read failed",
      error,
      requestDebugMeta(request)
    )
    throw error
  } finally {
    watchdog.dispose()
    detach()
  }

  const trimmed = text.trim()
  if (!trimmed) {
    const emptyResponseError = new Error(
      "OpenRouter returned an empty response."
    )
    console.error(
      "[openrouter] stream returned empty response",
      emptyResponseError,
      requestDebugMeta(request)
    )
    throw emptyResponseError
  }

  console.info(
    "[openrouter] stream completed",
    requestDebugMeta(request, {
      requestId,
      durationMs: roundDurationMs(nowMs() - startedAtMs),
      firstTokenMs: firstTokenDurationMs(startedAtMs, firstDeltaAtMs),
    })
  )
  return {
    text: trimmed,
    durationMs: nowMs() - startedAtMs,
    raw: null,
    requestId,
    modelId,
    usage,
    resolvedProvider: cloneProviderPreferences(request.provider),
    resolvedProviderName,
  }
}

async function runHedgedStreamingCompletion(
  request: OpenRouterTextRequest,
  options: RunStreamingCompletionOptions,
  latencyPolicy: OpenRouterLatencyPolicy
): Promise<OpenRouterTextResponse> {
  const primary = createStreamingLeg("primary", request)
  const secondary = createStreamingLeg("secondary", {
    ...request,
    provider: cloneProviderPreferences(latencyPolicy.secondaryProvider),
  })

  let winner: StreamingLeg | null = null
  let settled = false
  let activeLegs = 0
  let secondaryStarted = false
  let secondaryLaunchTimer: ReturnType<typeof setTimeout> | null = null
  let bestError: Error | null = null
  let secondaryStartReason: SecondaryLaunchReason | null = null

  const emptyResponseError = () =>
    new Error("OpenRouter returned an empty response.")
  const latencyTimeoutError = () =>
    new OpenRouterLatencyTimeoutError(
      "OpenRouter request exceeded latency policy before first token."
    )

  return new Promise<OpenRouterTextResponse>((resolve, reject) => {
    const cleanup = (abortInFlight: boolean) => {
      if (secondaryLaunchTimer !== null) {
        clearTimeout(secondaryLaunchTimer)
        secondaryLaunchTimer = null
      }
      clearStreamingLegTimer(primary)
      clearStreamingLegTimer(secondary)
      primary.detachAbort()
      secondary.detachAbort()
      if (abortInFlight) {
        primary.controller.abort()
        secondary.controller.abort()
      }
    }

    const settleSuccess = (result: OpenRouterTextResponse) => {
      if (settled) return
      settled = true
      cleanup(false)
      resolve(result)
    }

    const settleFailure = (error: unknown) => {
      if (settled) return
      settled = true
      cleanup(true)
      reject(
        error instanceof Error ? error : new Error("Unknown request failure.")
      )
    }

    const rememberFailure = (error: unknown) => {
      if (settled) return
      if (error instanceof OpenRouterInsufficientCreditsError) {
        settleFailure(error)
        return
      }
      bestError =
        error instanceof Error ? error : new Error("Unknown request failure.")
    }

    const maybeStartSecondary = (reason: SecondaryLaunchReason) => {
      if (settled || winner || secondaryStarted) return
      secondaryStarted = true
      secondaryStartReason = reason
      if (secondaryLaunchTimer !== null) {
        clearTimeout(secondaryLaunchTimer)
        secondaryLaunchTimer = null
      }
      console.info(
        "[openrouter] starting hedged fallback leg",
        requestDebugMeta(secondary.request, {
          reason,
          primaryProviderOrder: primary.request.provider?.order ?? null,
          primaryProviderOnly: primary.request.provider?.only ?? null,
          primaryRunningMs:
            primary.startedAtMs > 0
              ? roundDurationMs(nowMs() - primary.startedAtMs)
              : null,
          hedgeAfterMs: latencyPolicy.hedgeAfterMs,
          cancelAfterMs: latencyPolicy.cancelAfterMs ?? null,
        })
      )
      void runLeg(secondary)
    }

    const chooseWinner = (leg: StreamingLeg) => {
      if (winner || settled) return
      winner = leg
      if (secondaryLaunchTimer !== null) {
        clearTimeout(secondaryLaunchTimer)
        secondaryLaunchTimer = null
      }
      if (leg !== primary) primary.controller.abort()
      if (leg !== secondary) secondary.controller.abort()
    }

    const finishWinner = (leg: StreamingLeg) => {
      const trimmed = leg.text.trim()
      if (!trimmed) {
        const error = emptyResponseError()
        console.error(
          "[openrouter] stream returned empty response",
          error,
          requestDebugMeta(leg.request, { leg: leg.name })
        )
        settleFailure(error)
        return
      }

      console.info(
        "[openrouter] hedged stream completed",
        requestDebugMeta(leg.request, {
          leg: leg.name,
          winner: leg.name,
          requestId: leg.requestId,
          durationMs: roundDurationMs(nowMs() - leg.startedAtMs),
          firstTokenMs: firstTokenDurationMs(
            leg.startedAtMs,
            leg.firstDeltaAtMs
          ),
          secondaryStarted,
          secondaryStartReason,
          primaryRequestId: primary.requestId,
          secondaryRequestId: secondary.requestId,
        })
      )

      settleSuccess({
        text: trimmed,
        durationMs: nowMs() - leg.startedAtMs,
        raw: null,
        requestId: leg.requestId,
        modelId: leg.modelId,
        usage: leg.usage,
        resolvedProvider: cloneProviderPreferences(leg.resolvedProvider),
        resolvedProviderName: leg.resolvedProviderName,
      })
    }

    /**
     * Settles the outer promise once the last in-flight leg is done. Called from
     * `runLeg`'s `finally` so no exit path — including an early `return` from the
     * abort branches — can leave the promise pending forever.
     */
    const drainIfLastLeg = () => {
      if (settled || winner || activeLegs > 0) return
      if (!secondaryStarted) {
        maybeStartSecondary("all_legs_failed")
        return
      }
      settleFailure(bestError ?? emptyResponseError())
    }

    const runLeg = async (leg: StreamingLeg) => {
      activeLegs += 1
      leg.startedAtMs = nowMs()

      if (latencyPolicy.cancelAfterMs !== undefined) {
        leg.cancelTimer = setTimeout(() => {
          if (settled || winner === leg || leg.sawDelta) return
          leg.cancelTriggered = true
          leg.controller.abort()
        }, latencyPolicy.cancelAfterMs)
      }

      const watchdog = createStreamWatchdog({
        timeouts: options.timeouts,
        onExpire: (kind) => {
          if (settled) return
          leg.timeoutKind = kind
          leg.controller.abort(streamTimeoutError(kind))
        },
      })

      try {
        const { response, startedAtMs } = await fetchOpenRouterStreamResponse(
          leg.request,
          leg.controller.signal
        )
        leg.startedAtMs = startedAtMs
        leg.response = response
        leg.requestId = streamRequestIdFromHeaders(response)

        for await (const event of parseServerSentEvents(response.body!)) {
          if (event.type === "usage") {
            leg.usage = event.usage
            continue
          }

          if (event.type === "meta") {
            leg.requestId = event.id ?? leg.requestId
            leg.modelId = event.model ?? leg.modelId
            leg.resolvedProviderName =
              event.provider ?? leg.resolvedProviderName
            continue
          }

          if (event.type === "error") {
            throw streamErrorToThrowable(event)
          }

          watchdog.kick()
          if (!leg.sawDelta) {
            leg.sawDelta = true
            leg.firstDeltaAtMs = nowMs()
            clearStreamingLegTimer(leg)
            chooseWinner(leg)
            console.info(
              "[openrouter] stream first token",
              requestDebugMeta(leg.request, {
                leg: leg.name,
                requestId: leg.requestId,
                firstTokenMs: firstTokenDurationMs(
                  leg.startedAtMs,
                  leg.firstDeltaAtMs
                ),
                secondaryStarted,
                secondaryStartReason,
                hedgeAfterMs: latencyPolicy.hedgeAfterMs,
                cancelAfterMs: latencyPolicy.cancelAfterMs ?? null,
              })
            )
          }
          if (winner !== leg) continue

          leg.text += event.text
          options.onChunk?.(event.text)
        }

        if (winner === leg) {
          finishWinner(leg)
          return
        }

        if (!winner && leg === primary) {
          maybeStartSecondary("primary_empty")
        }
        if (!winner) {
          rememberFailure(emptyResponseError())
        }
      } catch (error) {
        // The run-level signal outranks any per-leg watchdog: a user cancel or a
        // run deadline must surface as itself, not as a stream timeout.
        if (request.signal?.aborted) {
          settleFailure(
            isAbortError(error) || leg.timeoutKind !== null
              ? (request.signal.reason ?? error)
              : error
          )
          return
        }

        if (leg.timeoutKind !== null) {
          const timeoutError = streamTimeoutError(leg.timeoutKind)
          console.error(
            "[openrouter] stream watchdog expired",
            timeoutError,
            requestDebugMeta(leg.request, {
              leg: leg.name,
              kind: leg.timeoutKind,
              secondaryStarted,
              secondaryStartReason,
            })
          )
          if (winner === leg) {
            settleFailure(timeoutError)
            return
          }
          if (leg === primary) {
            maybeStartSecondary("primary_latency_timeout")
          }
          rememberFailure(timeoutError)
          return
        }

        if (isAbortError(error)) {
          if (winner && winner !== leg) {
            return
          }
          if (winner === leg) {
            settleFailure(
              leg.cancelTriggered
                ? latencyTimeoutError()
                : new Error("OpenRouter streaming request was aborted.")
            )
            return
          }

          if (leg.cancelTriggered) {
            const timeoutError = latencyTimeoutError()
            console.error(
              "[openrouter] stream request exceeded latency policy",
              timeoutError,
              requestDebugMeta(leg.request, {
                leg: leg.name,
                firstTokenMs: firstTokenDurationMs(
                  leg.startedAtMs,
                  leg.firstDeltaAtMs
                ),
                secondaryStarted,
                secondaryStartReason,
                hedgeAfterMs: latencyPolicy.hedgeAfterMs,
                cancelAfterMs: latencyPolicy.cancelAfterMs ?? null,
              })
            )
            if (leg === primary) {
              maybeStartSecondary("primary_latency_timeout")
            }
            rememberFailure(timeoutError)
            return
          }

          if (leg === primary) {
            maybeStartSecondary("primary_abort")
          }
          rememberFailure(
            new Error("OpenRouter streaming request was aborted.")
          )
          return
        }

        console.error(
          "[openrouter] stream read failed",
          error,
          requestDebugMeta(leg.request, {
            leg: leg.name,
            firstTokenMs: firstTokenDurationMs(
              leg.startedAtMs,
              leg.firstDeltaAtMs
            ),
            secondaryStarted,
            secondaryStartReason,
          })
        )
        if (winner === leg) {
          settleFailure(error)
          return
        }
        if (!winner && leg === primary) {
          maybeStartSecondary("primary_error")
        }
        rememberFailure(error)
      } finally {
        watchdog.dispose()
        clearStreamingLegTimer(leg)
        leg.detachAbort()
        activeLegs -= 1
        drainIfLastLeg()
      }
    }

    secondaryLaunchTimer = setTimeout(() => {
      if (!winner) maybeStartSecondary("hedge_timer")
    }, latencyPolicy.hedgeAfterMs)

    void runLeg(primary)
  })
}

/**
 * Drives `streamOpenRouterText` to completion while surfacing incremental
 * deltas via `onChunk`. Returns the same shape as `generateOpenRouterText`
 * so call sites can swap implementations without other changes.
 */
export async function runStreamingCompletion(
  request: OpenRouterTextRequest,
  options: RunStreamingCompletionOptions = {}
): Promise<OpenRouterTextResponse> {
  const latencyPolicy = normalizeLatencyPolicy(
    options.latencyPolicy,
    request.provider
  )
  if (!latencyPolicy) {
    return runSingleStreamingCompletion(request, options)
  }

  try {
    return await runHedgedStreamingCompletion(request, options, latencyPolicy)
  } catch (error) {
    // Both hedge legs ran out of patience. One unhedged retry gets the longer
    // solo budget. A run-level abort — user cancel or run deadline — never retries.
    const retryable =
      error instanceof OpenRouterLatencyTimeoutError ||
      (error instanceof OpenRouterStreamTimeoutError &&
        error.kind === "first_token")
    if (!retryable || request.signal?.aborted) {
      throw error
    }

    console.warn(
      "[openrouter] retrying stream without latency policy after timeout",
      requestDebugMeta(request, {
        hedgeAfterMs: latencyPolicy.hedgeAfterMs,
        cancelAfterMs: latencyPolicy.cancelAfterMs ?? null,
      })
    )
    return runSingleStreamingCompletion(request, {
      ...options,
      timeouts: {
        ...options.timeouts,
        firstTokenMs:
          options.soloFirstTokenMs ?? options.timeouts?.firstTokenMs,
      },
    })
  }
}
