import * as React from "react"
import { cn } from "~/lib/utils"

interface TogglePillOption {
  value: string
  label: string
  /** Active-state classes (e.g., "bg-success/20 text-success border-success/30") */
  activeClass?: string
  icon?: React.ReactNode
}

interface TogglePillGroupProps {
  options: TogglePillOption[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  /** Default active class if not provided per-option */
  defaultActiveClass?: string
  className?: string
}

function TogglePillGroup({
  options,
  value,
  onChange,
  disabled = false,
  defaultActiveClass = "bg-accent-porter/20 text-accent-porter border-accent-porter/30",
  className,
}: TogglePillGroupProps) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {options.map(opt => {
        const isActive = value === opt.value
        const activeClass = opt.activeClass ?? defaultActiveClass
        return (
          <button
            key={opt.value}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              "px-2 py-0.5 rounded-md text-2xs font-medium border transition-all cursor-pointer disabled:opacity-50",
              isActive ? activeClass : "bg-raised text-text3 border-transparent hover:bg-raised/80",
              opt.icon && "inline-flex items-center gap-0.5"
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

export { TogglePillGroup, type TogglePillOption, type TogglePillGroupProps }
