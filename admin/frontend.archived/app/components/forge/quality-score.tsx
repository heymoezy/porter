import { cn } from "~/lib/utils"

interface QualityRubric {
  completeness: number
  specificity: number
  consistency: number
  quality: number
}

interface QualityScoreProps {
  score: number
  rubric?: QualityRubric
  compact?: boolean
  className?: string
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-success"
  if (score >= 60) return "text-warning"
  return "text-danger"
}

function scoreBg(score: number): string {
  if (score >= 80) return "bg-success"
  if (score >= 60) return "bg-warning"
  return "bg-danger"
}

function QualityScore({ score, rubric, compact = false, className }: QualityScoreProps) {
  if (compact) {
    return (
      <span className={cn("text-xs font-bold tabular-nums", scoreColor(score), className)}>
        {score}
      </span>
    )
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {/* Overall score */}
      <div className="flex items-center gap-2">
        <span className={cn("text-lg font-bold tabular-nums", scoreColor(score))}>{score}</span>
        <span className="text-2xs text-text3">/100</span>
        <div className="flex-1 h-1.5 rounded-full bg-raised overflow-hidden">
          <div className={cn("h-full rounded-full transition-all", scoreBg(score))} style={{ width: `${score}%` }} />
        </div>
      </div>

      {/* Rubric breakdown */}
      {rubric && (
        <div className="grid grid-cols-4 gap-1.5">
          {(["completeness", "specificity", "consistency", "quality"] as const).map(dim => (
            <div key={dim} className="text-center">
              <div className="h-1 rounded-full bg-raised overflow-hidden mb-0.5">
                <div className={cn("h-full rounded-full", scoreBg(rubric[dim]))} style={{ width: `${rubric[dim] * 4}%` }} />
              </div>
              <span className={cn("text-2xs font-bold tabular-nums", scoreColor(rubric[dim] * 4))}>{rubric[dim]}</span>
              <p className="text-2xs text-text3 capitalize">{dim.slice(0, 4)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export { QualityScore }
export type { QualityScoreProps, QualityRubric }
