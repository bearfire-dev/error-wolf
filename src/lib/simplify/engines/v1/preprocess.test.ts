import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { preprocessV1Input } from "./preprocess"

const EXAMPLES_DIR = join(process.cwd(), "examples")

function readExamples(): Array<{ name: string; text: string }> {
  return readdirSync(EXAMPLES_DIR)
    .filter((name) => name.endsWith(".txt"))
    .sort()
    .map((name) => ({
      name,
      text: readFileSync(join(EXAMPLES_DIR, name), "utf8"),
    }))
}

describe("preprocessV1Input", () => {
  // Pins the full output over the shipped fixtures so the Set-based rewrites of
  // the deduplication paths are provably behavior-preserving.
  for (const example of readExamples()) {
    it(`produces stable output for ${example.name}`, () => {
      expect(preprocessV1Input(example.text)).toMatchSnapshot()
    })
  }

  it("returns empty text when every line is a divider", () => {
    const result = preprocessV1Input("=====\n-----\n*****\n")
    expect(result.text).toBe("")
    expect(result.removedDividerCount).toBe(3)
  })

  it("keeps the first occurrence and order when deduplicating", () => {
    const result = preprocessV1Input(
      ["Error: beta failed", "Error: alpha failed", "Error: beta failed"].join(
        "\n"
      )
    )
    expect(result.lines).toEqual(["Error: beta failed", "Error: alpha failed"])
    expect(result.removedDuplicateCount).toBe(1)
  })

  it("caps context tags so a timestamped log cannot flood the CTX line", () => {
    const input = Array.from(
      { length: 40 },
      (_, i) => `[worker-${i}] Error: task ${i} failed`
    ).join("\n")

    const context = preprocessV1Input(input).context ?? ""
    const tagPart = context.split(" / ")[0] ?? ""
    // Capped list plus the "+N more" marker.
    expect(tagPart.split("/").length).toBeLessThanOrEqual(7)
    expect(tagPart).toContain("more")
  })

  it("stays fast on a large log whose every line has a unique prefix", () => {
    // The pathological shape for the old `Array.prototype.includes` membership
    // scans: context tags grew once per line, so the scan was quadratic.
    const input = Array.from(
      { length: 50_000 },
      (_, i) => `[12:34:${i}] Error: worker ${i} failed to start`
    ).join("\n")

    const startedAt = performance.now()
    preprocessV1Input(input)
    expect(performance.now() - startedAt).toBeLessThan(4_000)
  })
})
