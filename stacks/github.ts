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

/**
 * Creates account-owned Cloudflare tokens for GitHub Actions.
 * Preview (plan) gets a read-only token; production gets deploy write access.
 */
export default Alchemy.Stack(
  "error-wolf-github",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment
    const account = `com.cloudflare.api.account.${accountId}`

    const planToken = yield* Cloudflare.ApiToken.AccountApiToken("PlanToken", {
      accountId,
      policies: [
        {
          effect: "allow",
          permissionGroups: [
            "Account Settings Read",
            "Secrets Store Read",
            "Workers Scripts Read",
          ],
          resources: { [account]: "*" },
        },
      ],
    })

    const deployToken = yield* Cloudflare.ApiToken.AccountApiToken(
      "DeployToken",
      {
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
            resources: { [account]: "*" },
          },
        ],
      }
    )

    yield* GitHub.Secret("PreviewCloudflareApiToken", {
      ...repository,
      environment: "preview",
      name: "CLOUDFLARE_API_TOKEN",
      value: planToken.value,
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
      value: deployToken.value,
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
