import { clearConsent } from "@/lib/consent"
import { clearHuntComputeVersion } from "@/lib/hunt-compute-version"
import { clearHuntModelRouteId } from "@/lib/hunt-model-route"
import { clearHuntMode } from "@/lib/hunt-mode"
import { clearOpenRouterKeyCookie } from "@/lib/openrouter-key-cookie"
import { clearRecentResults } from "@/lib/recent-results"

export function clearAll(): void {
  clearOpenRouterKeyCookie()
  clearConsent()
  clearHuntComputeVersion()
  clearHuntModelRouteId()
  clearHuntMode()
  clearRecentResults()
}
