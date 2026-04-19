const BLOCKED_BY_OPENROUTER_MESSAGE =
  "Direct browser access to OpenRouter failed; your IP or network may be blocked by OpenRouter."

export function directBrowserOpenRouterErrorMessage(context?: string): string {
  return context
    ? `${BLOCKED_BY_OPENROUTER_MESSAGE} (${context})`
    : BLOCKED_BY_OPENROUTER_MESSAGE
}

export function createDirectBrowserOpenRouterError(context?: string): Error {
  return new Error(directBrowserOpenRouterErrorMessage(context))
}
