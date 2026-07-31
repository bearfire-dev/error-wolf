export function estimateQueryTotalTokens(
  promptTokens: number,
  expectedOutputTokens = 220
): number {
  return Math.max(1, Math.ceil(promptTokens + expectedOutputTokens))
}
