import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import { Badge } from "~/components/ui/badge"
import { ListTodo, MessageSquare, GitBranch } from "lucide-react"

interface RootTask {
  id: string
  description: string
  status: string
  subtask_count: number
  completed_count: number
}

interface SessionStats {
  active: number
  paused: number
  total: number
  totalTokens: number
  avgContext: number
}

interface DecisionStats {
  byType: Array<{ decision_type: string; cnt: number }>
  byAgent: Array<{ agent_id: string; agent_name: string; cnt: number }>
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

const DECISION_COLORS: Record<string, string> = {
  routing: "bg-blue-500/15 text-blue-400",
  delegation: "bg-purple-500/15 text-purple-400",
  model_selection: "bg-green-500/15 text-green-400",
  tool_selection: "bg-yellow-500/15 text-yellow-400",
  escalation: "bg-red-500/15 text-red-400",
}

export function ActiveWorkPanel() {
  const { data: tasksData } = useQuery({
    queryKey: ["decomposition"],
    queryFn: () => api<{ roots: RootTask[] }>("/api/v1/decomposition"),
    refetchInterval: 15_000,
  })

  const { data: sessionsData } = useQuery({
    queryKey: ["admin", "sessions", "stats"],
    queryFn: () => api<SessionStats>("/api/admin/sessions/stats"),
    refetchInterval: 15_000,
  })

  const { data: decisionsData } = useQuery({
    queryKey: ["admin", "decisions", "stats"],
    queryFn: () => api<DecisionStats>("/api/admin/decisions/stats"),
    refetchInterval: 15_000,
  })

  const roots = tasksData?.roots ?? []
  const running = roots.filter((r) => r.status === "running" || r.status === "in_progress")

  return (
    <Card className="bg-[var(--surface,#222a38)] border-[var(--border,#3d4758)]">
      <CardHeader className="pb-0 pt-3">
        <CardTitle className="text-xs font-bold uppercase tracking-wide text-[var(--foreground,#f6f8fb)]">
          Active Work
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2 pb-3 space-y-3">
        {/* Tasks */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <ListTodo className="size-3 text-[var(--accent-porter,#6366f1)]" />
            <span className="text-2xs font-semibold text-[var(--foreground,#f6f8fb)]">Tasks</span>
            <span className="text-2xs text-[var(--text3,#8a95a8)]">{running.length} running</span>
          </div>
          {roots.slice(0, 3).map((t) => (
            <div key={t.id} className="mb-1.5">
              <p className="text-2xs text-[var(--foreground,#f6f8fb)] truncate">{t.description}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex-1 h-1 rounded-full bg-[var(--raised,#2b3444)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--accent-porter,#6366f1)] transition-all duration-500"
                    style={{ width: t.subtask_count > 0 ? `${(t.completed_count / t.subtask_count) * 100}%` : "0%" }}
                  />
                </div>
                <span className="text-2xs text-[var(--text3,#8a95a8)] tabular-nums shrink-0">
                  {t.completed_count}/{t.subtask_count}
                </span>
              </div>
            </div>
          ))}
          {roots.length === 0 && <p className="text-2xs text-[var(--text3,#8a95a8)]">No active tasks</p>}
        </div>

        <div className="h-px bg-[var(--border,#3d4758)]" />

        {/* Sessions */}
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <MessageSquare className="size-3 text-green-400" />
            <span className="text-2xs font-semibold text-[var(--foreground,#f6f8fb)]">Sessions</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xs text-[var(--text3,#8a95a8)]">
              <span className="text-[var(--foreground,#f6f8fb)] font-bold">{sessionsData?.active ?? 0}</span> active
            </span>
            <span className="text-2xs text-[var(--text3,#8a95a8)]">
              <span className="text-[var(--foreground,#f6f8fb)] font-bold">{formatTokens(sessionsData?.totalTokens ?? 0)}</span> tokens
            </span>
          </div>
        </div>

        <div className="h-px bg-[var(--border,#3d4758)]" />

        {/* Decisions */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <GitBranch className="size-3 text-purple-400" />
            <span className="text-2xs font-semibold text-[var(--foreground,#f6f8fb)]">Decisions</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {(decisionsData?.byType ?? []).map((d) => (
              <Badge key={d.decision_type} className={`text-2xs px-1.5 py-0 ${DECISION_COLORS[d.decision_type] ?? "bg-[var(--raised,#2b3444)] text-[var(--text3,#8a95a8)]"}`}>
                {d.decision_type.replace(/_/g, " ")} {d.cnt}
              </Badge>
            ))}
            {(!decisionsData?.byType || decisionsData.byType.length === 0) && (
              <span className="text-2xs text-[var(--text3,#8a95a8)]">No decisions yet</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
