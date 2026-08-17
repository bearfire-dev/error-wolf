# Error Wolf

**Use the app:** [errorwolf.dev](https://errorwolf.dev)

Error Wolf is an open-source web app that compresses noisy console logs and
stack traces before you send them to larger models.

## Privacy

The browser sends all OpenRouter requests directly to OpenRouter. Error Wolf
does not proxy or store your OpenRouter key, input, or results. The server only
checks whether a key exists for the hunt page.

The app sends anonymous crash reports when Error Wolf itself fails. Reports do
not include user data, cookies, request data, or console output. The app removes
key-shaped strings and limits error text before it sends a report.

The browser keeps up to 1,024 recent runs for 30 days. It stores this history
in localStorage. The privacy page contains the full details.

Read the [privacy page](https://errorwolf.dev/privacy) for the full policy.

## Feedback and issues

Suggestions, product feedback, and bug reports are welcome. Please **[open a GitHub issue](https://github.com/slate-rehm/error-wolf/issues/new)** so we can track them in one place.

## Development

The app uses **pnpm**, **TanStack Start**, **Cloudflare Workers**, **Vite 8**,
**React 19**, **TypeScript**, **Tailwind CSS v4**, and **shadcn/ui**. See
[AGENTS.md](./AGENTS.md) for project conventions and commands.

```bash
pnpm install
pnpm dev
```

To run against the Workers runtime:

```bash
pnpm build
pnpm exec wrangler dev
```

## Deployment

Alchemy manages the existing `error-wolf` Worker. Pull requests run an Alchemy
plan after CI succeeds. A push to `master` deploys production after CI
succeeds.

The one-time `stacks/github.ts` stack creates an account-owned, least-privilege
Cloudflare token and stores it as `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` repository secrets. Run that stack with the local
bootstrap profile. The bootstrap token is not used by deployment workflows.

Set `VITE_SITE_URL` as a build variable in the Cloudflare project. Vite inlines
this value at build time.

`SENTRY_AUTH_TOKEN` is optional. Set it as a secret build variable to upload
source maps. The build succeeds without it.

## License

Licensed under the [O'Saasy License](./LICENSE.md). You may use, modify, and distribute the software broadly, but you may not offer it to third parties as a hosted SaaS or cloud service whose primary value is the software itself (see the license for the exact terms).
