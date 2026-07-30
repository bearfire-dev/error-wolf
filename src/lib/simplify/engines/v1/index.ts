import { V1_PIPELINE_DAG } from "./dag"
import { runV1Pipeline } from "./pipeline"
import {
  prepareV1RoutingEstimate,
  estimateV1QueryTotalTokens,
} from "./routing-estimate"
import {
  V1_DEFAULT_MODEL_ROUTE_ID,
  V1_MODEL_ROUTE_OPTIONS,
  resolveV1ModelRoute,
} from "./router"

import type { SimplifyEngineDefinition } from "../types"

export const simplifyEngineV1: SimplifyEngineDefinition = {
  id: "v1",
  label: "v1",
  description: "Default parallel OpenRouter compression pipeline.",
  dag: V1_PIPELINE_DAG,
  defaultModelRouteId: V1_DEFAULT_MODEL_ROUTE_ID,
  modelRouteOptions: V1_MODEL_ROUTE_OPTIONS,
  prepareRoutingEstimate: prepareV1RoutingEstimate,
  estimateRoutingTotalTokens: estimateV1QueryTotalTokens,
  resolveModelRoute: resolveV1ModelRoute,
  run: runV1Pipeline,
}

export { V1_PIPELINE_DAG } from "./dag"
export { runV1Pipeline } from "./pipeline"
