import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { fetchModelEndpointsFromOpenRouter } from "./fetch-model-endpoints"

function endpointsResponse(endpoints: unknown[]): Response {
  return new Response(
    JSON.stringify({
      data: { id: "openai/gpt-oss-120b", name: "gpt-oss-120b", endpoints },
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  )
}

function validEndpoint(overrides: Record<string, unknown> = {}) {
  return {
    name: "DeepInfra | openai/gpt-oss-120b",
    model_id: "openai/gpt-oss-120b",
    model_name: "gpt-oss-120b",
    context_length: 131072,
    pricing: { prompt: "0.000000037", completion: "0.00000015" },
    provider_name: "DeepInfra",
    tag: "deepinfra/bf16",
    ...overrides,
  }
}

async function fetchWith(endpoints: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(endpointsResponse(endpoints)))
  )
  return fetchModelEndpointsFromOpenRouter("key", "openai/gpt-oss-120b")
}

describe("fetchModelEndpointsFromOpenRouter", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("keeps well-formed rows", async () => {
    const result = await fetchWith([validEndpoint()])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.endpoints).toHaveLength(1)
  })

  // These rows would throw in `rank-providers` and `costs`, which run inside a
  // `useMemo` during render — i.e. straight into the error boundary.
  it.each([
    ["a missing provider_name", validEndpoint({ provider_name: undefined })],
    ["a blank provider_name", validEndpoint({ provider_name: "   " })],
    ["missing pricing", validEndpoint({ pricing: undefined })],
    ["null pricing", validEndpoint({ pricing: null })],
    ["a null entry", null],
    ["a non-object entry", "nonsense"],
  ])("drops %s", async (_label, row) => {
    const result = await fetchWith([validEndpoint(), row])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.endpoints).toHaveLength(1)
      expect(result.data.endpoints[0]?.provider_name).toBe("DeepInfra")
    }
  })

  it("still reports an error when endpoints is not an array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ data: { endpoints: "nope" } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        )
      )
    )
    const result = await fetchModelEndpointsFromOpenRouter("key", "a/b")
    expect(result.ok).toBe(false)
  })
})
