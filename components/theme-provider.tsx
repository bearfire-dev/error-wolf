"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes"
import { useEffect } from "react"

const LIGHT_UI_FAVICON = "/favicon-light.ico"
const DARK_UI_FAVICON = "/favicon-dark.ico"

/** Swaps tab favicon when `next-themes` resolved theme changes (class-based, not media). */
function ThemeFaviconSync() {
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    if (!resolvedTheme) {
      return
    }
    const href = resolvedTheme === "dark" ? DARK_UI_FAVICON : LIGHT_UI_FAVICON
    for (const link of document.querySelectorAll<HTMLLinkElement>(
      'link[rel="icon"]'
    )) {
      const h = link.getAttribute("href") ?? ""
      if (h.includes("favicon-light") || h.includes("favicon-dark")) {
        link.href = href
      }
    }
  }, [resolvedTheme])

  return null
}

function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      <ThemeFaviconSync />
      {children}
    </NextThemesProvider>
  )
}

export { ThemeProvider }
