interface SparklineProps {
  values: number[]
  color?: string
  height?: number
}

export function Sparkline({ values, color = "var(--accent-porter)", height = 16 }: SparklineProps) {
  const max = Math.max(...values)

  return (
    <div className="inline-flex items-end gap-px" style={{ height }}>
      {values.map((x, i) => (
        <div
          key={i}
          className="w-[3px] rounded-sm"
          style={{
            height: `${Math.max(15, (x / max) * 100)}%`,
            background: color,
            opacity: 0.3 + (x / max) * 0.7,
          }}
        />
      ))}
    </div>
  )
}
