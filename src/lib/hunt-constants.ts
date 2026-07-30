export type HuntStep = "key" | "input" | "processing" | "output"

export const HUNT_STEPS: { id: HuntStep; label: string }[] = [
  { id: "key", label: "01 KEY" },
  { id: "input", label: "02 INPUT" },
  { id: "processing", label: "03 COMP" },
  { id: "output", label: "04 OUTPUT" },
]

export const HUNT_STEP_INDEX: Record<HuntStep, number> = {
  key: 0,
  input: 1,
  processing: 2,
  output: 3,
}

export const STACK_TRACE_PLACEHOLDER = `Error: Invalid document id: root.
    at new Doc (exports-Dvz5XI8G.js?v=3ce1c50a:995:54)
    at Doc.fromJSON (exports-Dvz5XI8G.js?v=3ce1c50a:1233:15)
    at manuscriptDocFromJson (doc.ts:33:14)
    at useChapterSession (use-chapter-session.ts:84:17)
    at ManuscriptSurface (manuscript-surface.tsx:31:21)
    at Object.react_stack_bottom_frame (react-dom_client.js?v=3ce1c50a:12868:12)
    at renderWithHooks (react-dom_client.js?v=3ce1c50a:4213:19)
    at updateForwardRef (react-dom_client.js?v=3ce1c50a:5396:16)
    at beginWork (react-dom_client.js?v=3ce1c50a:6204:21)
    …`

export const HUNT_GITHUB_SOURCE_URL =
  "https://github.com/slate-rehm/error-wolf/"
export const HUNT_SENTRY_URL = "https://sentry.io/"
