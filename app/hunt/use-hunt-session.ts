"use client"

import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import { useRouter } from "next/navigation"

import { hasConsent } from "@/lib/consent"
import type { HuntStep } from "@/lib/hunt-constants"
import {
  clearOpenRouterKeyCookie,
  getOpenRouterKeyFromCookie,
  setOpenRouterKeyCookie,
} from "@/lib/openrouter-key-cookie"
import { verifyOpenRouterKey } from "@/lib/openrouter/verify"
import { readHuntComputeVersion } from "@/lib/hunt-compute-version"
import { readHuntModelRouteId } from "@/lib/hunt-model-route"
import {
  getRecentResults,
  getStats,
  type SimplifyStats,
} from "@/lib/recent-results"

import type { HuntInputState } from "./use-hunt-inputs"

type VerifyState = "idle" | "ok" | "bad"

type UseHuntSessionArgs = {
  /** From server `cookies()` — avoids gating the whole UI on client storage reads. */
  initialHasOpenRouterKey: boolean
  apiKey: HuntInputState["apiKey"]
  hydrateInput: (
    next: Partial<Pick<HuntInputState, "apiKey" | "engineId" | "modelRouteId">>
  ) => void
  setApiKey: (value: string) => void
  clearApiKey: () => void
}

const INITIAL_STATS: SimplifyStats = {
  count: 0,
  current: null,
  all: null,
}

export function useHuntSession({
  initialHasOpenRouterKey,
  apiKey,
  hydrateInput,
  setApiKey,
  clearApiKey,
}: UseHuntSessionArgs) {
  const router = useRouter()

  const [step, setStep] = useState<HuntStep>(() =>
    initialHasOpenRouterKey ? "input" : "key"
  )
  const [stats, setStats] = useState<SimplifyStats>(INITIAL_STATS)
  const [keyOk, setKeyOk] = useState(() => initialHasOpenRouterKey)
  const [verifyState, setVerifyState] = useState<VerifyState>("idle")
  const [verifying, setVerifying] = useState(false)
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null)

  const verifyTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (verifyTimeoutRef.current !== null) {
        window.clearTimeout(verifyTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!hasConsent()) {
      router.replace("/")
      return
    }

    const saved = getOpenRouterKeyFromCookie()
    const engineId = readHuntComputeVersion()
    const modelRouteId = readHuntModelRouteId()
    const hasKey = Boolean(saved.trim())

    startTransition(() => {
      hydrateInput({ apiKey: saved, engineId, modelRouteId })
      setKeyOk(hasKey)
      setStats(getStats(getRecentResults()))
      setStep(hasKey ? "input" : "key")
    })
  }, [hydrateInput, router])

  const updateApiKey = useCallback(
    (value: string) => {
      setApiKey(value)
      setVerifyState("idle")
      setKeyOk(false)
      setVerifyMessage(null)
    },
    [setApiKey]
  )

  const verifyKey = useCallback(async () => {
    if (verifyTimeoutRef.current !== null) {
      window.clearTimeout(verifyTimeoutRef.current)
      verifyTimeoutRef.current = null
    }

    setVerifying(true)
    setVerifyState("idle")
    setVerifyMessage(null)

    try {
      const ok = await verifyOpenRouterKey(apiKey)
      if (ok) {
        setOpenRouterKeyCookie(apiKey)
        setKeyOk(true)
        setVerifyState("ok")
        setVerifyMessage(null)
        verifyTimeoutRef.current = window.setTimeout(() => {
          setStep("input")
        }, 350)
      } else {
        setKeyOk(false)
        setVerifyState("bad")
        setVerifyMessage("OpenRouter rejected this API key.")
      }
    } catch (error) {
      console.error("[hunt] OpenRouter key verification failed", error, {
        hasApiKey: Boolean(apiKey.trim()),
      })
      setKeyOk(false)
      setVerifyState("bad")
      setVerifyMessage(
        error instanceof Error
          ? error.message
          : "OpenRouter verification failed."
      )
    } finally {
      setVerifying(false)
    }
  }, [apiKey])

  const clearKey = useCallback(() => {
    clearOpenRouterKeyCookie()
    clearApiKey()
    setKeyOk(false)
    setVerifyState("idle")
    setVerifyMessage(null)
  }, [clearApiKey])

  return {
    step,
    setStep,
    stats,
    setStats,
    keyOk,
    verifyState,
    verifyMessage,
    verifying,
    updateApiKey,
    verifyKey,
    clearKey,
  }
}
