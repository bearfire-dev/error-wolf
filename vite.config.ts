import { cloudflare } from "@cloudflare/vite-plugin"
import babel from "@rolldown/plugin-babel"
import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { imagetools } from "vite-imagetools"

/**
 * Source maps are only built when `pnpm sourcemaps:upload` can send them to
 * PostHog. The repo is public, so the two upload variables stay CI-only and a
 * local build must still succeed without them (see `.env.example`).
 */
const shouldBuildSourcemaps = Boolean(
  process.env.POSTHOG_CLI_API_KEY && process.env.POSTHOG_CLI_ENV_ID
)

export default defineConfig({
  /** Next.js used port 3000; keep the same local URL. `host` also binds 127.0.0.1. */
  server: {
    port: 3000,
    host: true,
  },
  preview: {
    port: 3000,
    host: true,
  },
  build: {
    sourcemap: shouldBuildSourcemaps,
  },
  /** Resolves the `@/*` alias from tsconfig.json in every environment. */
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    imagetools(),
    tanstackStart(),
    viteReact(),
    // React Compiler, in place of the Next `reactCompiler: true` option.
    // @vitejs/plugin-react v6 transforms with Oxc, so the compiler runs
    // through the Rolldown Babel bridge.
    babel({ presets: [reactCompilerPreset({ target: "19" })] }),
  ],
})
