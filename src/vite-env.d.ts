/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Canonical site origin, e.g. `https://errorwolf.dev`. Optional in development. */
  readonly VITE_SITE_URL?: string
  /** PostHog project token (`phc_...`). Unset disables PostHog. Public by design. */
  readonly VITE_POSTHOG_KEY?: string
  /**
   * Origin of the Cloudflare reverse proxy that fronts PostHog ingest, e.g.
   * `https://den.errorwolf.dev`. Unset disables PostHog in the browser: without
   * the proxy an ad blocker drops the requests anyway.
   */
  readonly VITE_POSTHOG_HOST?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/**
 * vite-imagetools 10 ships no ambient types, so the `as=picture` output is
 * declared here. `sources` maps a format name to a srcset string.
 */
declare module "*&as=picture" {
  const picture: {
    img: { src: string; w: number; h: number }
    sources: Record<string, string>
  }
  export default picture
}
