import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router"

import appCss from "@/globals.css?url"

import { AlphaNoticeAlert } from "@/components/alpha-notice-alert"
import { AppError } from "@/components/app-error"
import { SiteBackgroundLayer } from "@/components/site-background-layer"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import {
  ThemeProvider,
  themeBootstrapScript,
} from "@/components/theme-provider"
import { getAnnouncementsFeed } from "@/lib/announcements/load"
import { getSiteUrl } from "@/lib/site-url"

const siteUrl = getSiteUrl()

const siteDescription =
  "Compress noisy stack traces and build logs in your browser before you hand them to larger LLMs. Local-first, uses your OpenRouter key, free and open source."

const ogImageUrl = new URL("/logo512.png", siteUrl).href

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "error-wolf" },
      { name: "description", content: siteDescription },

      { property: "og:type", content: "website" },
      { property: "og:locale", content: "en_US" },
      { property: "og:url", content: siteUrl.href },
      { property: "og:site_name", content: "error-wolf" },
      { property: "og:title", content: "error-wolf" },
      { property: "og:description", content: siteDescription },
      { property: "og:image", content: ogImageUrl },
      { property: "og:image:width", content: "512" },
      { property: "og:image:height", content: "512" },
      { property: "og:image:alt", content: "error-wolf" },

      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "error-wolf" },
      { name: "twitter:description", content: siteDescription },
      { name: "twitter:image", content: ogImageUrl },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "icon",
        href: "/favicon-dark.ico",
        sizes: "any",
        type: "image/x-icon",
      },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  errorComponent: AppError,
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const { lastUpdatedMs, body } = getAnnouncementsFeed()

  return (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        {/* Must run before the stylesheet paints, or dark-mode users see a
            light flash. `next-themes` injected the same kind of script. */}
        <script
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: themeBootstrapScript }}
        />
        <HeadContent />
      </head>
      <body>
        <ThemeProvider>
          <AlphaNoticeAlert />
          <SiteBackgroundLayer />
          <div className="relative isolate z-10 flex min-h-svh flex-col">
            <SiteHeader
              announcementsLatestMs={lastUpdatedMs}
              announcementsMarkdown={body}
            />
            <main className="ew-vt-main flex-1">{children}</main>
            <SiteFooter />
          </div>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  )
}
