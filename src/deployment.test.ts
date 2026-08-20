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
    const ci = await read(".github/workflows/ci.yml")
    const deploy = await read(".github/workflows/deploy.yml")

    expect(ci).toContain("github.event_name == 'pull_request'")
    expect(ci).toContain("pnpm exec alchemy plan")
    expect(ci).toContain("alchemy plan --stage prod")
    expect(ci).toContain("ALCHEMY_STATE_STORE_CREDENTIALS")
    expect(ci).toContain("ALCHEMY_PROFILE: ci")
    expect(ci).not.toContain("alchemy deploy")
    expect(ci).not.toContain("alchemy destroy")

    expect(deploy).toContain('workflows: ["CI"]')
    expect(deploy).toContain("github.event.workflow_run.event == 'push'")
    expect(deploy).toContain("pnpm exec alchemy deploy")
    expect(deploy).not.toContain("alchemy plan")
    expect(deploy).not.toContain("alchemy destroy")
  })
})
