"use client"

import * as React from "react"
import { Menu } from "@base-ui/react/menu"

import { cn } from "@/lib/utils"

type SelectContextValue = {
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
}

const SelectContext = React.createContext<SelectContextValue | null>(null)

function useSelectContext(name: string) {
  const ctx = React.useContext(SelectContext)
  if (!ctx) {
    throw new Error(`${name} must be used within <Select>`)
  }
  return ctx
}

function Select({
  value,
  onValueChange,
  disabled,
  children,
}: {
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  children: React.ReactNode
}) {
  const store = React.useMemo(
    () => ({ value, onValueChange, disabled }),
    [value, onValueChange, disabled]
  )
  return (
    <SelectContext.Provider value={store}>
      <Menu.Root modal={false} disabled={disabled}>
        {children}
      </Menu.Root>
    </SelectContext.Provider>
  )
}

function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Menu.Trigger>) {
  const { disabled } = useSelectContext("SelectTrigger")
  return (
    <Menu.Trigger
      type="button"
      data-slot="select-trigger"
      disabled={disabled}
      className={cn(
        "inline-flex h-8 min-w-[6.5rem] shrink-0 items-center justify-between gap-1.5 rounded-[2px] border border-foreground/25 bg-card px-2 py-0.5 font-mono text-[0.6875rem] tracking-wider text-foreground uppercase transition-colors outline-none dark:bg-card",
        "hover:border-foreground/40 data-popup-open:border-primary data-popup-open:ring-2 data-popup-open:ring-primary/20",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    >
      <span className="min-w-0 flex-1 truncate text-left">{children}</span>
      <span aria-hidden className="shrink-0 text-muted-foreground opacity-80">
        ▾
      </span>
    </Menu.Trigger>
  )
}

function SelectContent({
  className,
  align = "end",
  children,
}: {
  className?: string
  align?: "start" | "center" | "end"
  children: React.ReactNode
}) {
  const { value, onValueChange } = useSelectContext("SelectContent")
  return (
    <Menu.Portal>
      <Menu.Positioner
        className="z-50 outline-none"
        sideOffset={4}
        align={align}
      >
        <Menu.Popup
          data-slot="select-content"
          className={cn(
            "min-w-[var(--anchor-width)] origin-[var(--transform-origin)] rounded-[2px] border border-foreground/25 bg-popover p-1 text-popover-foreground shadow-md outline-none",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            "duration-150",
            className
          )}
        >
          <Menu.RadioGroup
            value={value}
            onValueChange={(next) => {
              if (typeof next === "string") onValueChange(next)
            }}
            className="flex flex-col gap-0.5"
          >
            {children}
          </Menu.RadioGroup>
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  )
}

function SelectItem({
  className,
  value,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Menu.RadioItem>, "value"> & {
  value: string
}) {
  return (
    <Menu.RadioItem
      value={value}
      closeOnClick
      data-slot="select-item"
      className={cn(
        "flex cursor-pointer items-center rounded-[2px] px-2 py-1.5 font-mono text-[0.6875rem] tracking-wider text-foreground uppercase transition-colors outline-none",
        "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        "data-checked:bg-primary/15 data-checked:text-primary",
        className
      )}
      {...props}
    >
      {children}
    </Menu.RadioItem>
  )
}

export { Select, SelectContent, SelectItem, SelectTrigger }
