import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
    restoreMocks: true,
    clearMocks: true,
  },
})
