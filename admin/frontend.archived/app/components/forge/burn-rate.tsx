import { cn } from "~/lib/utils"
import { MiniMetric } from "~/components/ui/mini-metric"

interface BurnRateProps {
  tokensPerHour: number
  dailyCost: number
  budgetRemaining: number
  budgetTotal: number
  className?: string
}

function BurnRate({ tokensPerHour, dailyCost, budgetRemaining, budgetTotal, className }: BurnRateProps) {
  const pct = budgetTotal > 0 ? Math.round((budgetRemaining / budgetTotal) * 100) : 100
  const budgetColor = pct > 50 ? "text-success" : pct > 20 ? "text-warning" : "text-danger"

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <MiniMetric label="Tokens/hr" value={tokensPerHour > 1000 ? `${(tokensPerHour / 1000).toFixed(1)}K` : String(tokensPerHour)} colorClass="text-text" />
      <MiniMetric label="Daily cost" value={`$${dailyCost.toFixed(2)}`} colorClass="text-text" />
      <MiniMetric label="Budget" value={`${pct}%`} colorClass={budgetColor} />
    </div>
  )
}

export { BurnRate }
export type { BurnRateProps }
