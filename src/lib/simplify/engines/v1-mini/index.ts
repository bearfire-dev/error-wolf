import { V1_MINI_PIPELINE_DAG } from "./dag"
import { runV1MiniPipeline } from "./pipeline"
import {
  estimateV1MiniQueryTotalTokens,
  prepareV1MiniRoutingEstimate,
} from "./routing-estimate"
import {
  V1_MINI_DEFAULT_MODEL_ROUTE_ID,
  V1_MINI_MODEL_ROUTE_OPTIONS,
  resolveV1MiniModelRoute,
} from "./router"

import type { SimplifyEngineDefinition } from "../types"

export const simplifyEngineV1Mini: SimplifyEngineDefinition = {
  id: "v1-mini",
  label: "v1-mini",
  description:
    "Single-pass OpenRouter compression pipeline for smaller inputs.",
  dag: V1_MINI_PIPELINE_DAG,
  defaultModelRouteId: V1_MINI_DEFAULT_MODEL_ROUTE_ID,
  modelRouteOptions: V1_MINI_MODEL_ROUTE_OPTIONS,
  prepareRoutingEstimate: prepareV1MiniRoutingEstimate,
  estimateRoutingTotalTokens: estimateV1MiniQueryTotalTokens,
  resolveModelRoute: resolveV1MiniModelRoute,
  run: runV1MiniPipeline,
}

export { V1_MINI_PIPELINE_DAG } from "./dag"
export { runV1MiniPipeline } from "./pipeline"
