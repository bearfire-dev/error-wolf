import { Link, createFileRoute } from "@tanstack/react-router"

import { SITE_HEADER_GITHUB_URL } from "@/components/site-header-constants"
import { getSiteUrl } from "@/lib/site-url"

const privacyDescription =
  "error-wolf is local-first. All processing happens in your browser. Your OpenRouter key never touches our servers. Open source and fully auditable."

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
            error-wolf runs entirely in your browser. Stack normalization,
            compression, and model calls happen client-side. No accounts. No
            server-side storage of your input or results. We collect anonymous
            telemetry to help improve the code:{" "}
            <a
              href="https://sentry.io/"
              target="_blank"
              rel="noreferrer"
              className="text-foreground/85 underline underline-offset-2 hover:text-primary"
            >
              Sentry
            </a>{" "}
            in privacy mode for errors, performance, and product usage after you
            initialize from the home page (see Consent and telemetry).
          </p>

          <h3 className="mt-10 font-mono text-xs tracking-wider text-primary uppercase">
            Your Data & OpenRouter key are private
          </h3>
          <p>
            Stored in a same-site cookie. Sent directly from your browser to
            OpenRouter (and the selected providers). We never proxy your key or
            see it. If your OpenRouter key allows storage of data (i.e. not
            ZDR), model providers may store your data. Configure your key with{" "}
            <a
              href="https://openrouter.ai/docs/guides/features/zdr"
              target="_blank"
              rel="noreferrer"
              className="text-foreground/85 underline underline-offset-2 hover:text-primary"
            >
              OpenRouter’s ZDR guide
            </a>
            .
          </p>

          <h3 className="mt-10 font-mono text-xs tracking-wider text-primary uppercase">
            Local history
          </h3>
          <p>
            Up to 1024 recent runs are kept in localStorage. They are pruned
            automatically after 30 days. The trash icon in the header clears
            your key, consent, and all history in one step.
          </p>

          <h3 className="mt-10 font-mono text-xs tracking-wider text-primary uppercase">
            Consent and telemetry
          </h3>
          <p>
            We use{" "}
            <a
              href="https://sentry.io/"
              target="_blank"
              rel="noreferrer"
              className="text-foreground/85 underline underline-offset-2 hover:text-primary"
            >
              Sentry
            </a>{" "}
            in privacy mode for basic error, performance, and usage data only.
            No personal data or stack traces are sent. When you use the
            initialize flow on the home page, consent is stored as a first-party
            cookie for that experience. Error reports travel through a
            first-party path on this site, not to a third-party host. Optional
            feedback you submit with a screenshot is visible to us in Sentry. We
            do not use a site-wide web analytics product.
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
            with an O{"'"}SaaSy license. You can contribute, audit, or fork and
            run it yourself.
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
