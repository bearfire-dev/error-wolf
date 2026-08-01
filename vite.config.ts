import { cloudflare } from "@cloudflare/vite-plugin"
import babel from "@rolldown/plugin-babel"
import { sentryVitePlugin } from "@sentry/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { imagetools } from "vite-imagetools"

import { SENTRY_ORG, SENTRY_PROJECT } from "./src/lib/sentry/constants.js"

/**
 * Source maps are only built when they can be uploaded to Sentry, because the
 * plugin deletes them afterwards and a shipped `sourceMappingURL` pointing at a
 * deleted file would 404. The repo is public, so the token stays out of it and
 * a build without one still succeeds (see `.env.example`).
 */
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN

/** Cloudflare Workers Builds sets the first; GitHub Actions sets the second. */
const release =
  process.env.WORKERS_CI_COMMIT_SHA ?? process.env.GITHUB_SHA ?? null

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
    sourcemap: sentryAuthToken ? "hidden" : false,
  },
  define: {
    __SENTRY_RELEASE__: JSON.stringify(release),
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
    // Last on purpose: it injects debug IDs at chunk-render time and uploads on
    // close, after the Cloudflare plugin has written `dist/server`.
    sentryVitePlugin({
      org: SENTRY_ORG,
      project: SENTRY_PROJECT,
      authToken: sentryAuthToken,
      disable: !sentryAuthToken,
      telemetry: false,
      release: { name: release ?? undefined },
      sourcemaps: { filesToDeleteAfterUpload: ["dist/**/*.js.map"] },
    }),
  ],
})
