import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  RECENT_RESULTS_STORAGE_KEY,
  addRecentResult,
  getRecentResults,
  getRecentResultsWriteStatus,
  resetRecentResultsCacheForTests,
} from "./recent-results"

type StorageStub = {
  store: Map<string, string>
  getItem: ReturnType<typeof vi.fn>
  setItem: ReturnType<typeof vi.fn>
  removeItem: ReturnType<typeof vi.fn>
  /** Reject writes over this many characters, mimicking an origin quota. */
  limit: number
}

function createStorageStub(limit = Number.POSITIVE_INFINITY): StorageStub {
  const store = new Map<string, string>()
  const stub: StorageStub = {
    store,
    limit,
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      if (value.length > stub.limit) {
        const error = new Error("quota")
        error.name = "QuotaExceededError"
        throw error
      }
      store.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key)
    }),
  }
  return stub
}

function installStorage(stub: StorageStub) {
  vi.stubGlobal("window", { localStorage: stub, sessionStorage: stub })
}

function row(id: string, daysAgo = 0) {
  return {
    id,
    createdAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
    inputPreview: `preview ${id}`,
    output: `output ${id}`,
    inputChars: 100,
    outputChars: 40,
    durationMs: 1000,
  }
}

describe("recent-results storage", () => {
  beforeEach(() => {
    resetRecentResultsCacheForTests()
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("does not write to storage on a read", () => {
    const stub = createStorageStub()
    // Deliberately unsorted and unnormalized, which used to trigger a writeback.
    stub.store.set(
      RECENT_RESULTS_STORAGE_KEY,
      JSON.stringify([row("older", 2), row("newer", 0)])
    )
    installStorage(stub)

    const entries = getRecentResults()

    expect(entries.map((e) => e.id)).toEqual(["newer", "older"])
    expect(stub.setItem).not.toHaveBeenCalled()
  })

  it("reuses the cache instead of reparsing an unchanged payload", () => {
    const stub = createStorageStub()
    stub.store.set(RECENT_RESULTS_STORAGE_KEY, JSON.stringify([row("a")]))
    installStorage(stub)

    const parse = vi.spyOn(JSON, "parse")
    getRecentResults()
    const afterFirst = parse.mock.calls.length
    getRecentResults()
    getRecentResults()

    expect(parse.mock.calls.length).toBe(afterFirst)
  })

  it("drops old rows past the retention window", () => {
    const stub = createStorageStub()
    stub.store.set(
      RECENT_RESULTS_STORAGE_KEY,
      JSON.stringify([row("fresh", 1), row("stale", 60)])
    )
    installStorage(stub)

    expect(getRecentResults().map((e) => e.id)).toEqual(["fresh"])
  })

  it("returns an empty list rather than throwing on corrupt JSON", () => {
    const stub = createStorageStub()
    stub.store.set(RECENT_RESULTS_STORAGE_KEY, "{not json")
    installStorage(stub)

    expect(getRecentResults()).toEqual([])
  })

  it("sheds the oldest half and still persists when a write hits quota", () => {
    const stub = createStorageStub()
    installStorage(stub)

    for (let i = 0; i < 6; i += 1) {
      addRecentResult(row(`r${i}`, 6 - i))
    }
    expect(getRecentResultsWriteStatus()).toBe("ok")

    // Now clamp the quota to just under the current payload size.
    const current = stub.store.get(RECENT_RESULTS_STORAGE_KEY) ?? ""
    stub.limit = current.length

    const next = addRecentResult(row("overflow"))

    expect(getRecentResultsWriteStatus()).toBe("ok")
    expect(next.length).toBeLessThan(7)
    // The newest run survives; the oldest are what get dropped.
    expect(next[0]?.id).toBe("overflow")
    expect(
      JSON.parse(stub.store.get(RECENT_RESULTS_STORAGE_KEY) ?? "[]")
    ).toHaveLength(next.length)
  })

  it("reports quota when even the trimmed payload will not fit", () => {
    const stub = createStorageStub(10)
    installStorage(stub)

    addRecentResult(row("too-big"))

    expect(getRecentResultsWriteStatus()).toBe("quota")
  })

  it("runs legacy migrations once, not on every read", () => {
    const stub = createStorageStub()
    installStorage(stub)

    getRecentResults()
    const afterFirst = stub.getItem.mock.calls.length
    getRecentResults()
    const afterSecond = stub.getItem.mock.calls.length

    // The second read touches only the current key, not the two legacy probes.
    expect(afterSecond - afterFirst).toBe(1)
  })
})
