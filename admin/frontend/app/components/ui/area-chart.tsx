/**
 * AreaChart — SVG area chart with gradient fill, smooth line, glow, and end marker.
 *
 * CANONICAL SOURCE: porter-admin design system.
 * Use for revenue, growth, and trend visualization.
 */
import { cn } from "~/lib/utils"

interface AreaChartProps {
  values: number[]
  color?: string
  height?: number
  className?: string
  animate?: boolean
  glow?: boolean
}

export function AreaChart({
  values,
  color = "var(--accent-porter)",
  height = 80,
  className,
  animate = true,
  glow = true,
}: AreaChartProps) {
  if (values.length < 2) return null

  const max = Math.max(...values) || 1
  const range = max || 1

  // Wide viewBox for landscape charts
  const vw = 400
  const vh = 120
  const padX = 2
  const padTop = 8
  const padBot = 4
  const chartW = vw - padX * 2
  const chartH = vh - padTop - padBot

  const points = values.map((v, i) => ({
    x: padX + (i / (values.length - 1)) * chartW,
    y: padTop + chartH - (v / range) * chartH,
  }))

  // Catmull-Rom to cubic bezier for smooth curves
  function smoothPath(pts: { x: number; y: number }[]): string {
    if (pts.length < 2) return ""
    let d = `M ${pts[0].x},${pts[0].y}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)]
      const p1 = pts[i]
      const p2 = pts[i + 1]
      const p3 = pts[Math.min(pts.length - 1, i + 2)]
      const tension = 4
      const cp1x = p1.x + (p2.x - p0.x) / tension
      const cp1y = p1.y + (p2.y - p0.y) / tension
      const cp2x = p2.x - (p3.x - p1.x) / tension
      const cp2y = p2.y - (p3.y - p1.y) / tension
      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`
    }
    return d
  }

  const linePath = smoothPath(points)
  const baseline = vh - padBot
  const areaPath = `${linePath} L ${points[points.length - 1].x},${baseline} L ${points[0].x},${baseline} Z`
  const uid = `ac-${Math.random().toString(36).slice(2, 8)}`
  const lastPt = points[points.length - 1]

  return (
    <svg
      viewBox={`0 0 ${vw} ${vh}`}
      preserveAspectRatio="xMinYMax meet"
      className={cn("w-full block", className)}
      style={{ height }}
    >
      <defs>
        <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.4} />
          <stop offset="60%" stopColor={color} stopOpacity={0.1} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
        {glow && (
          <filter id={`${uid}-glow`}>
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>

      {/* Area fill */}
      <path
        d={areaPath}
        fill={`url(#${uid}-fill)`}
        className={animate ? "animate-in fade-in duration-1000" : ""}
      />

      {/* Glow line */}
      {glow && (
        <path d={linePath} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" opacity={0.12} filter={`url(#${uid}-glow)`} />
      )}

      {/* Main line */}
      <path d={linePath} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
        className={animate ? "animate-in fade-in duration-700" : ""} />

      {/* End dot with glow */}
      <circle cx={lastPt.x} cy={lastPt.y} r={8} fill={color} opacity={0.12} className={animate ? "animate-pulse" : ""} />
      <circle cx={lastPt.x} cy={lastPt.y} r={3.5} fill={color} />
    </svg>
  )
}
