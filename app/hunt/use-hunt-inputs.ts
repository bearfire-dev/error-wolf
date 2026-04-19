"use client"

import { useCallback, useState } from "react"

import {
  DEFAULT_SIMPLIFY_ENGINE_ID,
  type SimplifyEngineId,
} from "@/lib/simplify/engines/types"

export type HuntInputState = {
  apiKey: string
  rawInput: string
  engineId: SimplifyEngineId
  modelRouteId: string
}

const INITIAL_INPUT_STATE: HuntInputState = {
  apiKey: "",
  rawInput: "",
  engineId: DEFAULT_SIMPLIFY_ENGINE_ID,
  modelRouteId: "auto",
}

export function useHuntInputs() {
  const [input, setInput] = useState<HuntInputState>(INITIAL_INPUT_STATE)

  const hydrate = useCallback(
    (
      next: Partial<
        Pick<HuntInputState, "apiKey" | "engineId" | "modelRouteId">
      >
    ) => {
      setInput((current) => ({ ...current, ...next }))
    },
    []
  )

  const setApiKey = useCallback((apiKey: string) => {
    setInput((current) => ({ ...current, apiKey }))
  }, [])

  const setEngineId = useCallback((engineId: SimplifyEngineId) => {
    setInput((current) => ({ ...current, engineId }))
  }, [])

  const setModelRouteId = useCallback((modelRouteId: string) => {
    setInput((current) => ({ ...current, modelRouteId }))
  }, [])

  const setRawInput = useCallback((rawInput: string) => {
    setInput((current) => ({ ...current, rawInput }))
  }, [])

  const clearApiKey = useCallback(() => {
    setInput((current) => ({ ...current, apiKey: "" }))
  }, [])

  const clearRawInput = useCallback(() => {
    setInput((current) => ({ ...current, rawInput: "" }))
  }, [])

  return {
    input,
    hydrate,
    setApiKey,
    setEngineId,
    setModelRouteId,
    clearApiKey,
    setRawInput,
    clearRawInput,
  }
}
