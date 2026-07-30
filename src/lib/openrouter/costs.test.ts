import { describe, expect, it } from "vitest"

import type { OpenRouterPublicEndpoint } from "@/lib/openrouter/endpoints-types"

import { buildOpenRouterCostSpan } from "./costs"
import { endpointProviderSlug } from "./rank-providers"

function endpoint(
  providerName: string,
  tag: string,
  prompt: string,
  completion: string
): OpenRouterPublicEndpoint {
  return {
    name: `${providerName} | openai/gpt-oss-120b`,
    model_id: "openai/gpt-oss-120b",
    model_name: "gpt-oss-120b",
    context_length: 131072,
    pricing: { prompt, completion },
    provider_name: providerName,
    tag,
    quantization: null,
    max_completion_tokens: null,
    max_prompt_tokens: null,
    supported_parameters: [],
    status: "ok",
    uptime_last_30m: null,
    uptime_last_5m: null,
    uptime_last_1d: null,
    supports_implicit_caching: false,
    latency_last_30m: null,
    throughput_last_30m: null,
  } satisfies OpenRouterPublicEndpoint
}

const CHEAP = endpoint("DeepInfra", "deepinfra/bf16", "0.000001", "0.000002")
const PRICEY = endpoint("Cerebras", "cerebras/fp16", "0.00001", "0.00002")

describe("buildOpenRouterCostSpan", () => {
  it("prices against the provider that actually served, not the one requested", () => {
    const span = buildOpenRouterCostSpan({
      stepId: "synthesis",
      requestId: "gen-1",
      modelId: "openai/gpt-oss-120b",
      usage: { promptTokens: 1000, completionTokens: 500 },
      // We asked for DeepInfra...
      provider: { only: ["deepinfra"] },
      // ...but OpenRouter fell back to Cerebras.
      resolvedProviderName: "Cerebras",
      endpoints: [CHEAP, PRICEY],
    })

    expect(span.providerName).toBe("Cerebras")
    expect(span.providerSlug).toBe("cerebras")
    expect(span.estimatedCostUsd).toBeCloseTo(1000 * 0.00001 + 500 * 0.00002)
  })

  it("falls back to the requested provider when the stream reported none", () => {
    const span = buildOpenRouterCostSpan({
      stepId: "synthesis",
      requestId: "gen-2",
      modelId: "openai/gpt-oss-120b",
      usage: { promptTokens: 1000, completionTokens: 500 },
      provider: { only: ["deepinfra"] },
      endpoints: [CHEAP, PRICEY],
    })

    expect(span.providerName).toBe("DeepInfra")
    expect(span.estimatedCostUsd).toBeCloseTo(1000 * 0.000001 + 500 * 0.000002)
  })

  it("does not throw when an endpoint is missing its pricing block", () => {
    const broken = {
      ...CHEAP,
      pricing: undefined,
    } as unknown as OpenRouterPublicEndpoint

    expect(() =>
      buildOpenRouterCostSpan({
        stepId: "compress",
        requestId: null,
        modelId: "openai/gpt-oss-120b",
        usage: { promptTokens: 10, completionTokens: 10 },
        endpoints: [broken],
      })
    ).not.toThrow()
  })

  it("prefers OpenRouter's reported cost over the estimate", () => {
    const span = buildOpenRouterCostSpan({
      stepId: "compress",
      requestId: null,
      modelId: "openai/gpt-oss-120b",
      usage: { promptTokens: 100, completionTokens: 100, reportedCostUsd: 0.5 },
      endpoints: [CHEAP],
    })

    expect(span.displayCostUsd).toBe(0.5)
    expect(span.source).toBe("response_usage_cost")
  })
})

describe("endpointProviderSlug", () => {
  it("prefers the tag prefix", () => {
    expect(endpointProviderSlug(CHEAP)).toBe("deepinfra")
  })

  it("slugifies provider_name when there is no tag", () => {
    const noTag = { ...CHEAP, tag: "", provider_name: "Mancer 2" }
    expect(endpointProviderSlug(noTag)).toBe("mancer-2")
  })

  it("returns an empty slug rather than throwing on a missing name", () => {
    const broken = {
      ...CHEAP,
      tag: "",
      provider_name: undefined,
    } as unknown as OpenRouterPublicEndpoint
    expect(endpointProviderSlug(broken)).toBe("")
  })
})
