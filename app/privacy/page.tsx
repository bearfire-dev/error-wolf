import Link from "next/link"

export default function PrivacyPage() {
  return (
    <div className="py-10 sm:py-16">
      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        <div className="mb-6 flex items-baseline justify-between gap-3 border-b border-foreground/15 pb-3 font-mono text-[0.6875rem] tracking-wider text-muted-foreground uppercase">
          <span>man privacy(1)</span>
          <span>error wolf</span>
        </div>

        <h1 className="font-mono text-xl font-normal tracking-tight text-foreground sm:text-2xl">
          <span className="text-primary">&gt;&nbsp;</span>privacy
        </h1>

        <dl className="mt-8 flex flex-col gap-6 font-mono text-sm text-foreground">
          <Section
            title="name"
            body="error wolf — local-first tool to tighten noisy stacks before you share them."
          />
          <Section
            title="storage"
            body="Processing happens in your browser. No account, no server-side log retention by this template."
          />
          <Section
            title="key"
            body="Your OpenRouter key is held in a same-site cookie (Max-Age ~30 days). Used only to talk to OpenRouter."
          />
          <Section
            title="history"
            body="Up to 100 recent runs are kept in localStorage for up to 30 days, then pruned automatically."
          />
          <Section
            title="consent"
            body="Your agreement to this policy is stored as a first-party cookie (and may still be present as a legacy localStorage flag until you wipe data)."
          />
          <Section
            title="wipe"
            body="Trash icon in the header clears the key, consent, and recent runs in one step."
          />
          <Section
            title="contact"
            body="Open an issue on the repository or contact whoever hosts this deployment."
          />
        </dl>

        <p className="mt-10 font-mono text-[0.6875rem] tracking-wider text-muted-foreground uppercase">
          <Link
            href="/"
            className="underline-offset-2 hover:text-foreground hover:underline"
          >
            &larr; back
          </Link>
        </p>
      </div>
    </div>
  )
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10ch_1fr] sm:items-baseline sm:gap-6">
      <dt className="font-mono text-[0.6875rem] tracking-wider text-primary uppercase">
        <span aria-hidden>&gt;&nbsp;</span>
        {title}
      </dt>
      <dd className="font-mono text-sm text-foreground/80">{body}</dd>
    </div>
  )
}
