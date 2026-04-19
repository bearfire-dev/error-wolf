import { simplifyEngineV1 } from "@/lib/simplify/engines/v1"
import { simplifyEngineV1Mini } from "@/lib/simplify/engines/v1-mini"

import {
  isSimplifyEngineId,
  type SimplifyEngineDefinition,
  type SimplifyEngineId,
} from "./types"

export const SIMPLIFY_ENGINES: readonly SimplifyEngineDefinition[] = [
  simplifyEngineV1,
  simplifyEngineV1Mini,
]

export const DEFAULT_SIMPLIFY_ENGINE_ID: SimplifyEngineId = simplifyEngineV1.id

const ENGINE_BY_ID = new Map(
  SIMPLIFY_ENGINES.map((engine) => [engine.id, engine])
)

export function listSimplifyEngines(): readonly SimplifyEngineDefinition[] {
  return SIMPLIFY_ENGINES
}

export function getSimplifyEngine(
  id?: SimplifyEngineId | string | null
): SimplifyEngineDefinition {
  if (id && isSimplifyEngineId(id)) {
    return ENGINE_BY_ID.get(id) ?? simplifyEngineV1
  }

  return simplifyEngineV1
}
