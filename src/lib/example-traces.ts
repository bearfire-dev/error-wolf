export type StackTraceExample = {
  id: string
  title: string
  content: string
}

/**
 * Cloudflare Workers have no filesystem, so `examples/*.txt` is inlined at
 * build time instead of read from disk on each request. Glob keys are
 * repo-relative paths; the id stays the bare filename, as under `readdirSync`.
 */
const exampleFiles = import.meta.glob<string>("../../examples/*.txt", {
  query: "?raw",
  import: "default",
  eager: true,
})

function titleFromBasename(basename: string): string {
  const base = basename.replace(/\.txt$/i, "")
  return base
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
}

const stackTraceExamples: StackTraceExample[] = Object.entries(exampleFiles)
  .map(([filePath, content]) => {
    const filename = filePath.slice(filePath.lastIndexOf("/") + 1)
    return {
      id: filename,
      title: titleFromBasename(filename),
      content,
    }
  })
  .sort((a, b) => a.id.localeCompare(b.id))

export function loadStackTraceExamples(): StackTraceExample[] {
  return stackTraceExamples
}
