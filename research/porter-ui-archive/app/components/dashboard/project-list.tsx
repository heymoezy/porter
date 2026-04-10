import { useState } from "react"
import { useMountEffect } from "~/hooks/use-mount-effect"
import { Badge } from "~/components/ui/badge"
import { Sparkline } from "~/components/ui/sparkline"
import { Plus } from "lucide-react"

interface ProjectListProps {
  mounted: boolean
  maxItems?: number
}

const PROJECTS = [
  { name: "Marketing Site", type: "website", status: "active", progress: 65, agents: 3, spark: [3,5,8,4,7,9,6,8],
    tasks: ["Hero section design review", "Finalize navigation structure", "Write homepage copy", "Set up analytics"] },
  { name: "Brand Guide", type: "design", status: "active", progress: 30, agents: 2, spark: [1,2,4,3,5,2,3,4],
    tasks: ["Color palette finalization", "Typography selection", "Logo usage guidelines", "Export brand assets"] },
  { name: "API Docs", type: "content", status: "paused", progress: 80, agents: 1, spark: [6,4,2,1,1,0,0,1],
    tasks: ["Waiting for endpoint changes", "Update auth section", "Add code examples"] },
  { name: "Mobile App", type: "app", status: "active", progress: 12, agents: 4, spark: [0,0,1,3,5,7,9,11],
    tasks: ["Wireframe first 3 screens", "Set up React Native project", "Design onboarding flow", "Build login screen"] },
]

export function ProjectList({ mounted, maxItems }: ProjectListProps) {
  const [taskIdx, setTaskIdx] = useState(0)

  useMountEffect(() => {
    const id = setInterval(() => setTaskIdx(i => i + 1), 8000)
    return () => clearInterval(id)
  })

  const items = PROJECTS.slice(0, maxItems ?? PROJECTS.length)
  return (
    <div className="min-w-0 flex flex-col h-full">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <h2 className="text-xs font-bold text-foreground uppercase tracking-wide">Projects</h2>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 text-[10px] font-bold text-accent-porter hover:underline">
            <Plus className="h-3 w-3" /> New
          </button>
          <button className="text-[10px] text-text3 hover:text-accent-porter transition-colors">all &rarr;</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin space-y-2 pt-px">
        {items.map((p, i) => (
          <div
            key={p.name}
            className={`group rounded-lg border border-border bg-surface p-3 cursor-pointer transition-all duration-[var(--duration-fast)] hover:border-accent-porter/30 hover:shadow-[var(--shadow-card)] hover:-translate-y-px ${
              mounted ? "animate-card-deal-in" : "opacity-0"
            }`}
            style={{ animationDelay: `calc(var(--duration-normal) + ${i} * var(--stagger-delay) * 2)`, animationFillMode: "both" }}
          >
            <div className="flex items-center gap-2">
              <p className="text-xs font-bold text-foreground truncate flex-1 min-w-0">{p.name}</p>
              <Sparkline values={p.spark} />
              <Badge
                className={`text-[8px] px-1 py-0 ${
                  p.status === "active" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                }`}
              >
                {p.status}
              </Badge>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex-1 h-1 rounded-full bg-raised overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent-porter transition-all duration-[var(--duration-chart)] ease-out"
                  style={{ width: mounted ? `${p.progress}%` : "0%" }}
                />
              </div>
              <span className="text-[9px] text-text3 tabular-nums w-6">{p.progress}%</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <p className="text-[10px] text-text3 truncate flex-1 min-w-0 transition-opacity duration-[var(--duration-slow)]">
                <span className="text-text2">Next:</span> {p.tasks[taskIdx % p.tasks.length]}
              </p>
              <span className="text-[9px] text-text3">{p.agents} agents</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
