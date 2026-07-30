import * as Sentry from "@sentry/react"
import type { AnyRouter } from "@tanstack/react-router"

import { getSentryDsn, getSentryInitEnvironment } from "@/lib/sentry-dsn"
import {
  sentryFeedbackThemeDark,
  sentryFeedbackThemeLight,
} from "@/lib/sentry-feedback-theme"

let initialized = false

/**
 * Browser Sentry. Needs the HTTPS DSN URL in VITE_SENTRY_DSN — see .env.example.
 * Events go through the `/anonymous-tea` tunnel, not direct ingest, so an ad
 * blocker that filters `sentry.io` does not drop them.
 *
 * The router integration replaces `Sentry.captureRouterTransitionStart`, which
 * only existed in `@sentry/nextjs`.
 */
export function initBrowserSentry(router: AnyRouter): void {
  if (initialized) return

  const dsn = getSentryDsn()
  if (!dsn) return

  initialized = true

  Sentry.init({
    dsn,
    tunnel: "/anonymous-tea",
    environment: getSentryInitEnvironment(),

    // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
    tracesSampleRate: 1,
    // Enable logs to be sent to Sentry
    enableLogs: true,

    // Anonymous mode: do not send cookies, IP, or other default PII
    // https://docs.sentry.io/platforms/javascript/configuration/options/#sendDefaultPii
    sendDefaultPii: false,

    integrations: [
      Sentry.tanstackRouterBrowserTracingIntegration(router),
      Sentry.feedbackIntegration({
        autoInject: false,
        colorScheme: "system",
        themeLight: sentryFeedbackThemeLight,
        themeDark: sentryFeedbackThemeDark,
        formTitle: "Feedback",
        submitButtonLabel: "Send",
        messagePlaceholder: "Describe the issue or suggestion.",
        showBranding: true,
      }),
    ],
  })
}
