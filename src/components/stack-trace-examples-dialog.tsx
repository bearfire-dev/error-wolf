import { useCallback, useState } from "react"

import { InformationCircleIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { StackTraceExample } from "@/lib/example-traces"

function previewText(content: string, maxChars: number): string {
  const t = content.trim()
  if (t.length <= maxChars) return t
  return `${t.slice(0, maxChars).trimEnd()}…`
}

export function StackTraceExamplesDialog({
  examples,
  onLoadExample,
}: {
  examples: StackTraceExample[]
  onLoadExample: (content: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const handleCopy = useCallback(async (ex: StackTraceExample) => {
    try {
      await navigator.clipboard.writeText(ex.content)
      setCopiedId(ex.id)
      window.setTimeout(() => setCopiedId(null), 1200)
    } catch {
      // ignore
    }
  }, [])

  const handleLoad = useCallback(
    (ex: StackTraceExample) => {
      onLoadExample(ex.content)
      setOpen(false)
    },
    [onLoadExample]
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={() => setOpen(true)}
        aria-label="Info and sample stack traces"
        title="Info and sample stack traces"
      >
        <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} />
      </Button>
      <DialogContent
        className="max-h-[min(90vh,40rem)] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle>
            <span className="text-primary">&gt;&nbsp;</span>how to use
          </DialogTitle>
          <DialogDescription className="font-mono text-xs/relaxed">
            Paste a full error log or stack trace from your terminal, CI, or
            browser. More context (paths, tool names, surrounding lines) helps.
          </DialogDescription>
        </DialogHeader>

        {examples.length > 0 ? (
          <p className="font-mono text-xs tracking-wider text-foreground uppercase">
            <span className="text-primary">&gt;&nbsp;</span>
            example traces
          </p>
        ) : null}

        {examples.length === 0 ? (
          <p className="font-mono text-xs text-muted-foreground">
            &gt; no .txt files found in examples/
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {examples.map((ex) => (
              <div
                key={ex.id}
                className="flex flex-col gap-2 border border-foreground/15 bg-card/30 p-3 dark:bg-card/20"
              >
                <p className="font-mono text-[0.625rem] tracking-wider text-muted-foreground uppercase">
                  {ex.title}
                </p>
                <pre className="no-scrollbar max-h-28 overflow-y-auto font-mono text-[0.625rem] leading-snug break-words whitespace-pre-wrap text-foreground/85">
                  {previewText(ex.content, 480)}
                </pre>
                <div className="mt-auto flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="xs"
                    variant="secondary"
                    onClick={() => handleLoad(ex)}
                  >
                    load
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => void handleCopy(ex)}
                  >
                    {copiedId === ex.id ? "copied" : "copy"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
