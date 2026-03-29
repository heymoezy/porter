"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "radix-ui"
import { cn } from "~/lib/utils"

// ── Types ────────────────────────────────────────────────

type TabVariant = "page" | "content" | "file"

const TabVariantCtx = React.createContext<TabVariant>("content")

// ── useTabIndicator ──────────────────────────────────────

function useTabIndicator(listRef: React.RefObject<HTMLDivElement | null>) {
  const [vars, setVars] = React.useState<Record<string, string>>({})
  const [ready, setReady] = React.useState(false)

  const measure = React.useCallback(() => {
    const list = listRef.current
    if (!list) return
    const active = list.querySelector<HTMLElement>('[data-state="active"]')
    if (!active) return

    const listRect = list.getBoundingClientRect()
    const tabRect = active.getBoundingClientRect()

    setVars({
      "--tab-left": `${tabRect.left - listRect.left}px`,
      "--tab-top": `${tabRect.top - listRect.top}px`,
      "--tab-width": `${tabRect.width}px`,
      "--tab-height": `${tabRect.height}px`,
    })
    setReady(true)
  }, [listRef])

  React.useEffect(() => {
    const raf = requestAnimationFrame(measure)
    const list = listRef.current
    if (!list) return () => cancelAnimationFrame(raf)
    const observer = new MutationObserver(measure)
    observer.observe(list, { attributes: true, subtree: true, attributeFilter: ["data-state"] })
    window.addEventListener("resize", measure)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [measure, listRef])

  return { vars, ready }
}

// ── Tabs Root ────────────────────────────────────────────

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn("group/tabs flex gap-2 data-horizontal:flex-col", className)}
      {...props}
    />
  )
}

// ── Theme-aware indicator ────────────────────────────────

const INDICATOR: Record<TabVariant, string> = {
  page: "rounded-lg bg-raised shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_0_1px_var(--accent-porter)/14,0_4px_12px_rgba(0,0,0,0.12)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_0_1px_rgba(99,102,241,0.14),0_8px_24px_rgba(0,0,0,0.28),0_0_20px_rgba(99,102,241,0.12)]",
  content: "rounded-md bg-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_0_1px_var(--accent-porter)/10,0_2px_8px_rgba(0,0,0,0.08)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_0_1px_rgba(99,102,241,0.12),0_4px_14px_rgba(0,0,0,0.24)]",
  file: "rounded-lg bg-raised shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_0_1px_var(--accent-porter)/16,0_4px_12px_rgba(0,0,0,0.12)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_0_1px_rgba(99,102,241,0.18),0_8px_24px_rgba(0,0,0,0.34),0_0_28px_rgba(99,102,241,0.15)]",
}

// ── TabsList ─────────────────────────────────────────────

const LIST: Record<TabVariant, string> = {
  page: "relative inline-flex h-10 items-center gap-0.5 rounded-xl border border-border bg-muted p-1 backdrop-blur-xl",
  content: "relative inline-flex h-9 items-center gap-0.5 rounded-lg border border-border bg-muted p-0.5 backdrop-blur-md",
  file: "relative inline-flex h-10 items-center gap-0.5 overflow-x-auto rounded-xl border border-border bg-muted p-1 backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
}

interface TabsListProps extends React.ComponentProps<typeof TabsPrimitive.List> {
  variant?: TabVariant
}

function TabsList({ className, variant = "content", children, ...props }: TabsListProps) {
  const listRef = React.useRef<HTMLDivElement>(null)
  const { vars, ready } = useTabIndicator(listRef)

  return (
    <TabVariantCtx.Provider value={variant}>
      <TabsPrimitive.List
        ref={listRef}
        data-slot="tabs-list"
        data-variant={variant}
        className={cn(LIST[variant], className)}
        {...props}
      >
        {/* Sliding indicator */}
        <div
          aria-hidden
          className={cn(
            "absolute z-0 pointer-events-none",
            "transition-all duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
            "motion-reduce:transition-none",
            INDICATOR[variant],
          )}
          style={{
            left: vars["--tab-left"] ?? 0,
            top: vars["--tab-top"] ?? 0,
            width: vars["--tab-width"] ?? 0,
            height: vars["--tab-height"] ?? 0,
            opacity: ready ? 1 : 0,
          }}
        />
        {children}
      </TabsPrimitive.List>
    </TabVariantCtx.Provider>
  )
}

// ── TabsTrigger ──────────────────────────────────────────

const TRIGGER: Record<TabVariant, string> = {
  page: "relative z-10 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium tracking-[-0.01em] text-text2 transition-[color,transform] duration-200 ease-out hover:text-foreground data-[state=active]:text-foreground data-[state=active]:font-semibold",
  content: "relative z-10 inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-2.5 text-2xs font-medium tracking-[-0.01em] text-text3 transition-all duration-200 ease-out hover:text-foreground data-[state=active]:text-foreground data-[state=active]:font-semibold",
  file: "relative z-10 inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-2xs font-medium uppercase tracking-[0.08em] text-text3 transition-[color,background,transform] duration-200 ease-out hover:text-foreground data-[state=active]:text-foreground data-[state=active]:font-semibold",
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const variant = React.useContext(TabVariantCtx)

  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        TRIGGER[variant],
        "disabled:pointer-events-none disabled:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className
      )}
      {...props}
    />
  )
}

// ── TabsContent ──────────────────────────────────────────

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

type TabsTriggerProps = React.ComponentProps<typeof TabsPrimitive.Trigger>

export { Tabs, TabsList, TabsTrigger, TabsContent }
export type { TabVariant, TabsListProps, TabsTriggerProps }
