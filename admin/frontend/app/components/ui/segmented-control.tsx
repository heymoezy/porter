import * as React from "react"
import { cn } from "~/lib/utils"

interface SegmentedControlOption<T extends string = string> {
  value: T
  label: string
  count?: number
}

interface SegmentedControlProps<T extends string = string> {
  options: SegmentedControlOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}

function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div className={cn("inline-flex items-center rounded-lg border border-border bg-raised p-0.5", className)}>
      {options.map(opt => {
        const isActive = value === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "px-3 py-1 rounded-md text-xs font-medium transition-all",
              isActive
                ? "bg-surface text-text shadow-sm"
                : "text-text3 hover:text-text"
            )}
          >
            {opt.label}
            {opt.count !== undefined && (
              <span className={cn(
                "ml-1 text-2xs tabular-nums",
                isActive ? "text-text3" : "opacity-50"
              )}>
                {opt.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export { SegmentedControl, type SegmentedControlOption, type SegmentedControlProps }
