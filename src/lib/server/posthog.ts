import {
  PostHog,
  cookieStateToProperties,
  cookieStoreFromHeader,
  readPostHogCookie,
  type PostHogCookieState,
} from "posthog-node"

import { ProductEvent, userInitializeProperties } from "@/lib/product-events"

/**
 * Worker-side PostHog. This mirrors the split Sentry had: the browser SDK must
 * not reach the Worker bundle, and the Worker needs its own client for
 * server-side exceptions and for the one product event that fires in a server
 * function.
 *
 * `flushAt: 1` and `flushInterval: 0` send each event straight away. A Worker
 * can be torn down before a batched flush runs, which loses the event.
 */
export type PostHogEnv = {
  POSTHOG_KEY?: string
  POSTHOG_HOST?: string
}

/**
 * The Worker talks to PostHog directly. The Cloudflare reverse proxy exists to
 * keep the browser off a hostname that ad blockers match. Server-to-server
 * traffic has no blocker in the path, so it does not need the extra hop.
 */
const DEFAULT_HOST = "https://us.i.posthog.com"

function resolveToken(env: PostHogEnv): string {
  return (
    env.POSTHOG_KEY?.trim() || import.meta.env.VITE_POSTHOG_KEY?.trim() || ""
  )
}

function createClient(env: PostHogEnv, token: string): PostHog {
  return new PostHog(token, {
    host: env.POSTHOG_HOST?.trim() || DEFAULT_HOST,
    flushAt: 1,
    flushInterval: 0,
  })
}

/**
 * Anonymous events still need a distinct id. posthog-js keeps the browser's id
 * in a first-party cookie, so reading it keeps a server event on the same
 * anonymous person as the browser events.
 */
function readIdentity(
  cookieHeader: string | null,
  token: string
): PostHogCookieState | null {
  if (!cookieHeader) return null
  return readPostHogCookie(cookieStoreFromHeader(cookieHeader), token)
}

/**
 * Home: user clicked [ initialize ] and consent was stored.
 *
 * Without the cookie the event is dropped rather than given a fresh id.
 * Inventing an id per request would inflate the unique-user count.
 */
export async function captureUserInitialize(
  env: PostHogEnv,
  cookieHeader: string | null
): Promise<void> {
  const token = resolveToken(env)
  if (!token) return

  const identity = readIdentity(cookieHeader, token)
  if (!identity) return

  const client = createClient(env, token)
  try {
    await client.captureImmediate({
      distinctId: identity.distinctId,
      event: ProductEvent.UserInitialize,
      properties: {
        ...userInitializeProperties(),
        ...cookieStateToProperties(identity),
      },
    })
  } finally {
    await client.shutdown()
  }
}

/** Report an uncaught Worker exception. */
export async function captureServerException(
  env: PostHogEnv,
  error: unknown,
  request: Request
): Promise<void> {
  const token = resolveToken(env)
  if (!token) return

  const identity = readIdentity(request.headers.get("cookie"), token)
  const client = createClient(env, token)

  try {
    await client.captureExceptionImmediate(
      error instanceof Error ? error : new Error(String(error)),
      // No cookie means the exception happened before posthog-js ran. Group
      // those under one id instead of one per request.
      identity?.distinctId ?? "worker-anonymous",
      {
        ...cookieStateToProperties(identity),
        $current_url: request.url,
        source: "worker",
      }
    )
  } finally {
    await client.shutdown()
  }
}
