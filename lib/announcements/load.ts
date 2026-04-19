import { readFileSync } from "fs"
import { join } from "path"
import { cache } from "react"

import { parseAnnouncementsFile } from "@/lib/announcements/parse"

const FILE = join(process.cwd(), "content", "announcements.md")

/** Server-only: reads `content/announcements.md` once per request (deduped via `cache`). */
export const getAnnouncementsFeed = cache(() => {
  try {
    const raw = readFileSync(FILE, "utf8")
    return parseAnnouncementsFile(raw)
  } catch {
    return { lastUpdatedMs: 0, body: "" }
  }
})
