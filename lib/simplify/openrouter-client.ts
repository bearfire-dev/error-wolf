import type {
  OpenRouterChatMessage,
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

const OPENROUTER_CHAT_COMPLETIONS_URL =
  "https://openrouter.ai/api/v1/chat/completions"

function nowMs(): number {
  if (typeof performance !== "undefined") return performance.now()
  return Date.now()
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
  request: OpenRouterTextRequest
): Record<string, unknown> {
  return {
    model: request.model,
    maxOutputTokens: request.maxOutputTokens ?? null,
    providerOrder: request.provider?.order ?? null,
    allowFallbacks: request.provider?.allow_fallbacks ?? null,
  }
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

function* eventsForPayload(
  parsed: unknown
): Generator<OpenRouterTextStreamEvent> {
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

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })

    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      if (!line) {
        const payload = eventData.join("\n").trim()
        eventData = []
        if (!payload || payload === "[DONE]") continue
        const parsed = JSON.parse(payload) as unknown
        for (const event of eventsForPayload(parsed)) yield event
        continue
      }

      if (line.startsWith("data:")) {
        eventData.push(line.slice(5).trimStart())
      }
    }

    if (done) {
      const payload = eventData.join("\n").trim()
      if (payload && payload !== "[DONE]") {
        const parsed = JSON.parse(payload) as unknown
        for (const event of eventsForPayload(parsed)) yield event
      }
      return
    }
  }
}

export async function generateOpenRouterText(
  request: OpenRouterTextRequest
): Promise<OpenRouterTextResponse> {
  const startedAtMs = nowMs()
  const body: Record<string, unknown> = {
    model: request.model,
    messages: buildMessages(request),
    temperature: request.temperature,
    stream: false,
  }
  if (typeof request.maxOutputTokens === "number") {
    body.max_tokens = request.maxOutputTokens
  }
  if (request.provider) {
    body.provider = request.provider
  }

  let response: Response
  try {
    response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: buildHeaders(request.apiKey),
      body: JSON.stringify(body),
      signal: request.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error
    console.error(
      "[openrouter] completion request failed",
      error,
      requestDebugMeta(request)
    )
    throw createDirectBrowserOpenRouterError("completion")
  }

  if (!response.ok) {
    const { message, insufficientCredits } =
      await parseOpenRouterFailure(response)
    const requestError = insufficientCredits
      ? new OpenRouterInsufficientCreditsError(message)
      : new Error(message)
    console.error("[openrouter] completion request failed", requestError, {
      ...requestDebugMeta(request),
      status: response.status,
    })
    throw requestError
  }

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
  }
}

export async function streamOpenRouterText(
  request: OpenRouterTextRequest
): Promise<OpenRouterTextStream> {
  const startedAtMs = nowMs()
  const streamBody: Record<string, unknown> = {
    model: request.model,
    messages: buildMessages(request),
    temperature: request.temperature,
    stream: true,
    stream_options: { include_usage: true },
  }
  if (typeof request.maxOutputTokens === "number") {
    streamBody.max_tokens = request.maxOutputTokens
  }
  if (request.provider) {
    streamBody.provider = request.provider
  }

  let response: Response
  try {
    response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: buildHeaders(request.apiKey),
      body: JSON.stringify(streamBody),
      signal: request.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error
    console.error(
      "[openrouter] stream request failed",
      error,
      requestDebugMeta(request)
    )
    throw createDirectBrowserOpenRouterError("streaming")
  }

  if (!response.ok) {
    const { message, insufficientCredits } =
      await parseOpenRouterFailure(response)
    const requestError = insufficientCredits
      ? new OpenRouterInsufficientCreditsError(message)
      : new Error(message)
    console.error("[openrouter] stream request failed", requestError, {
      ...requestDebugMeta(request),
      status: response.status,
    })
    throw requestError
  }

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

  return {
    stream: parseServerSentEvents(response.body),
    response,
    startedAtMs,
  }
}

export type RunStreamingCompletionOptions = {
  onChunk?: (delta: string) => void
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
  const { stream, response, startedAtMs } = await streamOpenRouterText(request)

  let text = ""
  let usage: OpenRouterUsage | null = null
  try {
    for await (const event of stream) {
      if (event.type === "delta") {
        text += event.text
        options.onChunk?.(event.text)
      } else if (event.type === "usage") {
        usage = event.usage
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error
    console.error(
      "[openrouter] stream read failed",
      error,
      requestDebugMeta(request)
    )
    throw error
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

  const requestId = response.headers.get("x-request-id")
  return {
    text: trimmed,
    durationMs: nowMs() - startedAtMs,
    raw: null,
    requestId,
    modelId: request.model,
    usage,
  }
}
