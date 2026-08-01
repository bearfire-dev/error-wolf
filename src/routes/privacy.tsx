import { Link, createFileRoute } from "@tanstack/react-router"

import { SITE_HEADER_GITHUB_URL } from "@/components/site-header-constants"
import { getSiteUrl } from "@/lib/site-url"

const privacyDescription =
  "Error Wolf processes your traces in the browser. Your input and results are not stored on our servers."

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy · error-wolf" },
      { name: "description", content: privacyDescription },
    ],
    links: [{ rel: "canonical", href: new URL("/privacy", getSiteUrl()).href }],
  }),
  component: PrivacyPage,
})

function PrivacyPage() {
  return (
    <div className="py-10 sm:py-16">
      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        <div className="mb-6 flex items-baseline justify-between gap-3 border-b border-foreground/15 pb-3 font-mono text-[0.6875rem] tracking-wider text-muted-foreground uppercase">
          <span>privacy</span>
          <span>error-wolf</span>
        </div>

        <h1 className="font-mono text-xl font-normal tracking-tight text-foreground sm:text-2xl">
          <span className="text-primary">&gt;&nbsp;</span>privacy
        </h1>

        <div className="prose prose-sm mt-8 font-mono text-sm text-foreground/90">
          <p className="text-foreground">
            Error Wolf processes your traces in your browser. Stack
            normalization, compression, and model calls run there. We do not use
            accounts, product analytics, or ad trackers. We do not store your
            input or results on our servers.
          </p>
          <p className="mt-4 text-foreground">
            We collect anonymous crash reports for errors thrown by Error Wolf.
            These reports do not include the traces or logs that you paste in.
          </p>
          <h3 className="mt-10 font-mono text-xs tracking-wider text-primary uppercase">
            Your input and OpenRouter key
          </h3>
          <p>
            The app stores your key in a browser cookie. The browser sends the
            key directly to OpenRouter and the providers that you select. Error
            Wolf does not proxy or store your key. The server only checks if a
            key exists for the hunt page. If your key does not use zero data
            retention (ZDR), a model provider may store your data. Configure
            your key with{" "}
            <a
              href="https://openrouter.ai/docs/guides/features/zdr"
              target="_blank"
              rel="noreferrer"
              className="text-foreground/85 underline underline-offset-2 hover:text-primary"
            >
              OpenRouter&apos;s ZDR guide
            </a>
            .
          </p>

          <h3 className="mt-10 font-mono text-xs tracking-wider text-primary uppercase">
            Local history
          </h3>
          <p>
            The browser keeps up to 1,024 recent runs in localStorage. It
            removes runs after 30 days. The trash icon clears your key, consent,
            and history from this browser.
          </p>

          <h3 className="mt-10 font-mono text-xs tracking-wider text-primary uppercase">
            Our errors, not yours
          </h3>
          <p className="mt-4">
            <span className="text-foreground">
              The traces and logs you paste in are your data.
            </span>{" "}
            They do not go to Error Wolf servers or Sentry. The browser sends
            them directly to OpenRouter. The results return to your browser.
          </p>
          <p className="mt-4">
            <span className="text-foreground">Errors thrown by Error Wolf</span>{" "}
            When the app breaks, it sends an anonymous crash report to Sentry.
            The report contains no user, cookie, request, or console data. We
            remove key-shaped strings and limit error text before the report
            leaves the browser.
          </p>
          <h3 className="mt-10 font-mono text-xs tracking-wider text-primary uppercase">
            Consent
          </h3>
          <p>
            The initialize flow stores your consent in a first-party cookie. The
            server uses this cookie to allow access to the hunt page. It does
            not store any other user data.
          </p>

          <h3 className="mt-10 font-mono text-xs tracking-wider text-primary uppercase">
            Open source
          </h3>
          <p>
            The full source is available on{" "}
            <a
              href={SITE_HEADER_GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="text-foreground/85 underline underline-offset-2 hover:text-primary"
            >
              GitHub
            </a>{" "}
            under the O{"'"}SaaSy License. You can audit, modify, and run it
            yourself.
          </p>
        </div>

        <p className="mt-16 font-mono text-[0.6875rem] tracking-wider text-muted-foreground uppercase">
          <Link
            to="/"
            className="underline-offset-2 hover:text-foreground hover:underline"
          >
            &larr; back
          </Link>
        </p>
      </div>
    </div>
  )
}
