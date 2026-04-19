"use client"

import * as Sentry from "@sentry/nextjs"
import { useCallback, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { getSentryDsn } from "@/lib/sentry-dsn"

type Status = "idle" | "success" | "error"

let warnedMissingDsn = false

function warnMissingSentryDsnOnce() {
  if (process.env.NODE_ENV !== "development" || warnedMissingDsn) return
  warnedMissingDsn = true
  console.warn(
    "[error-wolf] Set NEXT_PUBLIC_SENTRY_DSN to the HTTPS Client Keys DSN (see .env.example), then restart."
  )
}

export function CrashReportForm({
  eventId,
  errorDigest,
}: {
  eventId: string | undefined
  errorDigest?: string
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [status, setStatus] = useState<Status>("idle")
  const [submitError, setSubmitError] = useState<string | null>(null)

  const dsn = getSentryDsn()

  useEffect(() => {
    if (!dsn) warnMissingSentryDsnOnce()
  }, [dsn])

  const canSubmit =
    Boolean(dsn) &&
    Boolean(eventId) &&
    message.trim().length > 0 &&
    status !== "success"

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!canSubmit || !eventId) return
      setSubmitError(null)
      try {
        Sentry.captureFeedback(
          {
            name: name.trim() || undefined,
            email: email.trim() || undefined,
            message: message.trim(),
            associatedEventId: eventId,
            tags: { source: "error-boundary" },
          },
          { includeReplay: false }
        )
        setStatus("success")
      } catch (err) {
        setStatus("error")
        setSubmitError(
          err instanceof Error ? err.message : "Could not send report"
        )
      }
    },
    [canSubmit, email, eventId, message, name]
  )

  if (!dsn) {
    return (
      <Card
        size="sm"
        className="border-dashed border-foreground/25 bg-muted/30"
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-[0.6875rem] tracking-wider uppercase">
            Crash report
          </CardTitle>
          <CardDescription>
            Set{" "}
            <span className="text-foreground/90">NEXT_PUBLIC_SENTRY_DSN</span>{" "}
            to the HTTPS ingest URL from Client Keys (not a{" "}
            <span className="text-foreground/90">sntrys_</span> CLI token) in{" "}
            <span className="text-foreground/90">.env.local</span> or host env,
            then restart. See{" "}
            <span className="text-foreground/90">.env.example</span>.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (!eventId) {
    return (
      <Card
        size="sm"
        className="border-dashed border-foreground/25 bg-muted/30"
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-[0.6875rem] tracking-wider uppercase">
            Crash report
          </CardTitle>
          <CardDescription>
            No event id is available yet; try again in a moment.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card size="sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-[0.6875rem] tracking-wider uppercase">
          Tell us what happened
        </CardTitle>
        <CardDescription>
          Optional details are sent with this error to Sentry
          {errorDigest ? (
            <>
              {" "}
              <span className="text-muted-foreground">
                · digest {errorDigest}
              </span>
            </>
          ) : null}
          .
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="flex flex-col gap-3 pt-0">
          <div className="grid gap-1.5 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label
                htmlFor="crash-name"
                className="text-[0.625rem] tracking-wider uppercase"
              >
                Name
              </Label>
              <Input
                id="crash-name"
                name="name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={status === "success"}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label
                htmlFor="crash-email"
                className="text-[0.625rem] tracking-wider uppercase"
              >
                Email
              </Label>
              <Input
                id="crash-email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status === "success"}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label
              htmlFor="crash-message"
              className="text-[0.625rem] tracking-wider uppercase"
            >
              Message
            </Label>
            <Textarea
              id="crash-message"
              name="message"
              required
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={status === "success"}
              placeholder="What were you doing when this broke?"
            />
          </div>
          {status === "success" ? (
            <p className="font-mono text-[0.625rem] tracking-wider text-primary uppercase">
              Thanks — your note was sent.
            </p>
          ) : null}
          {status === "error" && submitError ? (
            <p className="font-mono text-[0.625rem] tracking-wider text-destructive uppercase">
              {submitError}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="justify-end border-t border-foreground/15 pt-3">
          <Button type="submit" disabled={!canSubmit}>
            Send crash report
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
