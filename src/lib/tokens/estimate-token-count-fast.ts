"use client"

export type FastTokenEstimateKind = "text" | "prompt"

export type FastTokenEstimateInput =
  | string
  | {
      text: string
      kind?: FastTokenEstimateKind
    }

export const TOKEN_TEXT_BASE_DIVISOR = 4.4
export const TOKEN_PROMPT_BASE_DIVISOR = 4.55

const MIN_TEXT_DIVISOR = 2.35
const MAX_TEXT_DIVISOR = 3.6
const MIN_PROMPT_DIVISOR = 3.55
const MAX_PROMPT_DIVISOR = 4.55

const DIAGNOSTIC_LINE_RE = /(^|\n)(ERR |CTX |TOP |FRAMES |ISSUES |SIG |NOISE )/g

const encoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null

type TokenEstimateStats = {
  bytes: number
  codePoints: number
  nonSpaceCodePoints: number
  asciiPunctuation: number
  asciiDigits: number
  nonAsciiCodePoints: number
  lineBreaks: number
  diagnosticLines: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function isAsciiAlphaNumeric(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122)
  )
}

function isAsciiWhitespace(code: number): boolean {
  return code === 32 || code === 9 || code === 10 || code === 13
}

function utf8ByteLength(text: string): number {
  if (encoder) return encoder.encode(text).length

  let bytes = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (code <= 0x7f) bytes += 1
    else if (code <= 0x7ff) bytes += 2
    else if (code <= 0xffff) bytes += 3
    else bytes += 4
  }
  return bytes
}

function collectTokenEstimateStats(text: string): TokenEstimateStats {
  let codePoints = 0
  let nonSpaceCodePoints = 0
  let asciiPunctuation = 0
  let asciiDigits = 0
  let nonAsciiCodePoints = 0
  let lineBreaks = 0

  for (const ch of text) {
    codePoints += 1
    if (ch === "\n") lineBreaks += 1

    const code = ch.codePointAt(0) ?? 0
    if (code <= 0x7f) {
      if (isAsciiWhitespace(code)) continue
      nonSpaceCodePoints += 1
      if (code >= 48 && code <= 57) {
        asciiDigits += 1
      }
      if (!isAsciiAlphaNumeric(code)) {
        asciiPunctuation += 1
      }
      continue
    }

    nonAsciiCodePoints += 1
    nonSpaceCodePoints += 1
  }

  const diagnosticLines = (text.match(DIAGNOSTIC_LINE_RE) ?? []).length

  return {
    bytes: utf8ByteLength(text),
    codePoints,
    nonSpaceCodePoints,
    asciiPunctuation,
    asciiDigits,
    nonAsciiCodePoints,
    lineBreaks,
    diagnosticLines,
  }
}

function estimateTextDivisor(stats: TokenEstimateStats): number {
  const punctDensity =
    stats.nonSpaceCodePoints > 0
      ? stats.asciiPunctuation / stats.nonSpaceCodePoints
      : 0
  const lineDensity =
    stats.codePoints > 0 ? stats.lineBreaks / stats.codePoints : 0
  const digitDensity =
    stats.codePoints > 0 ? stats.asciiDigits / stats.codePoints : 0
  const nonAsciiDensity =
    stats.codePoints > 0 ? stats.nonAsciiCodePoints / stats.codePoints : 0
  const structuredDiagnosticPenalty = stats.diagnosticLines > 0 ? 0.45 : 0

  return clamp(
    TOKEN_TEXT_BASE_DIVISOR -
      digitDensity * 10 -
      punctDensity * 1.2 -
      lineDensity * 2 -
      nonAsciiDensity * 12 -
      structuredDiagnosticPenalty,
    MIN_TEXT_DIVISOR,
    MAX_TEXT_DIVISOR
  )
}

function estimatePromptDivisor(stats: TokenEstimateStats): number {
  const punctDensity =
    stats.nonSpaceCodePoints > 0
      ? stats.asciiPunctuation / stats.nonSpaceCodePoints
      : 0
  const lineDensity =
    stats.codePoints > 0 ? stats.lineBreaks / stats.codePoints : 0

  return clamp(
    TOKEN_PROMPT_BASE_DIVISOR - punctDensity * 4.5 - lineDensity * 6,
    MIN_PROMPT_DIVISOR,
    MAX_PROMPT_DIVISOR
  )
}

function normalizeEstimateInput(input: FastTokenEstimateInput): {
  text: string
  kind: FastTokenEstimateKind
} {
  return typeof input === "string"
    ? { text: input, kind: "text" }
    : { text: input.text, kind: input.kind ?? "text" }
}

export function estimateTokenCountFast(input: FastTokenEstimateInput): number {
  const normalized = normalizeEstimateInput(input)
  const text = normalized.text
  if (!text) return 0

  const stats = collectTokenEstimateStats(text)
  const divisor =
    normalized.kind === "prompt"
      ? estimatePromptDivisor(stats)
      : estimateTextDivisor(stats)

  return Math.max(1, Math.round(stats.bytes / divisor))
}

export function estimateTokenCountsFast(
  inputs: readonly FastTokenEstimateInput[]
): number[] {
  return inputs.map((input) => estimateTokenCountFast(input))
}
