---

## description:

alwaysApply: true

# Agent Guidelines

## About

**error wolf** compresses noisy stack traces and build logs. The work happens in
the browser with the user's own OpenRouter key. The server does three things
only: it sets the consent cookie, it reads the cookies for the /hunt gate, and
it serves the app.

The product logic is in `src/lib/`. That code imports no framework APIs. Keep it
that way.

## Core

- Cold, professional tone. No flattery. Objective corrections only.
- Stay focused. Do not pad answers.
- Prefer existing patterns over new frameworks or parallel design systems.
- Refine touched code in place: same behavior, fewer moving parts.
- Prefer single-purpose modules, components, and functions with consistent names.
- This repo has no `.agents/skills/` tree. Use this file, `README.md`, and
  `components.json` as the primary conventions.

## Stack

| Area                  | Choice                                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Package manager**   | **pnpm** (`pnpm-lock.yaml`)                                                                                 |
| **Runtime / app**     | **TanStack Start** on **Cloudflare Workers** (file routes: `src/routes/`)                                   |
| **Routing**           | **TanStack Router** (`src/routeTree.gen.ts` is generated — do not edit it)                                  |
| **UI**                | **React 19**                                                                                                |
| **React Compiler**    | **babel-plugin-react-compiler** through **@rolldown/plugin-babel** (`@vitejs/plugin-react` v6 uses Oxc)     |
| **Language**          | **TypeScript** (`strict: true` in `tsconfig.json`)                                                          |
| **Build / dev**       | **Vite 8** (`vite dev`, `vite build`)                                                                       |
| **Styling**           | **Tailwind CSS v4** through **@tailwindcss/vite**                                                           |
| **Components**        | **shadcn/ui** (`shadcn`, `components.json`), **@base-ui/react**, **class-variance-authority**               |
| **Icons**             | **Hugeicons** (`@hugeicons/react`, `@hugeicons/core-free-icons`)                                            |
| **Fonts**             | **@fontsource/space-mono**, imported from `src/globals.css`                                                 |
| **Theming**           | Local provider in `src/components/theme-provider.tsx` plus a pre-paint inline script                        |
| **Images**            | **vite-imagetools** for the background photo, plain `<img>` for the logo                                    |
| **Animation helpers** | **tw-animate-css** (imported from `src/globals.css`)                                                        |
| **Lint**              | **Oxlint** (`.oxlintrc.json`): TypeScript and React rules, **`--type-aware`** through **`oxlint-tsgolint`** |
| **Format**            | **Oxfmt** (`.oxfmtrc.json`): Prettier-compatible options plus **`sortTailwindcss`**                         |
| **Test**              | **Vitest** (`vitest.config.ts`), unit tests beside the sources in `src/lib/`                                |

**Module system:** ESM. `package.json` sets `"type": "module"`.

## Layout

- **`src/routes/`** — file routes. `__root.tsx` holds the document shell, the
  head metadata, the theme provider, and the error boundary. A directory or file
  with a `-` prefix is route-local UI and gets no URL, such as `-hunt/`.
- **`src/lib/`** — the product. Simplify engines, the OpenRouter client, routing
  estimation, cost models, and token estimation. No framework imports.
- **`src/lib/server/`** — the only server-side modules. They adapt the TanStack
  request helpers to the framework-free helpers in `src/lib/`.
- **`src/components/`** — shared UI. `ui/` holds the shadcn primitives.
- **`src/hooks/`** — shared hooks.
- **`src/assets/`** — images that the build processes. Files in `public/` ship
  as-is, so do not put a large source image there.
- **`src/client.tsx`**, **`src/router.tsx`**, **`src/server.ts`** — the browser
  entry, the router factory, and the Worker entry.

Colocate by feature as the app grows. Keep route-local UI under `src/routes/`
with a `-` prefix.

## Routes

| URL            | File                          | Notes                                      |
| -------------- | ----------------------------- | ------------------------------------------ |
| `/`            | `src/routes/index.tsx`        | Marketing page and the consent button.     |
| `/hunt`        | `src/routes/hunt.tsx`         | The product. A loader gates it on consent. |
| `/privacy`     | `src/routes/privacy.tsx`      |                                            |
| `/robots.txt`  | `src/routes/robots[.]txt.ts`  | Square brackets escape the dot in a path.  |
| `/sitemap.xml` | `src/routes/sitemap[.]xml.ts` |                                            |

Do not change these URLs. The consent flow and the sitemap reference them.

## Server touchpoints

There are three. Handle each with care.

1. `src/lib/server/consent.ts` sets the consent cookie. The home route then
   navigates to /hunt. The cookie attributes must not change.
   `src/lib/consent.ts` clears the same cookie from the browser with the same
   flags. Do not throw a `redirect` from this server function. An imperative
   server-function call receives it as a raw `Response`, and the navigation
   never happens.
2. `src/routes/hunt.tsx` reads the consent cookie and the OpenRouter key cookie
   in a server function. It must keep the legacy cookie names. If you drop them,
   existing users lose their consent.
3. `src/server.ts` wraps the TanStack Start server entry. It adds nothing
   today. It exists so request middleware or error reporting has one home.

## UI

- **Tailwind v4** runs from `src/globals.css`. That file holds the Tailwind
  import, the font imports, the `@theme inline` tokens, and the `:root` and
  `.dark` variables.
- **Dark mode** uses the `.dark` class on `<html>`. An inline script in
  `__root.tsx` sets the class before first paint. Without it, a dark-mode user
  sees a light flash.
- **New shadcn pieces:** `pnpm dlx shadcn@latest add <component>`.
- **Imports:** use the `@/*` alias. It points at `./src`.
- **Do not** add a second component library or icon set.

## Tooling

Use **pnpm**.

| Command              | Purpose                                        |
| -------------------- | ---------------------------------------------- |
| `pnpm dev`           | Vite dev server on port 3000                   |
| `pnpm build`         | Production build into `dist/`                  |
| `pnpm preview`       | Serve the production build                     |
| `pnpm deploy`        | Build, then `wrangler deploy`                  |
| `pnpm test`          | Vitest, one run                                |
| `pnpm test:watch`    | Vitest in watch mode                           |
| `pnpm lint`          | Oxlint (`--type-aware`)                        |
| `pnpm lint:fix`      | Oxlint with safe fixes                         |
| `pnpm format`        | Oxfmt (write)                                  |
| `pnpm format:check`  | Oxfmt check-only                               |
| `pnpm typecheck`     | `tsgo --noEmit` (`@typescript/native-preview`) |
| `pnpm typecheck:tsc` | Classic `tsc --noEmit` (parity check)          |
| `pnpm cf-typegen`    | Generate Worker binding types                  |

There is no combined `check` script. After a substantive edit, run
`pnpm format`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.

**Node version:** `package.json` asks for 24.x. CI uses 24.

## Cloudflare

`wrangler.jsonc` configures the Worker. Read it before you change the build.

- `main` points at `src/server.ts`. That file wraps the TanStack Start server
  entry.
- `compatibility_flags` includes `nodejs_compat`.
- There is no `routes` block. The site serves from `*.workers.dev` until the
  custom domain moves.

The Vite build writes `dist/server/wrangler.json`. Run `wrangler deploy` from the
repo root after `vite build`. It finds that file.

**Workers have no filesystem.** Do not use `node:fs` or `process.cwd()` in code
that the server bundle reaches. Read files at build time instead. See
`src/lib/example-traces.ts` and `src/lib/announcements/load.ts`.

**Bundle size.** Cloudflare rejects a Worker above 3 MiB gzip. Run
`pnpm exec wrangler deploy --dry-run` to print the current size.

To test against the Workers runtime and not the Vite dev server, run
`pnpm build`, then `pnpm exec wrangler dev`. Node API differences appear there.

### Deploy

**Cloudflare deploys this Worker itself**, through its Git integration (Workers
Builds). A push to `master` triggers a Cloudflare build, and Cloudflare runs
`wrangler deploy`. GitHub Actions does not deploy, and the repo needs no
Cloudflare API token.

Cloudflare build settings:

| Setting        | Value                 |
| -------------- | --------------------- |
| Build command  | `pnpm run build`      |
| Deploy command | `npx wrangler deploy` |
| Root directory | repo root             |

Set `VITE_SITE_URL` as a build variable in the Cloudflare project. Vite inlines
it at build time, so it must be present in the Cloudflare build and not only in
GitHub Actions.

`.github/workflows/ci.yml` runs the checks on Blacksmith runners: format, lint,
typecheck, test, build, and the Worker size report. It gates the pull request.
It does not ship anything.

`pnpm deploy` still works for a deploy by hand. It needs a local `wrangler
login`.

## Environment variables

Vite inlines every `VITE_*` variable into both bundles at build time.

| Name            | Where | Purpose                                        |
| --------------- | ----- | ---------------------------------------------- |
| `VITE_SITE_URL` | Build | Canonical origin for metadata and the sitemap. |

Vite inlines a `VITE_*` value into the browser bundle, so never put a secret in
one. **The repo is public.**

## Code style

- **TypeScript:** strict mode. The `@/*` alias points at `./src`. `tsgo` is the
  primary typechecker. The `typescript` package stays for `pnpm typecheck:tsc`
  and for editor tooling.
- **Oxfmt** (`.oxfmtrc.json`): LF, no semicolons, double quotes, 2 spaces, print
  width 80, trailing commas `es5`. Tailwind class sorting reads
  `src/globals.css` and the `cn` and `cva` functions.
- **Oxlint** (`.oxlintrc.json`): `eslint-plugin-react-compiler` loads as a
  jsPlugin. The ignore list covers `node_modules`, `dist`, `.wrangler`, the
  generated route tree, and `scripts/example-bg-photo-tuner/**`.
- **React:** the app renders on the server and hydrates in the browser. There is
  no React Server Components boundary, so a `"use client"` directive means
  nothing here. Do not add one.
- **Utilities:** merge Tailwind classes with `cn()` from `@/lib/utils`.

## Testing

Vitest runs in the `node` environment. Test files sit beside their sources in
`src/lib/`. Run `pnpm test`.

These tests cover the parts that are hard to check by hand: cost models, model
endpoint fetching, preprocessing, the OpenRouter client, recent results, and run
deadlines. Keep them passing. If a test needs a change, change its framework
assumptions and never the expected behavior.

## Git

Use standard git workflows. This repo defines no mandatory commit-message
prefixes.
