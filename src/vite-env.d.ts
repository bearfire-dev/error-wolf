/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Canonical site origin, e.g. `https://errorwolf.dev`. Optional in development. */
  readonly VITE_SITE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/**
 * Sentry release name, injected by `define` in `vite.config.ts`. It is the
 * commit SHA on Cloudflare Workers Builds and in Actions, and `null` locally.
 */
declare const __SENTRY_RELEASE__: string | null

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
