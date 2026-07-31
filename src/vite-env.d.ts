/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Canonical site origin, e.g. `https://errorwolf.dev`. Optional in development. */
  readonly VITE_SITE_URL?: string
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
