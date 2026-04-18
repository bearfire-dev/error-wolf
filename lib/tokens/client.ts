export type TokenRequestId = string

type WorkerResponse = { id: TokenRequestId; tokens: number }

let worker: Worker | null = null
const pending = new Map<TokenRequestId, (tokens: number) => void>()

function fallbackCount(text: string): number {
  return Math.max(0, Math.round(text.length / 4))
}

function makeId(): TokenRequestId {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getWorker(): Worker | null {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    return null
  }
  if (worker) return worker
  try {
    worker = new Worker(new URL("./tokens.worker.ts", import.meta.url), {
      type: "module",
    })
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const { id, tokens } = e.data
      const resolver = pending.get(id)
      if (resolver) {
        pending.delete(id)
        resolver(tokens)
      }
    }
    worker.onerror = () => {
      // Flush any pending requests with a fallback; workers are dead.
      for (const [, resolve] of pending) resolve(0)
      pending.clear()
      worker = null
    }
    return worker
  } catch {
    worker = null
    return null
  }
}

export function countTokens(text: string): Promise<number> {
  const w = getWorker()
  if (!w) {
    return Promise.resolve(fallbackCount(text))
  }
  return new Promise<number>((resolve) => {
    const id = makeId()
    pending.set(id, resolve)
    w.postMessage({ id, text })
  })
}
