/// <reference lib="webworker" />

type TokenRequest = { id: string; text: string }
type TokenResponse = { id: string; tokens: number }

declare const self: DedicatedWorkerGlobalScope

self.onmessage = async (e: MessageEvent<TokenRequest>) => {
  const { id, text } = e.data
  try {
    const mod = await import("gpt-tokenizer/model/gpt-4o")
    const tokens = mod.encode(text).length
    const response: TokenResponse = { id, tokens }
    self.postMessage(response)
  } catch {
    // Fallback: rough 1 token per 4 chars heuristic.
    const response: TokenResponse = {
      id,
      tokens: Math.max(0, Math.round(text.length / 4)),
    }
    self.postMessage(response)
  }
}

export {}
