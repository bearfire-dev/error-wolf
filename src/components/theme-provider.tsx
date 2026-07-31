import * as React from "react"

export type Theme = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"

/** Read by the pre-paint script and by `setTheme`. Same key next-themes used. */
export const THEME_STORAGE_KEY = "theme"

/**
 * Runs before first paint, so a dark-mode user never sees a light flash. It
 * must stay dependency-free and synchronous: React has not hydrated yet.
 * `globals.css` keys `@custom-variant dark` off the `.dark` class, so the class
 * contract is the one next-themes used.
 */
export const themeBootstrapScript = `
(function () {
  try {
    var stored = window.localStorage.getItem("${THEME_STORAGE_KEY}")
    var theme = stored === "light" || stored === "dark" ? stored : null
    if (!theme) {
      theme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
    }
    document.documentElement.classList.toggle("dark", theme === "dark")
    document.documentElement.style.colorScheme = theme
  } catch (e) {}
})()
`

type ThemeContextValue = {
  /** The user's choice. `system` follows the operating system. */
  theme: Theme
  /** What is applied right now. `undefined` until hydration completes. */
  resolvedTheme: ResolvedTheme | undefined
  setTheme: (theme: Theme) => void
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

function prefersDark(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system"
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored
    }
  } catch {
    // private mode or blocked storage
  }
  return "system"
}

/**
 * Equivalent of `disableTransitionOnChange` in next-themes: suppress CSS
 * transitions for one frame so the palette swap is instant and not a slow
 * cross-fade.
 */
function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement
  const style = document.createElement("style")
  style.appendChild(
    document.createTextNode("*,*::before,*::after{transition:none !important}")
  )
  document.head.appendChild(style)

  root.classList.toggle("dark", resolved === "dark")
  root.style.colorScheme = resolved

  // Force a reflow so the override is observed, then drop it.
  void window.getComputedStyle(style).opacity
  document.head.removeChild(style)
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>("system")
  const [resolvedTheme, setResolvedTheme] = React.useState<
    ResolvedTheme | undefined
  >(undefined)

  // The bootstrap script already set the class, so this only syncs React state
  // to what is on screen. There is nothing to apply on mount.
  React.useEffect(() => {
    const stored = readStoredTheme()
    setThemeState(stored)
    setResolvedTheme(
      stored === "system" ? (prefersDark() ? "dark" : "light") : stored
    )
  }, [])

  React.useEffect(() => {
    if (theme !== "system") return

    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => {
      const next: ResolvedTheme = media.matches ? "dark" : "light"
      setResolvedTheme(next)
      applyTheme(next)
    }

    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [theme])

  const setTheme = React.useCallback((next: Theme) => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // private mode or blocked storage
    }
    const resolved: ResolvedTheme =
      next === "system" ? (prefersDark() ? "dark" : "light") : next
    setThemeState(next)
    setResolvedTheme(resolved)
    applyTheme(resolved)
  }, [])

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme]
  )

  return <ThemeContext value={value}>{children}</ThemeContext>
}

function useTheme(): ThemeContextValue {
  const context = React.useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider")
  }
  return context
}

export { ThemeProvider, useTheme }
