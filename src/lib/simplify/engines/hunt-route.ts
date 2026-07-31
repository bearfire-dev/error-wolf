import {
  HUNT_OPENROUTER_AUTO_MINI_MAX_INPUT_TOKENS,
  HUNT_OPENROUTER_DEFAULT_MINI_MODEL_ID,
  HUNT_OPENROUTER_DEFAULT_MODEL_ID,
} from "@/lib/openrouter/hunt-routing-config"

import type {
  SimplifyModelRouteOption,
  SimplifyResolvedModelRoute,
} from "./types"

export const HUNT_AUTO_ROUTER_LABEL = "Auto"
export const HUNT_DEFAULT_MODEL_ROUTE_ID = "auto"
export const HUNT_DEFAULT_MODEL_DISPLAY_NAME = "v1"
export const HUNT_DEFAULT_MINI_MODEL_DISPLAY_NAME = "v1-mini"

export const HUNT_MODEL_ROUTE_OPTIONS: readonly SimplifyModelRouteOption[] = [
  { id: "auto", label: HUNT_AUTO_ROUTER_LABEL },
  { id: "v1", label: HUNT_DEFAULT_MODEL_DISPLAY_NAME },
  { id: "v1-mini", label: HUNT_DEFAULT_MINI_MODEL_DISPLAY_NAME },
]

export function resolveHuntModelRoute(
  routeId: string | null | undefined,
  inputTokens: number | null
): SimplifyResolvedModelRoute {
  if (routeId === "v1-mini") {
    return {
      routeId: "v1-mini",
      engineId: "v1-mini",
      routerLabel: HUNT_DEFAULT_MINI_MODEL_DISPLAY_NAME,
      modelLabel: HUNT_DEFAULT_MINI_MODEL_DISPLAY_NAME,
      targetLabel: HUNT_DEFAULT_MINI_MODEL_DISPLAY_NAME,
      modelId: HUNT_OPENROUTER_DEFAULT_MINI_MODEL_ID,
    }
  }

  if (routeId === "v1") {
    return {
      routeId: "v1",
      engineId: "v1",
      routerLabel: HUNT_DEFAULT_MODEL_DISPLAY_NAME,
      modelLabel: HUNT_DEFAULT_MODEL_DISPLAY_NAME,
      targetLabel: HUNT_DEFAULT_MODEL_DISPLAY_NAME,
      modelId: HUNT_OPENROUTER_DEFAULT_MODEL_ID,
    }
  }

  if (
    inputTokens !== null &&
    inputTokens < HUNT_OPENROUTER_AUTO_MINI_MAX_INPUT_TOKENS
  ) {
    return {
      routeId: "auto",
      engineId: "v1-mini",
      routerLabel: HUNT_AUTO_ROUTER_LABEL,
      modelLabel: HUNT_DEFAULT_MINI_MODEL_DISPLAY_NAME,
      targetLabel: HUNT_DEFAULT_MINI_MODEL_DISPLAY_NAME,
      modelId: HUNT_OPENROUTER_DEFAULT_MINI_MODEL_ID,
    }
  }

  return {
    routeId: "auto",
    engineId: "v1",
    routerLabel: HUNT_AUTO_ROUTER_LABEL,
    modelLabel: HUNT_DEFAULT_MODEL_DISPLAY_NAME,
    targetLabel: HUNT_DEFAULT_MODEL_DISPLAY_NAME,
    modelId: HUNT_OPENROUTER_DEFAULT_MODEL_ID,
  }
}
