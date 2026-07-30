import { cloudflare } from "@cloudflare/vite-plugin"
import { sentryVitePlugin } from "@sentry/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { imagetools } from "vite-imagetools"

/**
 * Source maps are only built when they can be uploaded. The repo is public, so
 * the three Sentry build variables stay CI-only and a local build must still
 * succeed without them (see `.env.example`).
 */
const shouldUploadSentrySourcemaps = Boolean(
  process.env.SENTRY_AUTH_TOKEN &&
    process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT
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
    sourcemap: shouldUploadSentrySourcemaps,
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    imagetools(),
    tanstackStart(),
    viteReact({
      babel: {
        plugins: [["babel-plugin-react-compiler", { target: "19" }]],
      },
    }),
    shouldUploadSentrySourcemaps &&
      sentryVitePlugin({
        authToken: process.env.SENTRY_AUTH_TOKEN,
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        telemetry: false,
      }),
  ],
})
