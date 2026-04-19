# error-wolf

Small, open-source web app for compressing noisy console logs and stack traces before you hand them to bigger models. It runs locally in the browser: no account database, no server-side storage of your pastes. Simplify now uses a browser-direct OpenRouter pipeline with deterministic normalization, three concurrent compression passes, and a final merge pass.

## Features

- **Local-first** — pasted logs stay in the page; nothing is written to a backend datastore by this app.
- **OpenRouter API key** — optional key entry with verification against OpenRouter; on success the key is stored in an **HTTP cookie** (30 days, `SameSite=Lax`, `Secure` when served over HTTPS).
- **Paste and simplify** — textarea for errors/logs; **Simplify** normalizes the trace, collapses repeated noise, runs three concurrent OpenRouter compression variants, then merges the best compact stack output.
- **Provider routing** — while you stay on the hunt page, provider rankings are refreshed every 5 minutes and the default provider is chosen from an end-to-end token budget estimate for the current compression request.
- **Copy result** — copies simplified text to the clipboard and **clears** the current paste and result so you can start fresh.
- **Recent results** — up to **100** successful runs are kept in **localStorage** for 30 days so you can recover output if you navigate away.
- **Consent** — using the Simplify tool requires accepting the flow from the home page; consent is stored in a first-party cookie.
- **Run progress** — stage-by-stage progress is shown during normalization, parallel compression, and final merge, with timings and warnings for skipped branches.

### OpenRouter direct browser access

All OpenRouter traffic is browser-direct only. If verification, provider rankings, or completions cannot reach OpenRouter directly, the app surfaces that as a blocked-network / blocked-IP error. There are no internal proxy routes for OpenRouter requests in this project.

## User flow

1. Open the **home** page and read the short summary and privacy link.
2. Click **I agree — continue** to record consent and go to **Simplify**.
3. Enter your OpenRouter API key and click **Verify key**; on success it is saved to the cookie.
4. Paste an error or log, click **Simplify**, and wait for normalization, parallel compression, and merge to complete.
5. Click **Copy** to copy the compact result and reset the current inputs.

## Routes

| Path | Description |
|------|-------------|
| `/` | Landing and consent |
| `/hunt` | Main tool |
| `/privacy` | Privacy policy |

## Development

This project uses **pnpm**, **Next.js 16** (App Router), **React 19**, **TypeScript**, **Tailwind CSS v4**, and **shadcn/ui** (Base UI + Hugeicons). See [AGENTS.md](./AGENTS.md) for stack details and conventions.

```bash
pnpm install
pnpm dev
```

Other scripts: `pnpm build`, `pnpm start`, `pnpm lint`, `pnpm typecheck`, `pnpm format`.

## License

This project is licensed under the [O'Saasy License](./LICENSE.md). You may use, modify, and distribute the software broadly, but you may not offer it to third parties as a hosted SaaS or cloud service whose primary value is the software itself (see the license for the exact terms).

