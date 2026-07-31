import { Moon02Icon, Sun02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { useHydrated } from "@/hooks/use-hydrated"

export function SiteHeaderThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const hydrated = useHydrated()

  if (!hydrated) {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        disabled
        aria-hidden
        className="pointer-events-none opacity-40"
      >
        <HugeiconsIcon icon={Moon02Icon} strokeWidth={2} />
      </Button>
    )
  }

  const isDark = resolvedTheme === "dark"
  const themeLabel = isDark ? "Switch to light theme" : "Switch to dark theme"

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={themeLabel}
      title={themeLabel}
    >
      <HugeiconsIcon icon={isDark ? Sun02Icon : Moon02Icon} strokeWidth={2} />
    </Button>
  )
}
