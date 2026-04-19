import fs from "node:fs"
import path from "node:path"

export type StackTraceExample = {
  id: string
  title: string
  content: string
}

function titleFromBasename(basename: string): string {
  const base = basename.replace(/\.txt$/i, "")
  return base
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
}

/** Reads `examples/*.txt` at request time (server-only import). */
export function loadStackTraceExamples(): StackTraceExample[] {
  const dir = path.join(process.cwd(), "examples")
  if (!fs.existsSync(dir)) return []

  const names = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".txt"))
    .sort((a, b) => a.localeCompare(b))

  return names.map((filename) => ({
    id: filename,
    title: titleFromBasename(filename),
    content: fs.readFileSync(path.join(dir, filename), "utf8"),
  }))
}
