import { AdminShell } from "~/components/layout/admin-shell"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Link } from "react-router"
import {
  TrendingUp, Shield, Share2, Bot,
  Play, SkipForward, Clock,
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
  growth: "text-success bg-success/15",
  retention: "text-warning bg-warning/15",
  security: "text-danger bg-danger/15",
  social: "text-accent-porter bg-accent-porter/15",
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
      {/* Agent table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-surface border-b border-border">
          <Bot className="size-3 text-accent-porter" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">Admin Agents ({agents.length})</span>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/50 text-left">
              <th className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text3">Agent</th>
              <th className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text3">Role</th>
              <th className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text3 text-right">Queued</th>
              <th className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text3 text-right">Done</th>
              <th className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text3 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {agents.map(a => {
              const Icon = agentIcons[a.id] ?? Bot
              const colors = agentColors[a.id] ?? "text-accent-porter bg-accent-porter/15"
              const [textColor, bgColor] = colors.split(" ")
              return (
                <tr key={a.id} className="border-b border-border/30 last:border-0">
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <div className={`flex size-5 items-center justify-center rounded ${bgColor}`}>
                        <Icon className={`size-3 ${textColor}`} />
                      </div>
                      <span className="text-xs font-bold text-text">{a.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-xs text-text3 max-w-[250px] truncate">{a.role}</td>
                  <td className="px-3 py-1.5 text-xs font-medium text-text text-right">{a.queued}</td>
                  <td className="px-3 py-1.5 text-xs font-medium text-text text-right">{a.completed}</td>
                  <td className="px-3 py-1.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <div className="size-1.5 rounded-full bg-success animate-pulse-badge" />
                      <span className="text-[10px] text-text3">Active</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Task queue */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-surface border-b border-border">
          <div className="flex items-center gap-2">
            <Bot className="size-3 text-accent-porter" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">Task Queue</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="text-[10px] bg-warning/15 text-warning border-0">{stats.queued} queued</Badge>
            <Badge className="text-[10px] bg-success/15 text-success border-0">{stats.completed} done</Badge>
          </div>
        </div>

        {queuedTasks.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-text3">No tasks in queue</div>
        ) : (
          <table className="w-full">
            <tbody>
              {queuedTasks.map(t => {
                const Icon = agentIcons[t.agent_type] ?? Bot
                const colors = agentColors[t.agent_type] ?? "text-accent-porter bg-accent-porter/15"
                const [textColor] = colors.split(" ")
                let reason = ""
                try { reason = JSON.parse(t.payload).reason ?? "" } catch {}
                return (
                  <tr key={t.id} className="border-b border-border/20 last:border-0">
                    <td className="px-3 py-1.5 w-5">
                      <Icon className={`size-3 ${textColor}`} />
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="text-xs font-medium text-text">{t.action_type.replace(/_/g, " ")}</span>
                      {reason && <p className="text-[10px] text-text3 truncate max-w-[300px]">{reason}</p>}
                    </td>
                    <td className="px-3 py-1.5">
                      {t.target_username && (
                        <Link to={`/users/${t.target_username}`} className="text-xs text-accent-porter hover:underline">
                          @{t.target_username}
                        </Link>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <Badge variant="outline" className="text-[10px]">P{t.priority}</Badge>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="default" size="sm" className="h-5 px-1.5 text-[10px]" onClick={() => execute.mutate(t.id)}>
                          <Play className="size-2.5 mr-0.5" /> Run
                        </Button>
                        <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]" onClick={() => skip.mutate(t.id)}>
                          <SkipForward className="size-2.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
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
