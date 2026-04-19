import { SiteFooterCrashTestButton } from "@/components/site-footer-crash-test-button"

const linkCreditClass =
  "underline-offset-2 hover:text-foreground hover:underline pointer-events-auto"

export function SiteFooter() {
  return (
    <footer
      className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 px-4 pb-3 sm:px-6"
      aria-label="Page credits"
    >
      <p className="max-w-[min(100%,28rem)] font-mono text-[0.625rem] leading-snug text-muted-foreground sm:text-xs">
        photo by{" "}
        <a
          href="https://unsplash.com/@jardenbell?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText"
          className={linkCreditClass}
          target="_blank"
          rel="noopener noreferrer"
        >
          Jarden Bellamkonda
        </a>{" "}
        on{" "}
        <a
          href="https://unsplash.com/photos/snowy-mountain-peak-amidst-a-cloudy-sky-hiqo3s7-VZA?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText"
          className={linkCreditClass}
          target="_blank"
          rel="noopener noreferrer"
        >
          Unsplash
        </a>
      </p>
      <div className="ml-auto flex shrink-0 flex-col items-end gap-2 text-right font-mono text-[0.625rem] text-muted-foreground sm:text-xs">
        <SiteFooterCrashTestButton />
        <p>
          created by{" "}
          <a
            href="https://slaterehm.com"
            className={linkCreditClass}
            target="_blank"
            rel="noopener noreferrer"
          >
            Slate
          </a>
        </p>
      </div>
    </footer>
  )
}
