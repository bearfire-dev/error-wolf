import type { HuntMode } from "@/lib/hunt-mode"

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export async function simplifyErrorText(
  input: string,
  _mode: HuntMode = "auto"
): Promise<string> {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error("Paste an error or log snippet to simplify.")
  }
  await delay(400)
  return [
    "[stub] AI simplification is not wired up yet.",
    "",
    "— cleaned paste —",
    trimmed,
  ].join("\n")
}
