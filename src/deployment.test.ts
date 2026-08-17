import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

const root = new URL("../", import.meta.url)

async function read(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, root), "utf8")
}

describe("Alchemy deployment contracts", () => {
  it("keeps the existing Worker identity and runtime settings", async () => {
    const stack = await read("alchemy.run.ts")

    expect(stack).toContain('Cloudflare.Website.Vite("ErrorWolf"')
    expect(stack).toContain('name: "error-wolf"')
    expect(stack).toContain(
      'compatibility: { date: "2026-07-30", flags: ["nodejs_compat"] }'
    )
    expect(stack).toContain("state: Cloudflare.state()")
    expect(stack).toContain('stage !== "prod"')
    expect(stack).toContain("retain()")
  })

  it("keeps pull requests plan-only and production behind successful CI", async () => {
    const workflow = await read(".github/workflows/deploy.yml")

    expect(workflow).toContain('workflows: ["CI"]')
    expect(workflow).toContain(
      "github.event.workflow_run.event == 'pull_request'"
    )
    expect(workflow).toContain("pnpm exec alchemy plan")
    expect(workflow).toContain("alchemy plan --stage prod")
    expect(workflow).toContain("github.event.workflow_run.event == 'push'")
    expect(workflow).toContain("pnpm exec alchemy deploy")
    expect(workflow).not.toContain("alchemy destroy")
  })
})
