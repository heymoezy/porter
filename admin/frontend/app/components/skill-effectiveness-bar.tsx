interface EffectivenessProps {
  positive: number
  negative: number
  score: number | null
  timesSelected: number
  compact?: boolean // true = inline badge, false = full bar
}

export function SkillEffectivenessBar({
  positive,
  negative,
  score,
  timesSelected,
  compact,
}: EffectivenessProps) {
  if (score === null || score === undefined) {
    return <span className="text-xs text-text3">No data</span>
  }

  const pct = Math.round(score * 100)
  const color = pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500"
  const textColor =
    pct >= 70 ? "text-green-400" : pct >= 40 ? "text-yellow-400" : "text-red-400"

  if (compact) {
    return <span className={`text-xs font-medium ${textColor}`}>{pct}%</span>
  }

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded bg-surface overflow-hidden">
        <div className={`h-full rounded ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-medium ${textColor}`}>{pct}%</span>
      <span className="text-2xs text-text3">
        ({positive}+ {negative}-)
      </span>
      {timesSelected > 0 && (
        <span className="text-2xs text-text3">{timesSelected} uses</span>
      )}
    </div>
  )
}
