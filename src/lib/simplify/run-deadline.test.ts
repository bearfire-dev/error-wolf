import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { OpenRouterStreamTimeoutError } from "./openrouter-client"
import { backoffDelayMs, sleepUnlessAborted } from "./retry-backoff"
import { OpenRouterRateLimitError } from "./openrouter-client"
import {
  HuntRunCancelledError,
  HuntRunTimeoutError,
  classifyRunFailure,
  createRunController,
  runTimeoutMsForEngine,
} from "./run-deadline"

describe("createRunController", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("aborts with a cancel reason when the user stops the run", () => {
    const run = createRunController(10_000)
    run.cancel()

    expect(run.controller.signal.aborted).toBe(true)
    expect(run.controller.signal.reason).toBeInstanceOf(HuntRunCancelledError)
  })

  it("aborts with a timeout reason once the budget elapses", () => {
    const run = createRunController(1_000)
    vi.advanceTimersByTime(1_001)

    expect(run.controller.signal.aborted).toBe(true)
    expect(run.controller.signal.reason).toBeInstanceOf(HuntRunTimeoutError)
  })

  it("does not fire the deadline after dispose", () => {
    const run = createRunController(1_000)
    run.dispose()
    vi.advanceTimersByTime(5_000)

    expect(run.controller.signal.aborted).toBe(false)
  })

  it("keeps the cancel reason when the deadline would follow", () => {
    const run = createRunController(1_000)
    run.cancel()
    vi.advanceTimersByTime(5_000)

    expect(run.controller.signal.reason).toBeInstanceOf(HuntRunCancelledError)
  })

  it("gives v1 a longer budget than v1-mini", () => {
    expect(runTimeoutMsForEngine("v1")).toBeGreaterThan(
      runTimeoutMsForEngine("v1-mini")
    )
  })
})

describe("classifyRunFailure", () => {
  it("reads the abort reason, not the surfaced error", () => {
    const run = createRunController(0)
    run.cancel()
    // Torn-down fetches surface a bare AbortError that names no cause.
    const surfaced = Object.assign(new Error("Request aborted."), {
      name: "AbortError",
    })

    expect(classifyRunFailure(surfaced, run.controller.signal)).toBe(
      "cancelled"
    )
  })

  it("distinguishes a blown deadline from a cancel", () => {
    const signal = AbortSignal.abort(new HuntRunTimeoutError(1_000))
    expect(classifyRunFailure(new Error("boom"), signal)).toBe("timeout")
  })

  it("treats an ordinary failure as an error", () => {
    expect(classifyRunFailure(new Error("boom"), undefined)).toBe("error")
  })

  it("does not mistake a per-request stream timeout for a run timeout", () => {
    const error = new OpenRouterStreamTimeoutError("idle", "stalled")
    expect(classifyRunFailure(error, undefined)).toBe("error")
  })
})

describe("backoffDelayMs", () => {
  it("grows exponentially across attempts", () => {
    const noJitter = () => 0
    const first = backoffDelayMs(1, new Error("x"), noJitter)
    const second = backoffDelayMs(2, new Error("x"), noJitter)
    const third = backoffDelayMs(3, new Error("x"), noJitter)

    expect(second).toBe(first * 2)
    expect(third).toBe(first * 4)
  })

  it("adds jitter so parallel branches do not retry in lockstep", () => {
    const low = backoffDelayMs(1, new Error("x"), () => 0)
    const high = backoffDelayMs(1, new Error("x"), () => 0.99)
    expect(high).toBeGreaterThan(low)
  })

  it("honors the server's Retry-After hint", () => {
    const error = new OpenRouterRateLimitError("slow down", 2_000)
    expect(backoffDelayMs(1, error, () => 0)).toBe(2_000)
  })

  it("caps a hostile Retry-After", () => {
    const error = new OpenRouterRateLimitError("slow down", 10 * 60_000)
    expect(backoffDelayMs(1, error, () => 0)).toBeLessThanOrEqual(8_000)
  })
})

describe("sleepUnlessAborted", () => {
  it("rejects immediately when the signal is already aborted", async () => {
    await expect(
      sleepUnlessAborted(1_000, AbortSignal.abort())
    ).rejects.toMatchObject({ name: "AbortError" })
  })

  it("rejects as soon as the signal aborts mid-wait", async () => {
    // Otherwise pressing cancel would wait out the remaining backoff first.
    const controller = new AbortController()
    const pending = sleepUnlessAborted(60_000, controller.signal)
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
  })

  it("resolves when no signal is supplied", async () => {
    await expect(sleepUnlessAborted(0)).resolves.toBeUndefined()
  })
})
