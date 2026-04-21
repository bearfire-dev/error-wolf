"use client"

// snapshot: not imported — see README.md in this folder.

import * as React from "react"
import { useTheme } from "next-themes"

import {
  bgPhotoStorageKey,
  clampBgPhotoTune,
  parseBgPhotoTune,
  type BgPhotoThemeKey,
  type BgPhotoTune,
  tuneToCssVars,
  BG_PHOTO_DEFAULT_DARK,
  BG_PHOTO_DEFAULT_LIGHT,
} from "@/lib/bg-photo-tune"

type BgPhotoTuneContextValue = {
  themeKey: BgPhotoThemeKey
  tune: BgPhotoTune
  setTune: (next: BgPhotoTune) => void
  patchTune: (patch: Partial<BgPhotoTune>) => void
  resetTune: () => void
}

const BgPhotoTuneContext = React.createContext<BgPhotoTuneContextValue | null>(
  null
)

function applyTuneToDocument(tune: BgPhotoTune) {
  const root = document.documentElement
  for (const [key, value] of Object.entries(tuneToCssVars(tune))) {
    root.style.setProperty(key, value)
  }
}

function readStoredTune(theme: BgPhotoThemeKey): BgPhotoTune {
  if (typeof window === "undefined") {
    return theme === "dark" ? BG_PHOTO_DEFAULT_DARK : BG_PHOTO_DEFAULT_LIGHT
  }
  const raw = window.sessionStorage.getItem(bgPhotoStorageKey(theme))
  const partial = parseBgPhotoTune(raw)
  return clampBgPhotoTune(theme, partial ?? {})
}

function writeStoredTune(theme: BgPhotoThemeKey, tune: BgPhotoTune) {
  window.sessionStorage.setItem(bgPhotoStorageKey(theme), JSON.stringify(tune))
}

export function BgPhotoTuneProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { resolvedTheme } = useTheme()
  const hydrated = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  const themeKey: BgPhotoThemeKey =
    hydrated && resolvedTheme === "dark" ? "dark" : "light"

  const [tune, setTuneState] = React.useState<BgPhotoTune>(
    BG_PHOTO_DEFAULT_LIGHT
  )

  const prevThemeKeyRef = React.useRef<BgPhotoThemeKey | null>(null)

  React.useLayoutEffect(() => {
    if (!hydrated) return
    const themeChanged =
      prevThemeKeyRef.current === null || prevThemeKeyRef.current !== themeKey
    prevThemeKeyRef.current = themeKey
    if (themeChanged) {
      const next = readStoredTune(themeKey)
      setTuneState(next)
      applyTuneToDocument(next)
      return
    }
    applyTuneToDocument(tune)
  }, [hydrated, themeKey, tune])

  const setTune = React.useCallback(
    (next: BgPhotoTune) => {
      const clamped = clampBgPhotoTune(themeKey, next)
      setTuneState(clamped)
      writeStoredTune(themeKey, clamped)
    },
    [themeKey]
  )

  const patchTune = React.useCallback(
    (patch: Partial<BgPhotoTune>) => {
      setTuneState((prev) => {
        const merged = clampBgPhotoTune(themeKey, { ...prev, ...patch })
        writeStoredTune(themeKey, merged)
        return merged
      })
    },
    [themeKey]
  )

  const resetTune = React.useCallback(() => {
    const defaults =
      themeKey === "dark" ? BG_PHOTO_DEFAULT_DARK : BG_PHOTO_DEFAULT_LIGHT
    setTuneState(defaults)
    writeStoredTune(themeKey, defaults)
  }, [themeKey])

  const value = React.useMemo(
    () => ({ themeKey, tune, setTune, patchTune, resetTune }),
    [themeKey, tune, setTune, patchTune, resetTune]
  )

  return (
    <BgPhotoTuneContext.Provider value={value}>
      {children}
    </BgPhotoTuneContext.Provider>
  )
}

export function useBgPhotoTune() {
  const ctx = React.useContext(BgPhotoTuneContext)
  if (!ctx) {
    throw new Error("useBgPhotoTune must be used within BgPhotoTuneProvider")
  }
  return ctx
}
