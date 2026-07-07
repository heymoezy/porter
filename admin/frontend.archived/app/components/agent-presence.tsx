/**
 * AgentPresence — shows which agents are assigned to a surface.
 *
 * Renders a compact bar per agent with avatar, name, status, and activity.
 * Ghost (grayscale) when planned, colored when active.
 */

import { PixelPortrait } from "~/components/pixel-portrait"
import { Badge } from "~/components/ui/badge"
import type { AgentDef, AgentStatus } from "~/lib/agent-registry"
import { getAgentsForSurface } from "~/lib/agent-registry"

const statusConfig: Record<AgentStatus, { dot: string; label: string; labelClass: string }> = {
  planned: { dot: "bg-text3/40",              label: "planned",  labelClass: "text-text3" },
  forging: { dot: "bg-warning animate-pulse-badge", label: "forging",  labelClass: "text-warning" },
  active:  { dot: "bg-success animate-pulse-badge", label: "active",   labelClass: "text-success" },
  paused:  { dot: "bg-text3/60",              label: "paused",   labelClass: "text-text3" },
  error:   { dot: "bg-danger animate-pulse-badge",  label: "error",    labelClass: "text-danger" },
}

function AgentCard({ agent, compact = false }: { agent: AgentDef; compact?: boolean }) {
  const sc = statusConfig[agent.status]
  const isGhost = agent.status === "planned"

  return (
    <div className={`rounded-lg border px-3 py-2 transition-all ${
      isGhost
        ? "border-border/40 bg-card"
        : "border-accent-porter/20 bg-accent-porter/3"
    }`}>
      <div className="flex items-center gap-2.5">
        <div className={isGhost ? "grayscale opacity-40" : ""}>
          <PixelPortrait {...agent.avatar} size="xs" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-2xs font-bold ${isGhost ? "text-text2" : "text-text"}`}>{agent.name}</p>
          {!compact && (
            <p className="text-2xs text-text3 truncate">{agent.description}</p>
          )}
        </div>
        <span className="flex items-center gap-1 text-2xs font-mono shrink-0">
          <span className={`size-1.5 rounded-full ${sc.dot}`} />
          <span className={sc.labelClass}>{sc.label}</span>
        </span>
      </div>
      {!compact && agent.status === "planned" && agent.plannedCapabilities.length > 0 && (
        <div className="mt-1.5 pl-8">
          <p className="text-2xs text-text3">
            <span className="font-bold">Awaiting forge:</span>{" "}
            {agent.plannedCapabilities[0]}
          </p>
        </div>
      )}
      {!compact && agent.activity && agent.status !== "planned" && (
        <p className="text-2xs text-text2 mt-1.5 pl-8 truncate">
          {agent.activity}
        </p>
      )}
    </div>
  )
}

/** Show all agents assigned to a surface */
export function AgentPresence({
  surface,
  compact = false,
  className = "",
}: {
  surface: string
  compact?: boolean
  className?: string
}) {
  const agents = getAgentsForSurface(surface)
  if (agents.length === 0) return null

  return (
    <div className={`space-y-1.5 ${className}`}>
      {agents.map(a => (
        <AgentCard key={a.id} agent={a} compact={compact} />
      ))}
    </div>
  )
}

/** Compact summary bar for page headers — "N agents · all planned" */
export function AgentPresenceSummary({
  surface,
  className = "",
}: {
  surface: string
  className?: string
}) {
  const agents = getAgentsForSurface(surface)
  if (agents.length === 0) return null

  const planned = agents.filter(a => a.status === "planned").length
  const active = agents.filter(a => a.status === "active").length
  const total = agents.length

  return (
    <div className={`flex items-center gap-2 rounded-lg border border-border/40 bg-surface/50 px-3 py-1.5 ${className}`}>
      <div className="flex -space-x-1.5">
        {agents.slice(0, 4).map(a => (
          <div key={a.id} className={a.status === "planned" ? "grayscale opacity-40" : ""}>
            <PixelPortrait {...a.avatar} size="xs" />
          </div>
        ))}
        {total > 4 && (
          <div className="flex size-5 items-center justify-center rounded-full bg-raised text-2xs font-bold text-text3">
            +{total - 4}
          </div>
        )}
      </div>
      <div className="text-2xs">
        <span className="font-bold text-text2">{total} agent{total !== 1 ? "s" : ""}</span>
        {planned === total ? (
          <span className="text-text3 ml-1">· all awaiting forge</span>
        ) : active > 0 ? (
          <span className="text-success ml-1">· {active} active</span>
        ) : null}
      </div>
    </div>
  )
}
