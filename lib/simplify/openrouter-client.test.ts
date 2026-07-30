import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type {
  OpenRouterLatencyPolicy,
  OpenRouterProviderPreferences,
  OpenRouterTextRequest,
} from "@/lib/simplify/types"

import {
  OpenRouterInsufficientCreditsError,
  OpenRouterRateLimitError,
  OpenRouterStreamTimeoutError,
  OpenRouterTerminalRequestError,
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
  model?: string
  providerName?: string
  /** Omit the leading in-band identity frame, as a bare provider might. */
  omitMeta?: boolean
}): Response {
  const chunks = params.chunks ?? []
  const signal = params.signal
  let closed = false
  const finalAtMs = chunks.reduce((max, chunk) => Math.max(max, chunk.atMs), 0)

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Production OpenRouter carries `id`/`model`/`provider` in-band on every
      // chunk. `x-request-id` is never sent and would not be readable
      // cross-origin, so identity must come from the payload.
      if (!params.omitMeta) {
        controller.enqueue(
          encoder.encode(
            sseEvent({
              id: params.requestId,
              model: params.model ?? "openai/gpt-oss-120b",
              provider: params.providerName ?? "Cerebras",
            })
          )
        )
      }

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

  it("settles instead of hanging when every hedged leg is cancelled", async () => {
    // Regression: the abort branches used to `return` past the tail block that
    // settles the outer promise, so the last leg to finish left it pending
    // forever and the UI sat on "03 COMP" until a reload.
    mockFetchSequence({ waitForAbort: true }, { waitForAbort: true })

    const promise = runStreamingCompletion(
      createRequest({ provider: createProvider("primary") }),
      {
        latencyPolicy: createLatencyPolicy({
          hedgeAfterMs: 50,
          cancelAfterMs: 90,
        }),
      }
    )
    const settled = promise.then(
      () => "resolved" as const,
      () => "rejected" as const
    )

    await vi.advanceTimersByTimeAsync(500)
    await expect(settled).resolves.toBe("rejected")
  })

  it("surfaces a mid-stream error frame instead of reporting an empty response", async () => {
    mockFetchSequence({
      response: createStreamingResponse({
        requestId: "req-mid-error",
        chunks: [
          {
            atMs: 10,
            text: sseEvent({
              error: { message: "provider exploded", code: 500 },
            }),
          },
        ],
      }),
    })

    const promise = runStreamingCompletion(createRequest())
    const assertion = expect(promise).rejects.toThrow("provider exploded")
    await vi.advanceTimersByTimeAsync(100)
    await assertion
  })

  it("maps a mid-stream 402 frame to the insufficient-credits error", async () => {
    mockFetchSequence({
      response: createStreamingResponse({
        requestId: "req-mid-402",
        chunks: [
          {
            atMs: 10,
            text: sseEvent({
              error: { message: "out of credits", code: 402 },
            }),
          },
        ],
      }),
    })

    const promise = runStreamingCompletion(createRequest())
    const assertion = expect(promise).rejects.toBeInstanceOf(
      OpenRouterInsufficientCreditsError
    )
    await vi.advanceTimersByTimeAsync(100)
    await assertion
  })

  it("skips a malformed frame and still completes the stream", async () => {
    mockFetchSequence({
      response: createStreamingResponse({
        requestId: "req-malformed",
        chunks: [
          { atMs: 5, text: deltaEvent("before ") },
          { atMs: 10, text: "data: <html>not json</html>\n\n" },
          { atMs: 15, text: deltaEvent("after") },
        ],
      }),
    })

    const promise = runStreamingCompletion(createRequest())
    await vi.advanceTimersByTimeAsync(100)
    const result = await promise

    expect(result.text).toBe("before after")
  })

  it("flushes a trailing frame that has no terminating blank line", async () => {
    mockFetchSequence({
      response: createStreamingResponse({
        requestId: "req-trailing",
        chunks: [
          { atMs: 5, text: deltaEvent("kept ") },
          {
            atMs: 10,
            text: `data: ${JSON.stringify({
              choices: [{ delta: { content: "tail" } }],
            })}`,
          },
        ],
      }),
    })

    const promise = runStreamingCompletion(createRequest())
    await vi.advanceTimersByTimeAsync(100)
    const result = await promise

    expect(result.text).toBe("kept tail")
  })

  it("takes identity from the stream payload, not from response headers", async () => {
    // `x-request-id` is never sent by OpenRouter and would not be readable
    // cross-origin anyway; `id`/`model`/`provider` ride in every chunk.
    mockFetchSequence({
      response: createStreamingResponse({
        requestId: "gen-in-band",
        model: "openai/gpt-oss-120b",
        providerName: "Cerebras",
        chunks: [{ atMs: 5, text: deltaEvent("ok") }],
      }),
    })

    const promise = runStreamingCompletion(createRequest())
    await vi.advanceTimersByTimeAsync(100)
    const result = await promise

    expect(result.requestId).toBe("gen-in-band")
    expect(result.resolvedProviderName).toBe("Cerebras")
  })

  it("aborts and reports a first-token timeout when nothing arrives", async () => {
    let observed: AbortSignal | undefined
    mockFetchSequence({
      response: (signal) => {
        observed = signal
        return createStreamingResponse({
          requestId: "req-slow",
          chunks: [{ atMs: 5_000, text: deltaEvent("too late") }],
          signal,
        })
      },
    })

    const promise = runStreamingCompletion(createRequest(), {
      timeouts: { firstTokenMs: 1_000 },
    })
    const assertion = expect(promise).rejects.toBeInstanceOf(
      OpenRouterStreamTimeoutError
    )
    await vi.advanceTimersByTimeAsync(2_000)
    await assertion
    expect(observed?.aborted).toBe(true)
  })

  it("reports an idle timeout when the stream stalls after its first token", async () => {
    mockFetchSequence({
      response: (signal) =>
        createStreamingResponse({
          requestId: "req-stalled",
          chunks: [
            { atMs: 100, text: deltaEvent("started") },
            { atMs: 30_000, text: deltaEvent(" finished") },
          ],
          signal,
        }),
    })

    const promise = runStreamingCompletion(createRequest(), {
      timeouts: { firstTokenMs: 5_000, idleMs: 1_000 },
    })
    const assertion = expect(promise).rejects.toMatchObject({
      name: "OpenRouterStreamTimeoutError",
      kind: "idle",
    })
    await vi.advanceTimersByTimeAsync(4_000)
    await assertion
  })

  it("propagates a caller abort reason rather than a stream timeout", async () => {
    mockFetchSequence({ waitForAbort: true })

    const controller = new AbortController()
    const reason = new Error("user cancelled")
    const promise = runStreamingCompletion(
      createRequest({ signal: controller.signal })
    )
    const settled = promise.catch((e: unknown) => e)

    controller.abort(reason)
    await vi.advanceTimersByTimeAsync(10)
    await expect(settled).resolves.toBeInstanceOf(Error)
    expect(controller.signal.reason).toBe(reason)
  })

  it("cancels the response body when the consumer leaves early", async () => {
    let cancelled = false
    mockFetchSequence({
      response: () => {
        const base = createStreamingResponse({
          requestId: "req-cancel",
          chunks: [{ atMs: 5, text: deltaEvent("done") }],
        })
        const stream = base.body!.pipeThrough(
          new TransformStream({
            flush() {
              cancelled = true
            },
          })
        )
        return new Response(stream, { status: 200 })
      },
    })

    const promise = runStreamingCompletion(createRequest())
    await vi.advanceTimersByTimeAsync(100)
    await promise

    expect(cancelled).toBe(true)
  })

  it("classifies a 429 as retryable and keeps its Retry-After hint", async () => {
    mockFetchSequence({
      response: createJsonResponse(
        429,
        { error: { message: "slow down", code: 429 } },
        { "retry-after": "2" }
      ),
    })

    const promise = runStreamingCompletion(createRequest())
    const settled = promise.catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(100)
    const error = await settled

    expect(error).toBeInstanceOf(OpenRouterRateLimitError)
    expect((error as OpenRouterRateLimitError).retryAfterMs).toBe(2_000)
  })

  it("classifies a 401 as terminal so callers stop retrying a bad key", async () => {
    mockFetchSequence({
      response: createJsonResponse(401, {
        error: { message: "invalid key", code: 401 },
      }),
    })

    const promise = runStreamingCompletion(createRequest())
    const settled = promise.catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(100)

    expect(await settled).toBeInstanceOf(OpenRouterTerminalRequestError)
  })
})
