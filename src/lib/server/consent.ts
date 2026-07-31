import { createServerFn } from "@tanstack/react-start"
import { setCookie } from "@tanstack/react-start/server"

import { CONSENT_COOKIE_NAME } from "@/lib/consent"

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

/**
 * Home page [ initialize ]. Replaces the `"use server"` action in
 * `app/actions/consent.ts`.
 *
 * The cookie attributes must not drift: `lib/consent.ts` clears this cookie
 * from the browser with the same flags, and `lib/hunt-server-hints.ts` reads it
 * on the server. `secure` is off in development so the flow works over plain
 * HTTP on localhost.
 *
 * The Next action redirected to /hunt from the server. This one returns, and
 * the caller navigates. A `redirect` thrown from an imperative server-function
 * call arrives on the client as a raw `Response`, which `useServerFn` does not
 * recognize, so the navigation would never happen.
 */
export const acceptConsentAndStart = createServerFn({ method: "POST" }).handler(
  async () => {
    setCookie(CONSENT_COOKIE_NAME, "1", {
      path: "/",
      maxAge: ONE_YEAR_SECONDS,
      sameSite: "lax",
      secure: import.meta.env.PROD,
    })
  }
)
