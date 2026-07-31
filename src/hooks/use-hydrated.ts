import { useSyncExternalStore } from "react"

const subscribe = () => () => {}

/**
 * `false` during SSR and on the first client render, `true` afterwards. Use it
 * to hold back markup that must not appear in the server HTML — the equivalent
 * of `next/dynamic` with `ssr: false`.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
}
