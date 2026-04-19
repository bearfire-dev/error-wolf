import type { Metadata } from "next"
import { Space_Mono } from "next/font/google"
import { ViewTransition } from "react"

import "./globals.css"
import { SiteBackgroundLayer } from "@/components/site-background-layer"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { ThemeProvider } from "@/components/theme-provider"
import { getAnnouncementsFeed } from "@/lib/announcements/load"
import { getSiteUrl } from "@/lib/site-url"
import { cn } from "@/lib/utils"

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
})

const siteUrl = getSiteUrl()

const siteDescription =
  "Compress noisy stack traces and build logs in your browser before you hand them to larger LLMs. Local-first, uses your OpenRouter key, free and open source."

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: "error-wolf",
    template: "%s · error-wolf",
  },
  description: siteDescription,
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "error-wolf",
    title: "error-wolf",
    description: siteDescription,
    images: [
      {
        url: "/logo512.png",
        width: 512,
        height: 512,
        alt: "error-wolf",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "error-wolf",
    description: siteDescription,
    images: ["/logo512.png"],
  },
  icons: {
    icon: [
      {
        url: "/favicon-light.ico",
        sizes: "any",
        type: "image/x-icon",
      },
      {
        url: "/favicon-dark.ico",
        sizes: "any",
        type: "image/x-icon",
        media: "(prefers-color-scheme: dark)",
      },
    ],
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const { lastUpdatedMs, body } = getAnnouncementsFeed()

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", spaceMono.variable)}
    >
      <body>
        <ThemeProvider>
          <SiteBackgroundLayer />
          <div className="relative isolate z-10 flex min-h-svh flex-col">
            <SiteHeader
              announcementsLatestMs={lastUpdatedMs}
              announcementsMarkdown={body}
            />
            <main className="flex-1">
              <ViewTransition default="none" enter="ew-enter" exit="ew-exit">
                {children}
              </ViewTransition>
            </main>
            <SiteFooter />
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
