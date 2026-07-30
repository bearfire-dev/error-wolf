import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

/**
 * Kept separate from `vite.config.ts`: the app config loads the Cloudflare and
 * TanStack Start plugins, which the `lib/` unit tests do not need and which
 * would run the suite inside the Workers runtime.
 */
export default defineConfig({
  test: {
    environment: "node",
    alias: {
      "@": fileURLToPath(new URL("./src/", import.meta.url)),
    },
    include: ["src/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    clearMocks: true,
    /** A promise that never settles must fail the run, not stall it. */
    testTimeout: 10_000,
  },
})
