import { AppShell } from "~/components/layout/app-shell"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import { Badge } from "~/components/ui/badge"
import { Separator } from "~/components/ui/separator"
import { useHealth, useDecisions } from "~/hooks/use-api"
import { Loader2, Server, Database, Clock, ArrowRight } from "lucide-react"
import type { HealthBackend, Decision } from "~/lib/types"

const STATUS_DOT: Record<string, string> = {
  up: "bg-success",
  down: "bg-danger",
  unknown: "bg-text3",
}

function ServiceCard({ name, status, latencyMs, icon }: {
  name: string
  status: string
  latencyMs: number | null
  icon: React.ReactNode
}) {
  const dot = STATUS_DOT[status] ?? STATUS_DOT.unknown

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
      <div className="text-text3">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-foreground">{name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`size-2 rounded-full ${dot}`} />
          <span className="text-[10px] text-text3 capitalize">{status}</span>
        </div>
      </div>
      {latencyMs != null && (
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-foreground tabular-nums">{latencyMs}ms</p>
          <div className="h-1 w-16 rounded-full bg-raised overflow-hidden mt-1">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                latencyMs < 100 ? "bg-success" : latencyMs < 500 ? "bg-warning" : "bg-danger"
              }`}
              style={{ width: `${Math.min(100, (latencyMs / 1000) * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

const DECISION_TYPE_STYLE: Record<string, string> = {
  routing: "bg-accent-porter/15 text-accent-porter",
  delegation: "bg-warning/15 text-warning",
  escalation: "bg-danger/15 text-danger",
  fallback: "bg-teal-500/15 text-teal-400",
}

function DecisionItem({ decision }: { decision: Decision }) {
  const typeStyle = DECISION_TYPE_STYLE[decision.decision_type] ?? "bg-text3/15 text-text3"

  return (
    <div className="flex gap-3 px-1 py-2 group">
      <div className="flex flex-col items-center shrink-0">
        <span className="text-[9px] text-text3 tabular-nums">{formatTime(decision.created_at)}</span>
        <div className="w-px flex-1 bg-border mt-1" />
      </div>
      <div className="flex-1 min-w-0 pb-2">
        <div className="flex items-center gap-2 mb-1">
          <Badge className={`text-[8px] px-1.5 py-0 ${typeStyle}`}>
            {decision.decision_type}
          </Badge>
          {decision.chosen && (
            <span className="text-[10px] text-text2 flex items-center gap-1">
              <ArrowRight className="size-2.5" />
              {decision.chosen}
            </span>
          )}
        </div>
        {decision.reasoning && (
          <p className="text-[11px] text-text3 leading-relaxed">{decision.reasoning}</p>
        )}
      </div>
    </div>
  )
}

export default function HealthPage() {
  const { data: health, isLoading: healthLoading, error: healthError } = useHealth()
  const { data: decisionsData, isLoading: decisionsLoading } = useDecisions(20)

  const decisions: Decision[] = decisionsData?.decisions ?? (Array.isArray(decisionsData) ? decisionsData : [])

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6 max-w-[900px] space-y-6">

          {healthLoading && (
            <div className="flex items-center gap-2 py-12 justify-center text-text3">
              <Loader2 className="size-4 animate-spin" />
              <span className="text-xs">Checking services...</span>
            </div>
          )}

          {healthError && (
            <div className="py-12 text-center">
              <p className="text-xs text-danger">Failed to load health data</p>
            </div>
          )}

          {health && (
            <>
              <div className="animated-list space-y-2">
                {health.backends.map((b: HealthBackend) => (
                  <ServiceCard
                    key={b.name}
                    name={`${b.name} — ${b.model}`}
                    status={b.status}
                    latencyMs={b.latencyMs}
                    icon={<Server className="size-4" />}
                  />
                ))}
                <ServiceCard
                  name="Database"
                  status={health.database.status}
                  latencyMs={health.database.latencyMs}
                  icon={<Database className="size-4" />}
                />
              </div>

              {health.checkedAt && (
                <p className="text-[10px] text-text3 flex items-center gap-1">
                  <Clock className="size-3" />
                  Last checked: {formatDate(health.checkedAt)} {formatTime(health.checkedAt)}
                </p>
              )}
            </>
          )}

          <Separator className="bg-border" />

          <div className="space-y-3">
            <h2 className="text-xs font-bold text-foreground uppercase tracking-wide">Recent Decisions</h2>

            {decisionsLoading && (
              <div className="flex items-center gap-2 py-6 justify-center text-text3">
                <Loader2 className="size-4 animate-spin" />
                <span className="text-xs">Loading decisions...</span>
              </div>
            )}

            {decisions.length === 0 && !decisionsLoading && (
              <p className="text-xs text-text3 py-6 text-center">No decisions recorded</p>
            )}

            {decisions.length > 0 && (
              <div className="animated-list">
                {decisions.map((d) => (
                  <DecisionItem key={d.id} decision={d} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
