import { withBotId } from "botid/next/config"
import { withSentryConfig } from "@sentry/nextjs"

/**
 * Deploy (Vercel): enable BotID for the project; keep Deep Analysis off for Basic-only
 * (no per-checkBotId Deep charges). Optional WAF rule on `/anonymous-tea` for rate limits.
 * Confirm traffic in Firewall observability (BotID filter). See
 * https://vercel.com/docs/botid
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  cacheComponents: true,
  experimental: {
    viewTransition: true,
  },
  images: {
    // Only AVIF/WebP are valid here (Next 16 schema). Clients whose Accept
    // header does not match get optimized output as JPEG (or upstream type).
    formats: ["image/avif", "image/webp"],
    qualities: [25, 35, 45, 55, 60, 65, 75, 85, 90, 100],
  },
}

const sentryOrg = process.env.SENTRY_ORG?.trim()
const sentryProject = process.env.SENTRY_PROJECT?.trim()

export default withSentryConfig(withBotId(nextConfig), {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  // Source maps / releases: set in .env together with SENTRY_AUTH_TOKEN (see .env.example)
  ...(sentryOrg && sentryProject
    ? { org: sentryOrg, project: sentryProject }
    : {}),

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Sentry tunnel: `tunnelRoute` is omitted so requests hit `app/anonymous-tea/route.ts`
  // (BotID + DSN allowlist) instead of a direct ingest rewrite. Client uses `tunnel` in
  // `instrumentation-client.ts`. Exclude `/anonymous-tea` from middleware if you add any.

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
})
