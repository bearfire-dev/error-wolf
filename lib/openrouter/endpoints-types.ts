/** Percentile stats from OpenRouter (latency = TTFT, ms). */

export type OpenRouterPercentileStats = {
  p50: number
  p75: number
  p90: number
  p99: number
}

export type OpenRouterPublicEndpoint = {
  name: string
  model_id: string
  model_name: string
  context_length: number
  pricing: {
    prompt: string
    completion: string
    discount?: number
  }
  provider_name: string
  tag: string
  quantization: string | null
  max_completion_tokens: number | null
  max_prompt_tokens: number | null
  supported_parameters: string[]
  status: string
  uptime_last_30m: number | null
  uptime_last_5m: number | null
  uptime_last_1d: number | null
  supports_implicit_caching: boolean
  latency_last_30m: OpenRouterPercentileStats | null
  throughput_last_30m: OpenRouterPercentileStats | null
}

export type OpenRouterModelEndpointsData = {
  id: string
  name: string
  created?: number
  description?: string
  architecture?: Record<string, unknown>
  endpoints: OpenRouterPublicEndpoint[]
}

export type OpenRouterModelEndpointsResponse = {
  data: OpenRouterModelEndpointsData
}
