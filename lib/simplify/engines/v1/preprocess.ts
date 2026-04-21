import type {
  V1CanonicalFrame,
  V1NoiseBucket,
  V1PreprocessResult,
} from "./types"

const DIVIDER_CHARS = new Set([
  "-",
  "=",
  "*",
  "`",
  "~",
  "_",
  "#",
  ">",
  "|",
  "+",
])
const LOCAL_PATH_HINTS = [
  "src/",
  "app/",
  "lib/",
  "components/",
  "hooks/",
  "scripts/",
]
const LOW_SIGNAL_CONTEXT_TAGS = new Set([
  "started",
  "completed",
  "failed",
  "skipped",
])

type NoiseHit = {
  key: string
  label: string
}

type FailureSignal = {
  headline: string
  summary: string
  tool: string | null
}

type DiagnosticSummary = {
  headline: string | null
  summary: string
  tool: string | null
}

type DiagnosticIssue = {
  location: string
  summary: string
}

function isDividerLikeLine(line: string): boolean {
  if (line.length < 3) return false
  for (const char of line) {
    if (!DIVIDER_CHARS.has(char)) {
      return false
    }
  }
  return true
}

function stripLogPrefix(line: string): string {
  return line.replace(/^\[[^\]]+\]\s*/, "").trim()
}

function incrementNoiseBucket(
  buckets: Map<string, V1NoiseBucket>,
  hit: NoiseHit,
  sample: string
): void {
  const current = buckets.get(hit.key)
  if (current) {
    current.count += 1
    return
  }
  buckets.set(hit.key, {
    key: hit.key,
    label: hit.label,
    count: 1,
    sample,
  })
}

function classifyNoiseLine(line: string): NoiseHit | null {
  const lower = line.toLowerCase()

  if (lower.includes("hmr update")) {
    return { key: "hmr-update", label: "vite hmr update" }
  }
  if (lower.includes("page reload")) {
    return { key: "page-reload", label: "page reload" }
  }
  if (lower.includes("changed tsconfig file detected")) {
    return { key: "tsconfig-changed", label: "tsconfig changed" }
  }
  if (lower.includes("restarting server")) {
    return { key: "server-restart", label: "server restart" }
  }
  if (lower.includes("server restarted")) {
    return { key: "server-restarted", label: "server restarted" }
  }
  if (lower.includes("debugger listening on")) {
    return { key: "debugger", label: "debugger banner" }
  }
  if (lower.includes("for help, see: https://nodejs.org")) {
    return { key: "debugger-help", label: "debugger help" }
  }
  if (lower.includes("preparing convex functions")) {
    return { key: "convex-prepare", label: "convex prepare" }
  }
  if (lower.includes("convex functions ready")) {
    return { key: "convex-ready", label: "convex ready" }
  }
  if (
    lower.startsWith("local: http://") ||
    lower.startsWith("local: https://")
  ) {
    return { key: "local-banner", label: "local banner" }
  }
  if (lower.includes("network: use --host")) {
    return { key: "network-banner", label: "network banner" }
  }
  if (
    (/^vite\+/.test(lower) || /^vite\b/.test(lower)) &&
    !lower.includes("failed")
  ) {
    return { key: "vite-banner", label: "vite banner" }
  }
  return null
}

function trimPathDecorators(location: string): string {
  const withoutProtocol = location.replace(/^file:\/\//, "")
  const withoutQuery = withoutProtocol.replace(/[?#].*$/, "")
  return withoutQuery.replace(/\)+$/, "")
}

function compactPath(pathLike: string): string {
  const trimmed = trimPathDecorators(pathLike)
  const normalized = trimmed.replace(/\\/g, "/")
  const hint = LOCAL_PATH_HINTS.find((segment) => normalized.includes(segment))
  if (hint) {
    return normalized.slice(normalized.lastIndexOf(hint))
  }

  const parts = normalized.split("/").filter(Boolean)
  if (parts.length <= 2) return normalized

  const tail = parts.slice(-2).join("/")
  const lineMatch = tail.match(/(.+:\d+:\d+)$/)
  return lineMatch ? lineMatch[1] : tail
}

function parseFrameLine(line: string): V1CanonicalFrame | null {
  const cleaned = line.replace(/\s+\{$/, "").trim()
  if (!cleaned.startsWith("at ")) return null

  const withFunction = cleaned.match(/^at\s+(.*?)\s+\((.+)\)$/)
  if (withFunction) {
    const functionName = withFunction[1]?.trim() || null
    const location = compactPath(withFunction[2] ?? "")
    return {
      raw: line,
      text: functionName ? `${functionName}@${location}` : location,
      functionName,
      location,
    }
  }

  const bare = cleaned.match(/^at\s+(.+)$/)
  if (!bare) return null
  const location = compactPath(bare[1] ?? "")
  return {
    raw: line,
    text: location,
    functionName: null,
    location,
  }
}

function compactErrorHeadline(line: string): string {
  const compacted = line
    .replace(/^Error:\s*/i, "")
    .replace(/^TypeError:\s*/i, "TypeError ")
    .replace(/\s+\(resolved id:.*$/, "")
    .replace(/\s+in\s+\/.*$/, "")
    .replace(/\.\s*Does the file exist\?\s*$/i, "")
    .trim()
  return compacted || line.trim()
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index)
}

function compactList(values: string[], limit: number): string[] {
  const unique = uniqueStrings(
    values.filter((value) => value.trim().length > 0)
  )
  if (unique.length <= limit) return unique
  return [...unique.slice(0, limit), `+${unique.length - limit} more`]
}

function shortCommand(command: string): string {
  return command.trim().split(/\s+/).slice(0, 2).join(" ")
}

function normalizeToolName(command: string): string | null {
  const normalized = command.trim()
  if (!normalized) return null
  const firstToken = normalized.split(/\s+/)[0]?.toLowerCase() ?? ""
  if (!firstToken) return null
  return firstToken === "vite+" ? "pre-commit" : firstToken
}

function parseFailureSignal(line: string): FailureSignal | null {
  const wrapperMatch = line.match(
    /^VITE\+\s*-\s*pre-commit script failed \(code (\d+)\)$/i
  )
  if (wrapperMatch) {
    return {
      headline: "pre-commit failed",
      summary: `pre-commit failed (code ${wrapperMatch[1]})`,
      tool: "pre-commit",
    }
  }

  const taskKilledMatch = line.match(/^✖\s+Task killed:\s+(.+)$/i)
  if (taskKilledMatch) {
    const command = compactSignalLine(taskKilledMatch[1] ?? "")
    return {
      headline: `${shortCommand(command)} killed`,
      summary: `${command} killed`,
      tool: normalizeToolName(command),
    }
  }

  const failedTaskMatch = line.match(/^✖\s+(.+?):$/)
  if (failedTaskMatch) {
    const command = compactSignalLine(failedTaskMatch[1] ?? "")
    return {
      headline: `${shortCommand(command)} failed`,
      summary: `${command} failed`,
      tool: normalizeToolName(command),
    }
  }

  const statusMatch = line.match(/^(.+?)\s+\[(FAILED|SIGKILL)\]$/i)
  if (!statusMatch) return null

  const command = compactSignalLine(statusMatch[1] ?? "")
  const status = statusMatch[2]?.toUpperCase() ?? "FAILED"
  return {
    headline: `${shortCommand(command)} ${status === "SIGKILL" ? "killed" : "failed"}`,
    summary: `${command} ${status === "SIGKILL" ? "killed" : "failed"}`,
    tool: normalizeToolName(command),
  }
}

function parseDiagnosticSummary(line: string): DiagnosticSummary | null {
  const cspellMatch = line.match(
    /^CSpell:\s*Files checked:\s*(\d+),\s*Issues found:\s*(\d+)\s+in\s+(\d+)\s+files?\.?$/i
  )
  if (!cspellMatch) return null

  const checked = cspellMatch[1] ?? "0"
  const issues = cspellMatch[2] ?? "0"
  const files = cspellMatch[3] ?? "0"
  return {
    headline: `cspell ${issues} issues/${files} files`,
    summary: `cspell ${issues} issues/${files} files (${checked} checked)`,
    tool: "cspell",
  }
}

function parseDiagnosticIssue(line: string): DiagnosticIssue | null {
  const match = line.match(/^(.+?):(\d+):(\d+)\s+-\s+(.+)$/)
  if (!match) return null

  const location = compactPath(
    `${match[1] ?? ""}:${match[2] ?? ""}:${match[3] ?? ""}`
  )
  const message = compactSignalLine(match[4] ?? "")
  const unknownWordMatch = message.match(/^Unknown word \((.+)\)$/i)
  return {
    location,
    summary: unknownWordMatch
      ? `${location} unknown(${unknownWordMatch[1]})`
      : `${location} ${message}`,
  }
}

function isErrorLikeLine(line: string): boolean {
  return (
    /^error:/i.test(line) ||
    /^typeerror:/i.test(line) ||
    /^referenceerror:/i.test(line) ||
    /^syntaxerror:/i.test(line) ||
    /^rangeerror:/i.test(line) ||
    /^aggregateerror:/i.test(line) ||
    /\berr_[a-z0-9_]+\b/i.test(line) ||
    /failed to load url/i.test(line)
  )
}

function compactSignalLine(line: string): string {
  return line
    .replace(/^runnerError:\s*/i, "runnerError ")
    .replace(/^code:\s*/i, "code ")
    .replace(/\s+/g, " ")
    .trim()
}

export function preprocessV1Input(input: string): V1PreprocessResult {
  const lines = input.split(/\r?\n/)
  const seen = new Set<string>()
  const noiseBuckets = new Map<string, V1NoiseBucket>()
  const retainedLines: string[] = []
  const frames: V1CanonicalFrame[] = []
  const genericSignalLines: string[] = []
  const failureSignals: FailureSignal[] = []
  const diagnosticIssues: DiagnosticIssue[] = []
  const diagnosticSummaries: DiagnosticSummary[] = []
  const contextTags: string[] = []
  const contextTools: string[] = []

  let removedEmptyCount = 0
  let removedDividerCount = 0
  let removedDuplicateCount = 0
  let headline: string | null = null

  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed) {
      removedEmptyCount += 1
      continue
    }

    if (isDividerLikeLine(trimmed)) {
      removedDividerCount += 1
      continue
    }

    const stripped = stripLogPrefix(trimmed)
    const tagMatch = trimmed.match(/^\[([^\]]+)\]/)
    const tag = tagMatch?.[1]?.trim().toLowerCase() ?? null
    if (
      tag &&
      !LOW_SIGNAL_CONTEXT_TAGS.has(tag) &&
      !contextTags.includes(tag)
    ) {
      contextTags.push(tag)
    }

    const noiseHit = classifyNoiseLine(stripped)
    if (noiseHit) {
      incrementNoiseBucket(noiseBuckets, noiseHit, stripped)
      continue
    }

    const dedupeKey = stripped
    if (seen.has(dedupeKey)) {
      removedDuplicateCount += 1
      incrementNoiseBucket(
        noiseBuckets,
        {
          key: "duplicate-lines",
          label: "duplicate signal lines",
        },
        stripped
      )
      continue
    }

    seen.add(dedupeKey)
    retainedLines.push(stripped)

    const failureSignal = parseFailureSignal(stripped)
    if (failureSignal) {
      failureSignals.push(failureSignal)
      if (failureSignal.tool && !contextTools.includes(failureSignal.tool)) {
        contextTools.push(failureSignal.tool)
      }
      continue
    }

    const diagnosticSummary = parseDiagnosticSummary(stripped)
    if (diagnosticSummary) {
      diagnosticSummaries.push(diagnosticSummary)
      if (
        diagnosticSummary.tool &&
        !contextTools.includes(diagnosticSummary.tool)
      ) {
        contextTools.push(diagnosticSummary.tool)
      }
      continue
    }

    const diagnosticIssue = parseDiagnosticIssue(stripped)
    if (diagnosticIssue) {
      diagnosticIssues.push(diagnosticIssue)
      continue
    }

    if (!headline && isErrorLikeLine(stripped)) {
      headline = compactErrorHeadline(stripped)
      continue
    }

    const frame = parseFrameLine(stripped)
    if (frame) {
      frames.push(frame)
      continue
    }

    const signal = compactSignalLine(stripped)
    if (signal) {
      genericSignalLines.push(signal)
    }
  }

  if (!headline) {
    const diagnosticHeadline = diagnosticSummaries.find(
      (summary) => summary.headline
    )
    if (diagnosticHeadline?.headline) {
      headline = diagnosticHeadline.headline
    } else if (diagnosticIssues.length > 0 && contextTools[0]) {
      headline =
        contextTools[0] === "cspell"
          ? "cspell unknown-word findings"
          : `${contextTools[0]} diagnostic findings`
    } else if (failureSignals[0]) {
      headline = failureSignals[0].headline
    } else {
      const firstSignal = genericSignalLines.find((line) =>
        isErrorLikeLine(line)
      )
      if (firstSignal) {
        headline = compactErrorHeadline(firstSignal)
      }
    }
  }

  const frameSources = frames.flatMap((frame) =>
    [frame.location, frame.functionName].filter((value): value is string =>
      Boolean(value?.trim())
    )
  )
  const issueSources = diagnosticIssues.map((issue) => issue.location)
  const topSources = uniqueStrings([...frameSources, ...issueSources]).slice(
    0,
    3
  )

  const contextParts = [
    contextTools.length > 0 ? contextTools.slice(0, 3).join("/") : null,
    contextTags.length > 0 ? contextTags.join("/") : null,
    frames.find((frame) => frame.location?.startsWith("src/"))?.location ??
      frames[0]?.location ??
      null,
  ].filter((value): value is string => Boolean(value))
  const context = contextParts.length > 0 ? contextParts.join(" / ") : null

  const compactFrames = frames.slice(0, 8).map((frame) => frame.text)
  const frameSuffix =
    frames.length > compactFrames.length
      ? ` > +${frames.length - compactFrames.length} more`
      : null
  const noiseSummary = [...noiseBuckets.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((bucket) => `${bucket.label} x${bucket.count}`)
  const issueSummaries = compactList(
    [
      ...diagnosticSummaries.map((summary) => summary.summary),
      ...diagnosticIssues.map((issue) => issue.summary),
    ],
    5
  )
  const preferredSignals = compactList(
    failureSignals.map((signal) => signal.summary),
    4
  )
  const signalSummaries =
    preferredSignals.length > 0
      ? preferredSignals
      : compactList(genericSignalLines, 4)

  const textParts = [
    headline ? `ERR ${headline}` : null,
    context ? `CTX ${context}` : null,
    topSources.length > 0 ? `TOP ${topSources.join(" | ")}` : null,
    compactFrames.length > 0
      ? `FRAMES ${compactFrames.join(" > ")}${frameSuffix ?? ""}`
      : null,
    issueSummaries.length > 0 ? `ISSUES ${issueSummaries.join(" ; ")}` : null,
    signalSummaries.length > 0 ? `SIG ${signalSummaries.join(" ; ")}` : null,
    noiseSummary.length > 0 ? `NOISE ${noiseSummary.join("; ")}` : null,
  ].filter((value): value is string => Boolean(value))

  const noiseList = [...noiseBuckets.values()].sort((a, b) => b.count - a.count)
  const signalLines = uniqueStrings([
    ...failureSignals.map((signal) => signal.summary),
    ...genericSignalLines,
  ])

  return {
    text: textParts.join("\n"),
    lines: retainedLines,
    originalLineCount: lines.length,
    keptLineCount: retainedLines.length,
    removedEmptyCount,
    removedDividerCount,
    removedDuplicateCount,
    headline,
    context,
    topSources,
    frames,
    signalLines,
    diagnosticIssues: diagnosticIssues.map((issue) => issue.summary),
    diagnosticSummaries: diagnosticSummaries.map((summary) => summary.summary),
    failureSignals: failureSignals.map((signal) => signal.summary),
    noiseBuckets: noiseList,
  }
}
