import * as Alchemy from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import * as GitHub from "alchemy/GitHub"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"

const repository = {
  owner: "bearfire-dev",
  repository: "error-wolf",
}

/** Creates the account-owned, least-privilege token used by GitHub Actions. */
export default Alchemy.Stack(
  "error-wolf-github",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment
    const apiToken = yield* Cloudflare.ApiToken.AccountApiToken("CIToken", {
      accountId,
      policies: [
        {
          effect: "allow",
          permissionGroups: [
            "Account Settings Read",
            "Secrets Store Write",
            "Workers Scripts Write",
          ],
          resources: {
            [`com.cloudflare.api.account.${accountId}`]: "*",
          },
        },
      ],
    })

    yield* GitHub.Secret("cf-api-token", {
      ...repository,
      name: "CLOUDFLARE_API_TOKEN",
      value: apiToken.value,
    })

    yield* GitHub.Secret("cf-account-id", {
      ...repository,
      name: "CLOUDFLARE_ACCOUNT_ID",
      value: Redacted.make(accountId),
    })

    return { accountId }
  })
)
