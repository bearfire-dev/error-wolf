import * as Alchemy from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import { adopt } from "alchemy/AdoptPolicy"
import { retain } from "alchemy/RemovalPolicy"
import * as Effect from "effect/Effect"

/** Deploys the existing Error Wolf Worker through Alchemy. */
export default Alchemy.Stack(
  "ErrorWolf",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage
    if (stage !== "prod") {
      return yield* Effect.die(
        new Error("The error-wolf stack supports only the prod stage.")
      )
    }

    const app = yield* Cloudflare.Website.Vite("ErrorWolf", {
      name: "error-wolf",
      compatibility: { date: "2026-07-30", flags: ["nodejs_compat"] },
      observability: { enabled: true },
    }).pipe(adopt(true), retain())

    return { url: app.url }
  })
)
