import * as React from "react"
import { cn } from "~/lib/utils"

interface MiniMetricProps {
  label: string
  value: string | number
  colorClass?: string
  className?: string
  /**
   * compact: the small centred tile (Bridge cost strip).
   * card: the page-level stat card, label on top, large value, optional icon and sub line.
   */
  variant?: "compact" | "card"
  icon?: React.ComponentType<{ className?: string }>
  sub?: React.ReactNode
}

function MiniMetric({ label, value, colorClass = "text-text", className, variant = "compact", icon: Icon, sub }: MiniMetricProps) {
  if (variant === "card") {
    return (
      <div data-slot="mini-metric" data-variant="card" className={cn("rounded-lg border border-border bg-surface p-4", className)}>
        <div className="mb-1 flex items-center gap-2">
          {Icon && <Icon className="size-3.5 text-text3" />}
          <span className="text-xs text-text3">{label}</span>
        </div>
        <div className={cn("text-2xl font-semibold tabular-nums", colorClass)}>{value}</div>
        {sub && <p className="mt-0.5 text-xs text-text3">{sub}</p>}
      </div>
    )
  }
  return (
    <div data-slot="mini-metric" className={cn("text-center min-w-[64px] px-2 py-1 rounded-lg bg-raised", className)}>
      <p className={cn("text-sm font-bold tabular-nums leading-none", colorClass)}>{value}</p>
      <p className="text-2xs text-text3 uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  )
}

export { MiniMetric, type MiniMetricProps }
