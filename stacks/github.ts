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
            "Secrets Store Read",
            "Secrets Store Write",
            "Workers Scripts Read",
            "Workers Scripts Write",
          ],
          resources: {
            [`com.cloudflare.api.account.${accountId}`]: "*",
          },
        },
      ],
    })

    // Scope Cloudflare credentials to GitHub environments so pull_request jobs
    // only see preview secrets, and production deploy only sees production.
    yield* GitHub.Secret("PreviewCloudflareApiToken", {
      ...repository,
      environment: "preview",
      name: "CLOUDFLARE_API_TOKEN",
      value: apiToken.value,
    })
    yield* GitHub.Secret("PreviewCloudflareAccountId", {
      ...repository,
      environment: "preview",
      name: "CLOUDFLARE_ACCOUNT_ID",
      value: Redacted.make(accountId),
    })
    yield* GitHub.Secret("ProductionCloudflareApiToken", {
      ...repository,
      environment: "production",
      name: "CLOUDFLARE_API_TOKEN",
      value: apiToken.value,
    })
    yield* GitHub.Secret("ProductionCloudflareAccountId", {
      ...repository,
      environment: "production",
      name: "CLOUDFLARE_ACCOUNT_ID",
      value: Redacted.make(accountId),
    })

    return { accountId }
  })
)
