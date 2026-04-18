import { clearConsent } from "@/lib/consent"
import { clearHuntMode } from "@/lib/hunt-mode"
import { clearOpenRouterKeyCookie } from "@/lib/openrouter-key-cookie"
import { clearRecentResults } from "@/lib/recent-results"

export function clearAll(): void {
  clearOpenRouterKeyCookie()
  clearConsent()
  clearHuntMode()
  clearRecentResults()
}
