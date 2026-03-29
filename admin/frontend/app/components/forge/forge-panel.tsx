import * as React from "react"
import { cn } from "~/lib/utils"

type ForgePanelVariant = "default" | "active" | "plasma" | "mint"

interface ForgePanelProps extends React.ComponentProps<"div"> {
  variant?: ForgePanelVariant
}

const variantClasses: Record<ForgePanelVariant, string> = {
  default: "forge-panel",
  active: "forge-panel forge-panel-active animate-forge-heat",
  plasma: "forge-panel border-[color-mix(in_srgb,var(--forge-plasma)_25%,transparent)] shadow-[var(--forge-glow-plasma)]",
  mint: "forge-panel border-[color-mix(in_srgb,var(--forge-mint)_25%,transparent)] shadow-[var(--forge-glow-mint)]",
}

function ForgePanel({ className, variant = "default", children, ...props }: ForgePanelProps) {
  return (
    <div
      data-slot="forge-panel"
      data-variant={variant}
      className={cn(
        "relative overflow-hidden rounded-xl p-3 text-sm text-[var(--text)]",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

function ForgePanelHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="forge-panel-header"
      className={cn("flex items-center gap-2 pb-2", className)}
      {...props}
    />
  )
}

function ForgePanelContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="forge-panel-content"
      className={cn("", className)}
      {...props}
    />
  )
}

export { ForgePanel, ForgePanelHeader, ForgePanelContent }
export type { ForgePanelVariant }
