import { cn } from "~/lib/utils"

interface OrgConnectorProps {
  direction?: "vertical" | "horizontal"
  active?: boolean
  team?: "forge" | "product" | "admin"
  length?: number
  className?: string
}

const teamStroke: Record<string, string> = {
  forge:   "var(--forge-ember)",
  product: "var(--forge-plasma)",
  admin:   "var(--forge-mint)",
}

function OrgConnector({
  direction = "vertical",
  active = false,
  team = "product",
  length = 40,
  className,
}: OrgConnectorProps) {
  const stroke = teamStroke[team] ?? teamStroke.product
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
        stroke="var(--forge-line)"
        strokeWidth={isVertical ? 2 : 2}
      />
      {/* Active energy pulse */}
      {active && (
        <line
          x1={isVertical ? 1 : 0}
          y1={isVertical ? 0 : 1}
          x2={isVertical ? 1 : w}
          y2={isVertical ? h : 1}
          stroke={stroke}
          strokeWidth={isVertical ? 2 : 2}
          strokeDasharray="6 6"
          className="animate-forge-conveyor"
          style={{ opacity: 0.7 }}
        />
      )}
    </svg>
  )
}

export { OrgConnector }
