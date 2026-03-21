import { AdminShell } from "~/components/layout/admin-shell"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Card, CardContent } from "~/components/ui/card"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Link } from "react-router"
import {
  TrendingUp, Shield, Users, Share2, Bot,
  Play, SkipForward, ChevronRight, Clock,
} from "lucide-react"

interface AgentData {
  id: string
  name: string
  role: string
  status: string
  queued: number
  running: number
  completed: number
}

interface TaskData {
  id: number
  agent_type: string
  action_type: string
  target_username: string | null
  status: string
  priority: number
  payload: string
  created_at: number
}

const agentIcons: Record<string, React.ElementType> = {
  growth: TrendingUp,
  retention: Clock,
  security: Shield,
  social: Share2,
}

const agentColors: Record<string, string> = {
  growth: "#22C55E",
  retention: "#F59E0B",
  security: "#EF4444",
  social: "#6366F1",
}

function fmtRel(ts: number | null) {
  if (!ts) return "—"
  const d = Date.now() / 1000 - ts
  if (d < 60) return "just now"
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}

function AgentsContent() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "agents"],
    queryFn: () => api<{ agents: AgentData[]; stats: { queued: number; running: number; completed: number }; recentTasks: TaskData[] }>("/api/admin/agents"),
  })

  const execute = useMutation({
    mutationFn: (taskId: number) => api(`/api/admin/agents/execute/${taskId}`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "agents"] }),
  })

  const skip = useMutation({
    mutationFn: (taskId: number) => api(`/api/admin/agents/skip/${taskId}`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "agents"] }),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  const agents = data?.agents ?? []
  const stats = data?.stats ?? { queued: 0, running: 0, completed: 0 }
  const tasks = data?.recentTasks ?? []
  const queuedTasks = tasks.filter(t => t.status === "queued")

  return (
    <div className="space-y-3">
      {/* Agent cards */}
      <div className="grid grid-cols-4 gap-2">
        {agents.map((a, i) => {
          const Icon = agentIcons[a.id] ?? Bot
          const color = agentColors[a.id] ?? "#6366F1"
          return (
            <Card key={a.id} className="animate-card-deal-in border-border bg-surface" style={{ animationDelay: `${i * 50}ms` }}>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex size-6 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}15` }}>
                    <Icon className="size-3" style={{ color }} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-text">{a.name}</p>
                    <div className="flex items-center gap-1.5">
                      <div className="size-1.5 rounded-full bg-success animate-pulse-badge" />
                      <span className="text-[10px] text-text3">Active</span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-text3 mb-2">{a.role}</p>
                <div className="flex gap-2 text-xs">
                  <span className="text-text3">Queued <span className="font-bold text-text">{a.queued}</span></span>
                  <span className="text-text3">Done <span className="font-bold text-text">{a.completed}</span></span>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Task queue */}
      <Card className="border-border bg-surface">
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Bot className="size-3.5 text-accent-porter" />
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text3">Task Queue</h3>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="text-[10px] bg-warning/15 text-warning border-0">{stats.queued} queued</Badge>
              <Badge className="text-[10px] bg-success/15 text-success border-0">{stats.completed} done</Badge>
            </div>
          </div>

          {queuedTasks.length === 0 ? (
            <p className="text-sm text-text3 py-4 text-center">No tasks in queue — all customers healthy</p>
          ) : (
            <div className="space-y-1.5">
              {queuedTasks.map((t) => {
                const color = agentColors[t.agent_type] ?? "#6366F1"
                const Icon = agentIcons[t.agent_type] ?? Bot
                let reason = ""
                try { reason = JSON.parse(t.payload).reason ?? "" } catch {}
                return (
                  <div key={t.id} className="flex items-center gap-2 rounded-lg bg-background px-3 py-2">
                    <Icon className="size-4 shrink-0" style={{ color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-text">{t.action_type.replace(/_/g, " ")}</span>
                        {t.target_username && (
                          <Link to={`/users/${t.target_username}`} className="text-xs text-accent-porter hover:underline">
                            @{t.target_username}
                          </Link>
                        )}
                        <Badge variant="outline" className="text-[10px] ml-auto">P{t.priority}</Badge>
                      </div>
                      {reason && <p className="text-[11px] text-text3 truncate">{reason}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="default" size="icon-xs" onClick={() => execute.mutate(t.id)}>
                        <Play className="size-3" />
                      </Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => skip.mutate(t.id)}>
                        <SkipForward className="size-3" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function AgentsPage() {
  return (
    <AdminShell>
      <AgentsContent />
    </AdminShell>
  )
}
