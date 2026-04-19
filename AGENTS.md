---

## description:

alwaysApply: true

# Agent Guidelines

## About

**error wolf** is a small Next.js application template using the App Router, TypeScript, Tailwind CSS v4, and shadcn/ui (Base UI primitives, Hugeicons). It is a starter-style layout: root shell in `app/layout.tsx`, shared UI under `components/`, and utilities in `lib/`.

## Core

- Cold, professional tone. No flattery. Objective corrections only.
- Stay focused; do not pad answers.
- Prefer existing patterns over new frameworks or parallel design systems.
- Refine touched code in place: same behavior, fewer moving parts.
- Prefer single-purpose modules, components, and functions with consistent names.
- This repo has no `.agents/skills/` tree; use this file, `README.md`, and `components.json` as the primary conventions.

## Stack

| Area                  | Choice                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Package manager**   | **pnpm** (`pnpm-lock.yaml`)                                                                                              |
| **Runtime / app**     | **Next.js 16** (App Router: `app/`)                                                                                      |
| **UI**                | **React 19**                                                                                                             |
| **React Compiler**    | **Next.js `reactCompiler: true`** + dev **`babel-plugin-react-compiler`** (compile-time memoization; same React runtime) |
| **Language**          | **TypeScript** (`strict: true` in `tsconfig.json`)                                                                       |
| **Dev server**        | **Turbopack** (`next dev --turbopack`)                                                                                   |
| **Styling**           | **Tailwind CSS v4** via `@tailwindcss/postcss` and `postcss.config.mjs`                                                  |
| **Components**        | **shadcn/ui** (`shadcn`, `components.json`), **@base-ui/react**, **class-variance-authority**                            |
| **Icons**             | **Hugeicons** (`@hugeicons/react`, `@hugeicons/core-free-icons`; `components.json` → `iconLibrary: "hugeicons"`)         |
| **Theming**           | **next-themes** (`attribute="class"`, system default; header sun/moon icon toggles light/dark)                           |
| **Animation helpers** | **tw-animate-css** (imported from `app/globals.css`)                                                                     |
| **Lint**              | **Oxlint** (`.oxlintrc.json`): Next.js + TypeScript + React rules, **`--type-aware`** via **`oxlint-tsgolint`**, React Compiler checks via **`eslint-plugin-react-compiler`** as an Oxlint **jsPlugin** |
| **Format**            | **Oxfmt** (`.oxfmtrc.json`): Prettier-compatible options + **`sortTailwindcss`** (`app/globals.css`, `cn` / `cva`)                                                                                      |

**Module system:** ESM — `package.json` has `"type": "module"`; config files use `.mjs` where applicable (`next.config.mjs`, `postcss.config.mjs`).

## Layout

- **`app/`** — Next App Router: `layout.tsx` (root shell, fonts, `ThemeProvider`), `page.tsx`, `globals.css` (Tailwind entry, design tokens, shadcn theme imports).
- **`components/`** — Shared UI: `theme-provider.tsx`, `ui/` (e.g. shadcn-style primitives).
- `**lib/**` — Cross-cutting helpers (e.g. `cn()` in `lib/utils.ts`).
- `**hooks/**` — Reserved alias in `components.json`; add hooks here when needed.

Colocate by feature as the app grows; keep routes and route-local UI under `app/` when it is page-specific.

## UI

- **Tailwind v4** is driven from `[app/globals.css](app/globals.css)`: `@import "tailwindcss"`, `@import "tw-animate-css"`, `@import "shadcn/tailwind.css"`, `@theme inline` tokens, and `:root` / `.dark` CSS variables (shadcn-style palette).
- **Dark mode** uses the `.dark` class on ancestors (see `@custom-variant dark` in `globals.css`); `next-themes` applies the class on `html`.
- **Fonts:** `next/font/google` — Geist Sans, Geist Mono, Lora (serif); variables are wired in `app/layout.tsx`.
- **New shadcn pieces:** follow `[README.md](README.md)` (e.g. `npx shadcn@latest add <component>`). Prefer **pnpm** for installs: `pnpm dlx shadcn@latest add <component>` when adding dependencies through the CLI.
- **Imports:** use path aliases from `components.json` / `tsconfig.json` — e.g. `@/components/ui/button`, `@/lib/utils`.
- **Do not** introduce a second component library or icon set; stay on Base UI + Hugeicons + existing tokens.

## Tooling

Use **pnpm** (lockfile present).

| Command              | Purpose                                        |
| -------------------- | ---------------------------------------------- |
| `pnpm dev`           | Dev server (`next dev --turbopack`)            |
| `pnpm build`         | Production build (`next build`)                |
| `pnpm start`         | Production server (`next start`)               |
| `pnpm lint`          | Oxlint (`--type-aware`)                        |
| `pnpm lint:fix`      | Oxlint with safe fixes                         |
| `pnpm format`        | Oxfmt (write)                                  |
| `pnpm format:check`  | Oxfmt check-only                               |
| `pnpm typecheck`     | `tsgo --noEmit` (`@typescript/native-preview`) |
| `pnpm typecheck:tsc` | Classic `tsc --noEmit` (parity / escape hatch) |

There is **no** combined `check` script; run `pnpm format` (or `pnpm format:check`), `pnpm lint`, and `pnpm typecheck` as needed after substantive edits.

**Node version:** not pinned in-repo; use a current LTS compatible with Next 16 if you need a local baseline.

## Code style

- **TypeScript:** strict mode; path alias `@/*` → repo root (matches `tsconfig.json` `paths` and `components.json` aliases). Primary typecheck uses **tsgo**; the `typescript` package remains for `pnpm typecheck:tsc` and editor tooling.
- **Oxfmt** (`.oxfmtrc.json`): LF, **no semicolons**, double quotes, 2 spaces, print width 80, trailing commas `es5`; Tailwind class sorting via **`sortTailwindcss`** (`stylesheet: app/globals.css`, `functions: ["cn", "cva"]`); `sortPackageJson` is off (see config).
- **Oxlint** (`.oxlintrc.json`): migrated from the former Next ESLint presets; **`eslint-plugin-react-compiler`** is loaded as a jsPlugin; ignores include `node_modules`, build outputs, `.next/`, `next-env.d.ts`, and `scripts/example-bg-photo-tuner/**`.
- **React:** use `"use client"` only where client APIs are required (e.g. theme provider). Prefer server components by default in `app/` where practical.
- **Utilities:** merge Tailwind classes with `cn()` from `@/lib/utils` (`clsx` + `tailwind-merge`).

## Testing

**No test runner is configured** — there is no `test` script in `package.json` and no Vitest/Jest/Cypress setup in-repo. If you add tests, introduce a single stack (and scripts) deliberately; do not assume tests exist until then.

## CI / observability

No `.github/workflows` or other CI config is present in this repository. No Sentry or other observability SDKs are wired in `package.json`.

## Git

Use standard git workflows. This repo does not define mandatory commit-message prefixes or PR tooling; use project or team conventions if provided separately.
