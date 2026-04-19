import { HUNT_OPENROUTER_DEFAULT_MODEL_ID } from "@/lib/openrouter/hunt-routing-config"

import type { V1AnalysisBranchResult, V1PromptVariant } from "./types"

export const V1_DEFAULT_OPENROUTER_MODEL = HUNT_OPENROUTER_DEFAULT_MODEL_ID
export const V1_DEFAULT_OPENROUTER_TEMPERATURE = 0.12
/**
 * Heuristic only for provider-routing estimates.
 * Live simplify requests intentionally do not cap `max_tokens`.
 */
export const V1_DEFAULT_ESTIMATED_OUTPUT_TOKENS = 220

const COMPRESSION_SIGNAL_PRIORITIES = `- Devalue cosmetic cues: omit ANSI/color tokens and color-only narration unless they uniquely identify a diagnostic (rare).
- Devalue routine log timestamps, durations, and similar boilerplate; preserve causal order and phase sequence without copying every clock time.
- Keep explicit dates/times when they are part of the failure (quoted error text, expiry/deadline, audit fields, or values the message treats as the bug).`

const COMPRESSION_OUTPUT_FORMAT = `Return plain text only.

Use the ultra-minified canonical diagnostic format.
Use these lines in this order when data exists:
ERR <short normalized error headline>
CTX <runtime / tool / phase>
TOP <1-3 highest-signal frames or source sites>
FRAMES <compact frame chain>
ISSUES <representative diagnostics, issue counts, or linter findings>
SIG <failing commands, wrapper outcomes, or critical status lines>
NOISE <compressed repeated-noise counts>

Rules:
- Do not diagnose or explain the bug.
- Compress aggressively while preserving the important failure details.
- Prefer short local-looking paths and compact function names.
- For linter/tool output, preserve the failing tool, representative findings, and aggregate issue counts.
- Do not let generic git/task wrappers replace the concrete diagnostic finding.
- Collapse repeated noise into counts.
${COMPRESSION_SIGNAL_PRIORITIES}
- Do not include markdown fences, bullets, prose, or extra commentary.`

export const V1_ANALYSIS_PROMPT_VARIANTS: V1PromptVariant[] = [
  {
    id: "analysis-1",
    label: "compress-min",
    systemPrompt:
      "You compress noisy error traces, linter output, and build logs into the smallest safe canonical form for downstream LLMs.",
    buildUserPrompt(input) {
      return [
        "Task: produce the most aggressively compressed canonical diagnostic output you can without dropping the core failure, issue list, or key source sites.",
        "Favor token savings over explanation.",
        COMPRESSION_OUTPUT_FORMAT,
        "Normalized trace:",
        input,
      ].join("\n\n")
    },
  },
  {
    id: "analysis-2",
    label: "compress-source",
    systemPrompt:
      "You compress error traces while preserving the most important file, function, source location, and diagnostic finding details.",
    buildUserPrompt(input) {
      return [
        "Task: keep the output tiny, but bias toward preserving source locations, representative findings, and tool identity.",
        "Do not explain the error. Rewrite it into the canonical compact format.",
        COMPRESSION_OUTPUT_FORMAT,
        "Normalized trace:",
        input,
      ].join("\n\n")
    },
  },
  {
    id: "analysis-3",
    label: "compress-noise",
    systemPrompt:
      "You collapse repetitive logs and task noise into concise counters while preserving the concrete failure and diagnostics.",
    buildUserPrompt(input) {
      return [
        "Task: maximize compression by collapsing duplicated or incidental log churn into NOISE counts.",
        "Keep the essential failure, representative issue findings, and any useful frame chain.",
        COMPRESSION_OUTPUT_FORMAT,
        "Normalized trace:",
        input,
      ].join("\n\n")
    },
  },
]

export function buildV1SynthesisPrompt(
  input: string,
  analyses: V1AnalysisBranchResult[]
): string {
  const renderedAnalyses = analyses
    .map(
      (analysis, index) =>
        `Candidate ${index + 1} (${analysis.label}):\n${analysis.text}`
    )
    .join("\n\n")

  return [
    "Task: merge the candidate compact rewrites into the single best ultra-minified canonical diagnostic output.",
    "Prefer the smallest safe output that still preserves the essential failure, representative diagnostics, key source sites, and useful noise counts.",
    COMPRESSION_SIGNAL_PRIORITIES,
    "Do not explain or diagnose the problem.",
    "Return plain text only.",
    "",
    "Use the canonical diagnostic format:",
    "ERR",
    "CTX",
    "TOP",
    "FRAMES",
    "ISSUES",
    "SIG",
    "NOISE",
    "",
    "Normalized trace:",
    input,
    "",
    "Candidate rewrites:",
    renderedAnalyses,
  ].join("\n")
}
