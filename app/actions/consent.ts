"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { CONSENT_COOKIE_NAME } from "@/lib/consent"
import { emitUserInitializeMetric } from "@/lib/sentry-product-metrics"

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

export async function acceptConsentAndStart() {
  const jar = await cookies()
  jar.set(CONSENT_COOKIE_NAME, "1", {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  })
  emitUserInitializeMetric()
  redirect("/hunt")
}
