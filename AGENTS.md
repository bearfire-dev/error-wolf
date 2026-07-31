---

## description:

alwaysApply: true

# Agent Guidelines

## About

**error wolf** compresses noisy stack traces and build logs. The work happens in
the browser with the user's own OpenRouter key. The server does three things
only: it sets the consent cookie, it reads cookies for the /hunt gate, and it
reports its own uncaught exceptions.

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
| **Observability**     | **posthog-js** in the browser, **posthog-node** in the Worker, behind a Cloudflare reverse proxy            |
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
- **`src/integrations/`** — browser PostHog setup.
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
3. `src/server.ts` catches every uncaught Worker exception, reports it to
   PostHog, then rethrows. It awaits the report: a Worker can be torn down
   before an un-awaited flush completes.

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

| Command                  | Purpose                                        |
| ------------------------ | ---------------------------------------------- |
| `pnpm dev`               | Vite dev server on port 3000                   |
| `pnpm build`             | Production build into `dist/`                  |
| `pnpm preview`           | Serve the production build                     |
| `pnpm deploy`            | Build, then `wrangler deploy`                  |
| `pnpm deploy:proxy`      | Deploy the PostHog reverse-proxy Worker        |
| `pnpm sourcemaps:upload` | Send browser source maps to PostHog            |
| `pnpm test`              | Vitest, one run                                |
| `pnpm test:watch`        | Vitest in watch mode                           |
| `pnpm lint`              | Oxlint (`--type-aware`)                        |
| `pnpm lint:fix`          | Oxlint with safe fixes                         |
| `pnpm format`            | Oxfmt (write)                                  |
| `pnpm format:check`      | Oxfmt check-only                               |
| `pnpm typecheck`         | `tsgo --noEmit` (`@typescript/native-preview`) |
| `pnpm typecheck:tsc`     | Classic `tsc --noEmit` (parity check)          |
| `pnpm cf-typegen`        | Generate Worker binding types                  |

There is no combined `check` script. After a substantive edit, run
`pnpm format`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.

**Node version:** `package.json` asks for 24.x. CI uses 24.

## Cloudflare

`wrangler.jsonc` configures the Worker. Read it before you change the build.

- `main` points at `src/server.ts`. That file wraps the TanStack Start server
  entry, and reports uncaught exceptions to PostHog.
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

CI runs `.github/workflows/ci.yml` on Blacksmith runners. The deploy step needs
the repo secret `CLOUDFLARE_API_TOKEN` with the `Workers Scripts:Edit`
permission. Without the secret, the job still runs the checks and the build, and
it reports that it skipped the deploy.

## PostHog

PostHog does product analytics and error tracking. It replaced Sentry.

**Anonymous only.** Nothing calls `posthog.identify`. `person_profiles` is
`identified_only`, so an anonymous visitor gets no person profile. Do not add an
identify call.

**Surveys and feature flags are off.** Both are out of scope. Disabling flags
also removes the `/flags` request on every page load.

Three parts:

1. **Browser** — `src/integrations/posthog.client.ts`, started from
   `src/client.tsx` before hydration. `capture_exceptions` reports uncaught
   browser errors. The React error boundary in `src/components/app-error.tsx`
   must report by hand, because React swallows the error before the global
   handler sees it.
2. **Worker** — `src/lib/server/posthog.ts` with posthog-node. It sends each
   event straight away (`flushAt: 1`, `flushInterval: 0`). A batched flush can
   be lost when the Worker stops.
3. **Reverse proxy** — `workers/posthog-proxy/`, a second Worker on its own
   subdomain. `VITE_POSTHOG_HOST` points the browser at it.

### The reverse proxy

The browser SDK talks to the proxy, not to PostHog. That keeps ingest on a
first-party hostname that ad blockers do not match. The Worker code comes from
the PostHog Cloudflare guide.

- Keep the words analytics, tracking, telemetry, posthog, and ph out of the
  subdomain. Blockers match all of them.
- Do not fold the proxy into `src/server.ts`. The app Worker answers on the site
  origin, and the proxy must answer on a different hostname.
- The Worker itself talks to `us.i.posthog.com` directly. Server-to-server
  traffic has no ad blocker in the path.

Deploy it by hand with `pnpm run deploy:proxy`. It changes rarely, so CI does
not deploy it.

### Product events

`src/lib/product-events.ts` holds the event names and property builders. It
imports no SDK, so the browser path and the Worker path build the same payload.
`user_initialize` fires in a server function. It reads the anonymous distinct id
from the posthog-js cookie, so it lands on the same person as the browser
events. With no cookie the event is dropped, because a fresh id per request
would inflate the unique-user count.

### Source maps

`pnpm run sourcemaps:upload` injects a chunk id into each bundle and uploads the
maps, so PostHog can read a minified browser stack trace. `vite.config.ts` only
builds source maps when both upload variables are set.

## Environment variables

Vite inlines every `VITE_*` variable into both bundles at build time.

| Name                  | Where   | Purpose                                               |
| --------------------- | ------- | ----------------------------------------------------- |
| `VITE_SITE_URL`       | Build   | Canonical origin for metadata and the sitemap.        |
| `VITE_POSTHOG_KEY`    | Build   | PostHog project token. Unset disables PostHog.        |
| `VITE_POSTHOG_HOST`   | Build   | Reverse-proxy origin. Unset disables the browser SDK. |
| `POSTHOG_CLI_API_KEY` | CI only | Source-map upload. Never commit a value.              |
| `POSTHOG_CLI_ENV_ID`  | CI      | Source-map upload. PostHog environment id.            |
| `POSTHOG_KEY`         | Worker  | Optional runtime override of the project token.       |
| `POSTHOG_HOST`        | Worker  | Optional runtime override of the ingest host.         |

A PostHog project token (`phc_`) is public by design and ships in the bundle. A
personal API key (`phx_`) is not. **The repo is public.** Keep `phx_` keys out of
tracked files and out of workflow logs.

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
