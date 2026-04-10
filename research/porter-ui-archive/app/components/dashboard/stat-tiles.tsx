import {
  FolderKanban, Bot, Check, Sparkles, BarChart2, ArrowRight,
} from "lucide-react"
import { AnimCount } from "~/components/ui/anim-count"
import type { LucideIcon } from "lucide-react"

interface StatTilesProps {
  mounted: boolean
  tokenCount: number
}

interface StatDef {
  label: string
  value: number
  icon: LucideIcon
  color: string
  sub: string
}

export function StatTiles({ mounted, tokenCount }: StatTilesProps) {
  const stats: StatDef[] = [
    { label: "Projects", value: 4, icon: FolderKanban, color: "text-accent-porter", sub: "3 active" },
    { label: "Agents", value: 6, icon: Bot, color: "text-success", sub: "3 working" },
    { label: "Tasks", value: 17, icon: Check, color: "text-warning", sub: "today" },
    { label: "Decisions", value: 12, icon: Sparkles, color: "text-chart-2", sub: "4 swaps" },
    { label: "Tokens", value: tokenCount, icon: BarChart2, color: "text-chart-3", sub: "today" },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      {stats.map((s, i) => (
        <div
          key={s.label}
          className={`group rounded-lg border border-border bg-surface px-3 py-2 cursor-pointer transition-all duration-300 hover:border-accent-porter/30 hover:-translate-y-px hover:shadow-[var(--shadow-sm)] ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
          }`}
          style={{ transitionDelay: `${80 + i * 50}ms` }}
        >
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-text3">{s.label}</p>
            <s.icon className={`h-3 w-3 ${s.color}`} />
          </div>
          <p className="text-lg font-bold text-foreground tabular-nums leading-tight">
            {s.label === "Tokens" ? tokenCount.toLocaleString() : <AnimCount to={s.value} />}
          </p>
          <div className="flex items-center justify-between">
            <p className="text-[8px] text-text3">{s.sub}</p>
            <ArrowRight className="h-2.5 w-2.5 text-text3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      ))}
    </div>
  )
}
