import posthog from "posthog-js"

/**
 * Browser PostHog. Replaces the Sentry browser SDK and its `/anonymous-tea`
 * tunnel: `api_host` points at the Cloudflare reverse proxy, which is what now
 * keeps ingest on a first-party hostname.
 *
 * Anonymous only. Nothing in this app calls `posthog.identify`, and
 * `person_profiles: "identified_only"` means no person profile is created for
 * an anonymous visitor.
 *
 * Surveys and feature flags are both off. They are out of scope, and disabling
 * them also removes the `/flags` request on every page load.
 */
export function initBrowserPostHog(): void {
  const token = import.meta.env.VITE_POSTHOG_KEY?.trim()
  const apiHost = import.meta.env.VITE_POSTHOG_HOST?.trim()

  if (!token || !apiHost) return

  posthog.init(token, {
    api_host: apiHost,
    ui_host: "https://us.posthog.com",
    defaults: "2025-05-24",
    person_profiles: "identified_only",
    capture_exceptions: true,
    disable_surveys: true,
    advanced_disable_feature_flags: true,
    advanced_disable_feature_flags_on_first_load: true,
  })
}
