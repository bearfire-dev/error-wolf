import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type {
  OpenRouterLatencyPolicy,
  OpenRouterProviderPreferences,
  OpenRouterTextRequest,
} from "@/lib/simplify/types"

import {
  OpenRouterInsufficientCreditsError,
  runStreamingCompletion,
} from "./openrouter-client"

type TimedChunk = {
  atMs: number
  text: string
}

type FetchStep = {
  response?: Response | ((signal?: AbortSignal) => Response)
  error?: unknown
  waitForAbort?: boolean
}

const encoder = new TextEncoder()

function createAbortError(): Error {
  const error = new Error("Request aborted.")
  error.name = "AbortError"
  return error
}

function sseEvent(payload: unknown | "[DONE]"): string {
  return `data: ${
    payload === "[DONE]" ? "[DONE]" : JSON.stringify(payload)
  }\n\n`
}

function deltaEvent(text: string): string {
  return sseEvent({
    choices: [{ delta: { content: text } }],
  })
}

function usageEvent(usage: Record<string, unknown>): string {
  return sseEvent({ usage })
}

function createStreamingResponse(params: {
  requestId: string
  chunks?: TimedChunk[]
  status?: number
  headers?: HeadersInit
  signal?: AbortSignal
}): Response {
  const chunks = params.chunks ?? []
  const signal = params.signal
  let closed = false
  const finalAtMs = chunks.reduce((max, chunk) => Math.max(max, chunk.atMs), 0)

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const onAbort = () => {
        if (closed) return
        closed = true
        controller.error(createAbortError())
      }

      if (signal) {
        if (signal.aborted) {
          onAbort()
          return
        }
        signal.addEventListener("abort", onAbort, { once: true })
      }

      if (chunks.length === 0) {
        setTimeout(() => {
          if (closed) return
          closed = true
          controller.close()
        }, 0)
        return
      }

      for (const chunk of chunks) {
        setTimeout(() => {
          if (closed) return
          controller.enqueue(encoder.encode(chunk.text))
        }, chunk.atMs)
      }

      setTimeout(() => {
        if (closed) return
        closed = true
        controller.close()
      }, finalAtMs + 1)
    },
    cancel() {
      closed = true
    },
  })

  return new Response(stream, {
    status: params.status ?? 200,
    headers: {
      "x-request-id": params.requestId,
      ...params.headers,
    },
  })
}

function createJsonResponse(
  status: number,
  body: unknown,
  headers?: HeadersInit
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  })
}

function mockFetchSequence(...steps: FetchStep[]) {
  const pending = [...steps]
  const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const next = pending.shift()
    if (!next) {
      throw new Error("Unexpected fetch call.")
    }

    if (next.waitForAbort) {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined
        if (signal?.aborted) {
          reject(createAbortError())
          return
        }
        signal?.addEventListener("abort", () => reject(createAbortError()), {
          once: true,
        })
      })
    }

    if (next.error !== undefined) {
      return Promise.reject(next.error)
    }
    if (!next.response) {
      throw new Error("Fetch step is missing a response.")
    }
    return Promise.resolve(
      typeof next.response === "function"
        ? next.response(init?.signal as AbortSignal | undefined)
        : next.response
    )
  })

  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function createRequest(
  overrides: Partial<OpenRouterTextRequest> = {}
): OpenRouterTextRequest {
  return {
    apiKey: "test-key",
    model: "openai/gpt-oss-120b",
    prompt: "Summarize this stack trace",
    ...overrides,
  }
}

function createProvider(slug: string): OpenRouterProviderPreferences {
  return {
    only: [slug],
    allow_fallbacks: true,
  }
}

function createLatencyPolicy(
  overrides: Partial<OpenRouterLatencyPolicy> = {}
): OpenRouterLatencyPolicy {
  return {
    hedgeAfterMs: 50,
    cancelAfterMs: 90,
    secondaryProvider: createProvider("secondary"),
    ...overrides,
  }
}

describe("runStreamingCompletion", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, "info").mockImplementation(() => {})
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("streams a single response successfully and captures usage", async () => {
    const chunkedDelta = deltaEvent("hello")
    const fetchMock = mockFetchSequence({
      response: createStreamingResponse({
        requestId: "req-single",
        chunks: [
          { atMs: 0, text: chunkedDelta.slice(0, 18) },
          { atMs: 5, text: chunkedDelta.slice(18) },
          {
            atMs: 10,
            text:
              deltaEvent(" world") +
              usageEvent({
                prompt_tokens: 11,
                completion_tokens: 7,
                total_tokens: 18,
              }),
          },
        ],
      }),
    })

    const promise = runStreamingCompletion(createRequest())

    await vi.advanceTimersByTimeAsync(25)
    const result = await promise

    expect(result.text).toBe("hello world")
    expect(result.requestId).toBe("req-single")
    expect(result.usage).toEqual({
      promptTokens: 11,
      completionTokens: 7,
      totalTokens: 18,
      reportedCostUsd: undefined,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("lets the secondary hedged leg win when it produces the first token first", async () => {
    const fetchMock = mockFetchSequence(
      {
        response: createStreamingResponse({
          requestId: "req-primary",
          chunks: [{ atMs: 120, text: deltaEvent("primary") }],
        }),
      },
      {
        response: createStreamingResponse({
          requestId: "req-secondary",
          chunks: [{ atMs: 10, text: deltaEvent("secondary") }],
        }),
      }
    )

    const chunks: string[] = []
    const promise = runStreamingCompletion(
      createRequest({ provider: createProvider("primary") }),
      {
        latencyPolicy: createLatencyPolicy({
          cancelAfterMs: undefined,
        }),
        onChunk: (delta) => chunks.push(delta),
      }
    )

    await vi.advanceTimersByTimeAsync(200)
    const result = await promise

    expect(result.text).toBe("secondary")
    expect(result.requestId).toBe("req-secondary")
    expect(chunks).toEqual(["secondary"])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("retries once without latency policy after a hedged first-token timeout", async () => {
    const fetchMock = mockFetchSequence(
      {
        waitForAbort: true,
      },
      {
        waitForAbort: true,
      },
      {
        response: createStreamingResponse({
          requestId: "req-recovered",
          chunks: [{ atMs: 20, text: deltaEvent("recovered") }],
        }),
      }
    )

    const promise = runStreamingCompletion(
      createRequest({ provider: createProvider("primary") }),
      {
        latencyPolicy: createLatencyPolicy(),
      }
    )

    await vi.advanceTimersByTimeAsync(200)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(50)
    const result = await promise

    expect(result.text).toBe("recovered")
    expect(result.requestId).toBe("req-recovered")
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("fails when the stream completes without any text deltas", async () => {
    mockFetchSequence({
      response: createStreamingResponse({
        requestId: "req-empty",
        chunks: [],
      }),
    })

    const promise = runStreamingCompletion(createRequest())
    const assertion = expect(promise).rejects.toThrow(
      "OpenRouter returned an empty response."
    )

    await vi.advanceTimersByTimeAsync(5)
    await assertion
  })

  it("surfaces user aborts without retrying", async () => {
    const controller = new AbortController()
    const fetchMock = mockFetchSequence({
      waitForAbort: true,
    })

    const promise = runStreamingCompletion(
      createRequest({
        signal: controller.signal,
        provider: createProvider("primary"),
      }),
      {
        latencyPolicy: createLatencyPolicy(),
      }
    )
    const assertion = expect(promise).rejects.toMatchObject({
      name: "AbortError",
    })

    controller.abort()

    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("maps HTTP 402 responses to OpenRouterInsufficientCreditsError", async () => {
    mockFetchSequence({
      response: createJsonResponse(402, {
        error: { message: "insufficient credits", code: 402 },
      }),
    })

    await expect(
      runStreamingCompletion(createRequest())
    ).rejects.toBeInstanceOf(OpenRouterInsufficientCreditsError)
  })

  it("starts the secondary leg immediately when the primary request errors", async () => {
    const fetchMock = mockFetchSequence(
      {
        error: new TypeError("network down"),
      },
      {
        response: createStreamingResponse({
          requestId: "req-secondary-recovery",
          chunks: [{ atMs: 10, text: deltaEvent("secondary recovery") }],
        }),
      }
    )

    const promise = runStreamingCompletion(
      createRequest({ provider: createProvider("primary") }),
      {
        latencyPolicy: createLatencyPolicy({
          cancelAfterMs: undefined,
        }),
      }
    )

    await vi.advanceTimersByTimeAsync(30)
    const result = await promise

    expect(result.text).toBe("secondary recovery")
    expect(result.requestId).toBe("req-secondary-recovery")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("never mixes output from the losing leg after a winner has been chosen", async () => {
    mockFetchSequence(
      {
        response: createStreamingResponse({
          requestId: "req-primary-winner",
          chunks: [
            { atMs: 30, text: deltaEvent("winner") },
            {
              atMs: 31,
              text: usageEvent({
                prompt_tokens: 5,
                completion_tokens: 1,
                total_tokens: 6,
              }),
            },
          ],
        }),
      },
      {
        response: createStreamingResponse({
          requestId: "req-secondary-loser",
          chunks: [
            { atMs: 40, text: deltaEvent("loser") },
            { atMs: 45, text: deltaEvent(" ignored") },
          ],
        }),
      }
    )

    const chunks: string[] = []
    const promise = runStreamingCompletion(
      createRequest({ provider: createProvider("primary") }),
      {
        latencyPolicy: createLatencyPolicy({
          hedgeAfterMs: 20,
          cancelAfterMs: undefined,
        }),
        onChunk: (delta) => chunks.push(delta),
      }
    )

    await vi.advanceTimersByTimeAsync(100)
    const result = await promise

    expect(result.text).toBe("winner")
    expect(chunks).toEqual(["winner"])
  })
})
