# better-errors

Small, open-source web app for cleaning up noisy console logs and error messages. It runs locally in the browser: no account database, no server-side storage of your pastes. **AI-powered simplification is not implemented yet**—the Simplify flow uses a deterministic stub so the UI and storage behavior can be exercised end-to-end.

## Features

- **Local-first** — pasted logs stay in the page; nothing is written to a backend datastore by this app.
- **OpenRouter API key** — optional key entry with verification against OpenRouter; on success the key is stored in an **HTTP cookie** (30 days, `SameSite=Lax`, `Secure` when served over HTTPS).
- **Paste and simplify** — textarea for errors/logs; **Simplify** runs a placeholder transform (real LLM calls later).
- **Copy result** — copies simplified text to the clipboard and **clears** the current paste and result so you can start fresh.
- **Recent results** — the **last three** successful runs are kept in **session storage** (per tab) so you can recover output if you navigate away.
- **Consent** — using the Simplify tool requires accepting the flow from the home page; consent is stored in **local storage**.

### OpenRouter verification and CORS

The app first tries to call `GET https://openrouter.ai/api/v1/models` from the browser. If that fails (for example due to CORS), it falls back to a same-origin **Next.js route handler** at `/api/openrouter/verify`, which forwards the check to OpenRouter **without persisting the key**. No AI workloads run there yet.

## User flow

1. Open the **home** page and read the short summary and privacy link.
2. Click **I agree — continue** to record consent and go to **Simplify**.
3. Enter your OpenRouter API key and click **Verify key**; on success it is saved to the cookie.
4. Paste an error or log, click **Simplify**, wait for the stub to finish.
5. Click **Copy** to copy the result and reset the current inputs; use **Recent (this session)** to copy an earlier output if needed.

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

Add a `LICENSE` file to your fork or distribution if you publish this app (for example MIT). The repository does not ship a license file by default.

