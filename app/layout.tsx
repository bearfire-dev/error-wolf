import type { Metadata } from "next"
import { Space_Mono } from "next/font/google"
import { ViewTransition } from "react"

import "./globals.css"
import { SiteBackgroundLayer } from "@/components/site-background-layer"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-space-mono",
})

export const metadata: Metadata = {
  title: {
    default: "error-wolf",
    template: "%s · error-wolf",
  },
  description: "collapse noisy error stacks. save tokens.",
  icons: {
    icon: [
      {
        url: "/favicon-light.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", spaceMono.variable)}
    >
      <body>
        <ThemeProvider>
          <SiteBackgroundLayer />
          <div className="relative z-10 isolate flex min-h-svh flex-col">
            <SiteHeader />
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
