// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import { initBotId } from "botid/client/core"
import * as Sentry from "@sentry/nextjs"

import { getSentryDsn, getSentryInitEnvironment } from "./lib/sentry-dsn"
import {
  sentryFeedbackThemeDark,
  sentryFeedbackThemeLight,
} from "./lib/sentry-feedback-theme"

if (process.env.NODE_ENV !== "development") {
  initBotId({
    protect: [
      {
        path: "/anonymous-tea",
        method: "POST",
        advancedOptions: { checkLevel: "basic" },
      },
    ],
  })
}

// Needs the HTTPS DSN URL in NEXT_PUBLIC_SENTRY_DSN — see .env.example
const dsn = getSentryDsn()
if (dsn) {
  Sentry.init({
    dsn,
    tunnel: "/anonymous-tea",
    environment: getSentryInitEnvironment(),

    // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
    tracesSampleRate: 1,
    // Enable logs to be sent to Sentry
    enableLogs: true,

    // Anonymous mode: do not send cookies, IP, or other default PII
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
    sendDefaultPii: false,

    integrations: [
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

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
