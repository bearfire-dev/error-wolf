import type { Metadata } from "next"
import { Space_Mono } from "next/font/google"

import "./globals.css"
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
  description: "collapse noisy stacks. ship clean issues.",
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
          <div className="isolate flex min-h-svh flex-col">
            <SiteHeader />
            <main className="flex-1">{children}</main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
