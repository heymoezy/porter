import * as React from "react"
import { cn } from "~/lib/utils"

interface MiniMetricProps {
  label: string
  value: string | number
  colorClass?: string
  className?: string
}

function MiniMetric({ label, value, colorClass = "text-text", className }: MiniMetricProps) {
  return (
    <div className={cn("text-center min-w-[64px] px-2 py-1 rounded-lg bg-raised", className)}>
      <p className={cn("text-sm font-bold tabular-nums leading-none", colorClass)}>{value}</p>
      <p className="text-2xs text-text3 uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  )
}

export { MiniMetric, type MiniMetricProps }
