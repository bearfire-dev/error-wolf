# Error Wolf

**Use the app:** [errorwolf.dev](https://errorwolf.dev)

Error Wolf is a small, open-source web app that shrinks noisy console logs and stack traces before you paste them into bigger models to save $$$.

### OpenRouter from the browser only

All OpenRouter traffic is initiated from your browser. If verification, rankings, or completions cannot reach OpenRouter (network, DNS, or blocked IP), the app surfaces that as a client-side error. This project does not expose internal proxy routes for OpenRouter.

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

## License

Licensed under the [O'Saasy License](./LICENSE.md). You may use, modify, and distribute the software broadly, but you may not offer it to third parties as a hosted SaaS or cloud service whose primary value is the software itself (see the license for the exact terms).
