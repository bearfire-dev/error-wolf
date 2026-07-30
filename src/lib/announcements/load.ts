import updatesMarkdown from "../../../content/updates.md?raw"

import { parseAnnouncementsFile } from "@/lib/announcements/parse"

/**
 * Cloudflare Workers have no filesystem, so `content/updates.md` is inlined at
 * build time and parsed once per module instance. That replaces the per-request
 * `readFileSync` and its React `cache` wrapper.
 */
const announcementsFeed = parseAnnouncementsFile(updatesMarkdown)

export function getAnnouncementsFeed() {
  return announcementsFeed
}
