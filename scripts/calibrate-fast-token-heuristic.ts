import {
  estimateTokenCountFast,
  type FastTokenEstimateInput,
} from "@/lib/tokens/estimate-token-count-fast"

type Fixture = {
  name: string
  input: FastTokenEstimateInput
  expectedTokens: number
}

/**
 * Reference counts captured from `gpt-tokenizer/model/gpt-4o` before the
 * package was removed. Keep these fixtures stable so the heuristic can be
 * tuned without reintroducing the tokenizer dependency.
 */
const FIXTURES: Fixture[] = [
  {
    name: "raw-stack",
    input:
      "TypeError: Cannot read properties of undefined (reading id)\n" +
      "    at renderIssue (src/app/issues/page.tsx:42:17)\n" +
      "    at IssuePage (src/app/issues/page.tsx:88:12)\n" +
      "    at Object.react_stack_bottom_frame (react-dom-client.development.js:25904:20)\n" +
      "    at renderWithHooks (react-dom-client.development.js:7662:22)",
    expectedTokens: 82,
  },
  {
    name: "canonical-diagnostic",
    input:
      "ERR TypeError cannot read id\n" +
      "CTX nextjs/react issues page\n" +
      "TOP src/app/issues/page.tsx:42:17 | src/app/issues/page.tsx:88:12\n" +
      "FRAMES renderIssue@src/app/issues/page.tsx:42:17 > IssuePage@src/app/issues/page.tsx:88:12\n" +
      "SIG pnpm lint failed",
    expectedTokens: 72,
  },
  {
    name: "build-log",
    input:
      "[build] Failed to compile.\n" +
      "./src/lib/env.ts:12:8\n" +
      "Type error: Type undefined is not assignable to type string.\n\n" +
      "  10 | export function readEnv() {\n" +
      "  11 |   const apiKey = process.env.NEXT_PUBLIC_API_KEY\n" +
      "> 12 |   return apiKey\n" +
      "     |        ^\n" +
      "  13 | }",
    expectedTokens: 75,
  },
  {
    name: "analysis-prompt",
    input: {
      kind: "prompt",
      text:
        "You compress noisy error traces, linter output, and build logs into the smallest safe canonical form for downstream LLMs.\n\n" +
        "Task: keep the output tiny, but bias toward preserving source locations, representative findings, and tool identity.\n" +
        "Do not explain the error. Rewrite it into the canonical compact format.\n" +
        "Normalized trace:\n" +
        "ERR TypeError cannot read id\n" +
        "CTX nextjs/react issues page\n" +
        "TOP src/app/issues/page.tsx:42:17 | src/app/issues/page.tsx:88:12\n" +
        "FRAMES renderIssue@src/app/issues/page.tsx:42:17 > IssuePage@src/app/issues/page.tsx:88:12\n" +
        "SIG pnpm lint failed",
    },
    expectedTokens: 135,
  },
  {
    name: "synthesis-prompt",
    input: {
      kind: "prompt",
      text:
        "Task: merge the candidate compact rewrites into the single best ultra-minified canonical diagnostic output.\n" +
        "Return plain text only.\n\n" +
        "Normalized trace:\n" +
        "ERR cspell 12 issues/6 files\n" +
        "CTX cspell/vp/pre-commit\n" +
        "TOP AGENTS.md:11:64 | src/env/sentry-server.ts:31:40 | src/server/sentry-tunnel.ts:9:10\n" +
        "ISSUES cspell 12 issues/6 files (199 checked) ; AGENTS.md:11:64 unknown(scifi) ; src/env/sentry-server.ts:31:40 unknown(Dsns) ; +9 more\n" +
        "SIG cspell lint --no-progress --config .cspell/cspell.json failed ; vp check --fix killed ; pre-commit failed (code 1)\n" +
        "NOISE duplicate signal lines x5\n\n" +
        "Candidate rewrites:\n" +
        "Candidate 1 (compress-min):\n" +
        "ERR cspell 12 issues/6 files",
    },
    expectedTokens: 184,
  },
  {
    name: "unicode-mixed",
    input:
      "TypeError: café route failed 🚨\n" +
      "    at 測試 (src/app/naïve.ts:12:3)\n" +
      "    at renderEmoji (src/components/rocket.tsx:7:1)",
    expectedTokens: 43,
  },
]

function accuracy(actual: number, expected: number): number {
  if (expected <= 0) return 1
  return 1 - Math.abs(actual - expected) / expected
}

let totalAccuracy = 0
let worstAccuracy = 1

for (const fixture of FIXTURES) {
  const estimated = estimateTokenCountFast(fixture.input)
  const score = accuracy(estimated, fixture.expectedTokens)
  totalAccuracy += score
  worstAccuracy = Math.min(worstAccuracy, score)
  console.log(
    [
      fixture.name.padEnd(20),
      `expected=${String(fixture.expectedTokens).padStart(4)}`,
      `estimated=${String(estimated).padStart(4)}`,
      `accuracy=${(score * 100).toFixed(1)}%`,
    ].join("  ")
  )
}

const meanAccuracy = totalAccuracy / FIXTURES.length

console.log("")
console.log(`mean accuracy: ${(meanAccuracy * 100).toFixed(1)}%`)
console.log(`worst fixture: ${(worstAccuracy * 100).toFixed(1)}%`)

if (meanAccuracy < 0.9 || worstAccuracy < 0.85) {
  console.error(
    "fast token heuristic fell below the calibration threshold " +
      "(mean >= 90%, worst >= 85%)."
  )
  process.exitCode = 1
}
