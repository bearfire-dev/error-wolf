"use client"

import { useCallback, useState } from "react"

import {
  COST_REFERENCE_MODELS,
  DEFAULT_COST_REFERENCE_MODEL_ID,
  type CostReferenceModel,
  type CostReferenceModelId,
  nextCostReferenceModelId,
  readCostReferenceModelPreference,
  writeCostReferenceModelPreference,
} from "@/lib/simplify/cost-reference-models"

export function useCostReferenceModel(): {
  model: CostReferenceModel
  cycleReferenceModel: () => void
} {
  const [selectedId, setSelectedId] = useState<CostReferenceModelId>(
    () => readCostReferenceModelPreference() ?? DEFAULT_COST_REFERENCE_MODEL_ID
  )

  const cycleReferenceModel = useCallback(() => {
    setSelectedId((prev) => {
      const next = nextCostReferenceModelId(prev)
      writeCostReferenceModelPreference(next)
      return next
    })
  }, [])

  return {
    model: COST_REFERENCE_MODELS[selectedId],
    cycleReferenceModel,
  }
}
