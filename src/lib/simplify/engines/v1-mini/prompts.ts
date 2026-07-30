import { HUNT_OPENROUTER_DEFAULT_MINI_MODEL_ID } from "@/lib/openrouter/hunt-routing-config"

export const V1_MINI_DEFAULT_OPENROUTER_MODEL =
  HUNT_OPENROUTER_DEFAULT_MINI_MODEL_ID
export const V1_MINI_DEFAULT_OPENROUTER_TEMPERATURE = 0.1
/**
 * Heuristic only for provider-routing estimates.
 * Live simplify requests intentionally do not cap `max_tokens`.
 */
export const V1_MINI_DEFAULT_ESTIMATED_OUTPUT_TOKENS = 180

export const V1_MINI_SYSTEM_PROMPT =
  "You compress short error traces, linter output, and build logs into the smallest safe canonical form for downstream LLMs. For short inputs, combine aggressive minification, source preservation, and noise collapsing in one pass."

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

export function buildV1MiniPrompt(input: string): string {
  return [
    "Task: produce one best-of canonical diagnostic rewrite in a single pass.",
    "This input is small enough to keep in working memory, so combine all of these priorities at once:",
    "- be as small as safely possible",
    "- preserve the most important source locations, representative diagnostics, and tool identity",
    "- collapse duplicate or incidental noise into compact counts",
    "Do not generate multiple candidates or explain the failure.",
    COMPRESSION_OUTPUT_FORMAT,
    "Normalized trace:",
    input,
  ].join("\n\n")
}
