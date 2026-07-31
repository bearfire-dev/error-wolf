# Error Wolf

**Use the app:** [errorwolf.dev](https://errorwolf.dev)

Error Wolf is a small, open-source web app that shrinks noisy console logs and stack traces before you paste them into bigger models to save $$$.

### OpenRouter from the browser only

All OpenRouter traffic is initiated from your browser. If verification, rankings, or completions cannot reach OpenRouter (network, DNS, or blocked IP), the app surfaces that as a client-side error. This project does not expose internal proxy routes for OpenRouter.

### Anonymous crash reporting

The app sends crash reports to Sentry. Reports carry no account, no cookies, no
request headers, no request bodies, and no console output. Your OpenRouter key
and the text you paste never leave the browser: messages are scrubbed for
key-shaped strings and truncated first.

The browser posts reports to `/wdyd` on this site, and the Worker forwards them.
No third-party script loads in the page, and Sentry sees the report arrive from
Cloudflare rather than from your IP address. Details are on the
[privacy page](https://errorwolf.dev/privacy).

## Feedback and issues

Suggestions, product feedback, and bug reports are welcome. Please **[open a GitHub issue](https://github.com/slate-rehm/error-wolf/issues/new)** so we can track them in one place.

## Development / Local Run

Stack: **pnpm**, **TanStack Start** on **Cloudflare Workers**, **Vite 8**, **React 19**, **TypeScript**, **Tailwind CSS v4**, **shadcn/ui** (Base UI + Hugeicons). Conventions and tooling details live in [AGENTS.md](./AGENTS.md).

```bash
pnpm install
pnpm dev
```

To run against the Workers runtime instead of the Vite dev server:

```bash
pnpm build
pnpm exec wrangler dev
```

## Deploy

Cloudflare builds and deploys the Worker from this repo through its Git
integration. A push to `master` ships it. There is no deploy step in GitHub
Actions and no Cloudflare API token in the repo.

`VITE_SITE_URL` has to be set as a build variable in the Cloudflare project.
Vite inlines it at build time, so a value set only in GitHub Actions never
reaches the deployed bundle.

`SENTRY_AUTH_TOKEN` is optional. Set it as a secret build variable in the same
place to upload source maps, which makes stack traces in Sentry readable. The
build succeeds without it.

## License

Licensed under the [O'Saasy License](./LICENSE.md). You may use, modify, and distribute the software broadly, but you may not offer it to third parties as a hosted SaaS or cloud service whose primary value is the software itself (see the license for the exact terms).
