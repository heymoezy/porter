import { useState } from "react"
import { Link } from "react-router"
import { type Customer, planDisplayLabel, useUpdatePipelineStage } from "~/hooks/use-admin-api"
import { Badge } from "~/components/ui/badge"

const STAGES = [
  { id: "acquired",  label: "Acquired" },
  { id: "activated", label: "Activated" },
  { id: "revenue",   label: "Revenue" },
  { id: "churned",   label: "Churned" },
] as const

type Stage = typeof STAGES[number]["id"]

interface PipelineViewProps {
  customers: Customer[]
  preLaunch: boolean
}

function resolveStage(c: Customer): Stage {
  if (c.pipeline_stage && (STAGES.map(s => s.id) as string[]).includes(c.pipeline_stage)) {
    return c.pipeline_stage as Stage
  }
  // Fallback (churned must be explicitly set)
  if (c.plan !== "free" && c.sub_status === "active") return "revenue"
  if (c.project_count > 0) return "activated"
  return "acquired"
}

function formatRelative(ts: number | null) {
  if (!ts) return "never"
  const diff = Date.now() / 1000 - ts
  if (diff < 60) return "just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function healthDotClass(health: number) {
  if (health >= 70) return "bg-success"
  if (health >= 40) return "bg-warning"
  return "bg-danger"
}

function planBadge(c: Customer, preLaunch: boolean) {
  const label = planDisplayLabel(c, preLaunch)
  if (label.includes("lifetime")) {
    return <Badge variant="default" className="bg-accent-porter/15 text-accent-porter border-0 text-2xs">{label}</Badge>
  }
  if (label.includes("Cloud") || label.includes("Team") || label.includes("Enterprise")) {
    return <Badge variant="default" className="bg-success/15 text-success border-0 text-2xs">{label}</Badge>
  }
  if (label.includes("Trial")) {
    return <Badge variant="default" className="bg-warning/15 text-warning border-0 text-2xs">{label}</Badge>
  }
  if (label.includes("pre-launch")) {
    return <Badge variant="outline" className="text-text2 border-text3/20 text-2xs">{label}</Badge>
  }
  return <Badge variant="outline" className="text-text3 border-text3/20 text-2xs">{label}</Badge>
}

export function PipelineView({ customers, preLaunch }: PipelineViewProps) {
  const { mutate } = useUpdatePipelineStage()
  // Local overrides: { username: stage } — applied on top of server data for optimistic UI
  const [overrides, setOverrides] = useState<Record<string, Stage>>({})
  const [dragOverStage, setDragOverStage] = useState<Stage | null>(null)

  function effectiveStage(c: Customer): Stage {
    return overrides[c.username] ?? resolveStage(c)
  }

  function handleDrop(e: React.DragEvent, targetStage: Stage) {
    e.preventDefault()
    const username = e.dataTransfer.getData("username")
    if (!username) return
    setDragOverStage(null)
    // Optimistic update
    setOverrides(prev => ({ ...prev, [username]: targetStage }))
    mutate(
      { username, stage: targetStage },
      {
        onSuccess: () => {
          // Cache refetch from invalidation will replace server state; clean up local override
          setOverrides(prev => {
            const next = { ...prev }
            delete next[username]
            return next
          })
        },
        onError: () => {
          // Revert optimistic update on failure
          setOverrides(prev => {
            const next = { ...prev }
            delete next[username]
            return next
          })
        },
      }
    )
  }

  return (
    <div className="grid grid-cols-4 gap-3">
      {STAGES.map(stage => {
        const stageCustomers = customers.filter(c => effectiveStage(c) === stage.id)
        const isOver = dragOverStage === stage.id

        return (
          <div key={stage.id} className="flex flex-col gap-3">
            {/* Column header */}
            <div className="flex items-center gap-2 px-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-text3">
                {stage.label}
              </span>
              <span className="text-2xs text-text3 tabular-nums">
                {stageCustomers.length}
              </span>
            </div>

            {/* Drop zone */}
            <div
              className={[
                "min-h-[120px] rounded-xl border border-dashed border-border2 bg-raised/40 p-2 flex flex-col gap-2 transition-colors",
                isOver ? "border-accent-porter/50 bg-accent-porter/5" : "",
              ].join(" ")}
              onDragOver={(e) => e.preventDefault()}
              onDragEnter={() => setDragOverStage(stage.id)}
              onDragLeave={(e) => {
                // Only clear if leaving the drop zone itself (not entering a child)
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragOverStage(null)
                }
              }}
              onDrop={(e) => handleDrop(e, stage.id)}
            >
              {stageCustomers.length === 0 ? (
                <p className="text-2xs text-text3 py-6 text-center">No customers</p>
              ) : (
                stageCustomers.map(c => (
                  <CustomerCard key={c.username} customer={c} preLaunch={preLaunch} />
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

interface CustomerCardProps {
  customer: Customer
  preLaunch: boolean
}

function CustomerCard({ customer: c, preLaunch }: CustomerCardProps) {
  return (
    <div
      draggable={true}
      onDragStart={(e) => e.dataTransfer.setData("username", c.username)}
      className="rounded-lg border border-border bg-surface px-2.5 py-2 flex flex-col gap-1.5 cursor-grab active:cursor-grabbing hover:border-border2 transition-colors select-none"
    >
      {/* Top row: avatar + name/email */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-porter/15 text-2xs font-bold text-accent-porter">
          {(c.display_name || c.username).charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <Link
            to={`/users/${c.username}`}
            className="text-sm font-medium text-text truncate block hover:text-accent-porter transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {c.full_name || c.display_name || c.username}
          </Link>
          <p className="text-2xs text-text3 truncate">{c.email ?? `@${c.username}`}</p>
        </div>
      </div>

      {/* Plan badge */}
      <div>{planBadge(c, preLaunch)}</div>

      {/* Bottom row: health dot + score + last active */}
      <div className="flex items-center gap-1.5">
        <div className={`size-2 rounded-full ${healthDotClass(c.health)}`} />
        <span className="text-2xs text-text2 tabular-nums">{c.health}</span>
        <span className="text-2xs text-text3 ml-auto">{formatRelative(c.last_seen_at)}</span>
      </div>
    </div>
  )
}
