import { cn } from "~/lib/utils"

interface ConveyorLineProps {
  active?: boolean
  length?: number
  className?: string
}

function ConveyorLine({ active = false, length = 60, className }: ConveyorLineProps) {
  return (
    <svg width={length} height={4} viewBox={`0 0 ${length} 4`} className={cn("shrink-0", className)} aria-hidden>
      {/* Track */}
      <line x1={0} y1={2} x2={length} y2={2} stroke="var(--forge-line)" strokeWidth={2} />
      {/* Animated flow */}
      {active && (
        <line
          x1={0} y1={2} x2={length} y2={2}
          stroke="var(--forge-ember)"
          strokeWidth={2}
          strokeDasharray="8 12"
          className="animate-forge-conveyor"
          style={{ opacity: 0.7 }}
        />
      )}
    </svg>
  )
}

export { ConveyorLine }
