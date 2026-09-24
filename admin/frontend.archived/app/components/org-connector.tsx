import { cn } from "~/lib/utils"

interface OrgConnectorProps {
  direction?: "vertical" | "horizontal"
  active?: boolean
  length?: number
  className?: string
}

function OrgConnector({
  direction = "vertical",
  active = false,
  length = 40,
  className,
}: OrgConnectorProps) {
  const isVertical = direction === "vertical"

  const w = isVertical ? 2 : length
  const h = isVertical ? length : 2

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={cn("shrink-0", className)}
      aria-hidden
    >
      {/* Base line */}
      <line
        x1={isVertical ? 1 : 0}
        y1={isVertical ? 0 : 1}
        x2={isVertical ? 1 : w}
        y2={isVertical ? h : 1}
        className="stroke-border"
        strokeWidth={isVertical ? 2 : 2}
      />
      {/* Active energy pulse */}
      {active && (
        <line
          x1={isVertical ? 1 : 0}
          y1={isVertical ? 0 : 1}
          x2={isVertical ? 1 : w}
          y2={isVertical ? h : 1}
          strokeWidth={isVertical ? 2 : 2}
          strokeDasharray="6 6"
          className="stroke-accent-porter opacity-70 animate-conveyor"
        />
      )}
    </svg>
  )
}

export { OrgConnector }
