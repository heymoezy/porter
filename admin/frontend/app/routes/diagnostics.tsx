import { useState } from "react"
import { AgentPresenceSummary } from "~/components/agent-presence"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Card, CardContent } from "~/components/ui/card"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  AlertTriangle, Bug, CheckCircle, Globe,
  Server, Bot, X,
} from "lucide-react"

interface ErrorEntry {
  id: number
  source: string
  severity: string
  message: string
  stack: string | null
  url: string | null
  username: string | null
  created_at: number
}

interface DiagStats {
  total: number
  open: number
  today: number
  bySeverity: { critical: number; error: number; warning: number }
  bySource: { client_js: number; server_api: number; agent_error: number }
  topErrors: Array<{ message: string; source: string; severity: string; count: number; last_seen: number }>
}

const sourceIcon: Record<string, React.ElementType> = {
  client_js: Globe,
  server_api: Server,
  agent_error: Bot,
  server_unhandled: Bug,
}

const severityColor: Record<string, string> = {
  critical: "bg-danger/15 text-danger",
  error: "bg-warning/15 text-warning",
  warning: "bg-text3/15 text-text3",
}

function fmtRel(ts: number) {
  const d = Date.now() / 1000 - ts
  if (d < 60) return "just now"
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}

function DiagnosticsContent() {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "diagnostics"],
    queryFn: () => api<{ errors: ErrorEntry[]; stats: DiagStats }>("/api/admin/diagnostics"),
    
  })

  const resolve = useMutation({
    mutationFn: (id: number) => api(`/api/admin/diagnostics/${id}/resolve`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "diagnostics"] }),
  })

  const resolveAll = useMutation({
    mutationFn: (body: { source?: string; message?: string }) =>
      api("/api/admin/diagnostics/resolve-all", { method: "POST", json: body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "diagnostics"] }),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  const stats = data?.stats ?? { total: 0, open: 0, today: 0, bySeverity: { critical: 0, error: 0, warning: 0 }, bySource: { client_js: 0, server_api: 0, agent_error: 0 }, topErrors: [] }
  const errors = data?.errors ?? []

  return (
    <div className="space-y-3">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        <Card className="border-border bg-surface">
          <CardContent className="flex items-center gap-2 p-3">
            <div className="flex size-6 items-center justify-center rounded-lg bg-danger/15">
              <Bug className="size-3 text-danger" />
            </div>
            <div>
              <p className="text-xl font-bold text-text">{stats.open}</p>
              <p className="text-2xs text-text3">Open errors</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-surface">
          <CardContent className="flex items-center gap-2 p-3">
            <div className="flex size-6 items-center justify-center rounded-lg bg-warning/15">
              <AlertTriangle className="size-3 text-warning" />
            </div>
            <div>
              <p className="text-xl font-bold text-text">{stats.today}</p>
              <p className="text-2xs text-text3">Last 24h</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-surface">
          <CardContent className="p-3">
            <p className="text-2xs font-semibold uppercase tracking-wide text-text3 mb-2">By Severity</p>
            <div className="flex gap-2">
              {stats.bySeverity.critical > 0 && <Badge className="bg-danger/15 text-danger border-0 text-2xs">{stats.bySeverity.critical} critical</Badge>}
              {stats.bySeverity.error > 0 && <Badge className="bg-warning/15 text-warning border-0 text-2xs">{stats.bySeverity.error} error</Badge>}
              {stats.bySeverity.warning > 0 && <Badge variant="outline" className="text-2xs">{stats.bySeverity.warning} warn</Badge>}
              {stats.bySeverity.critical === 0 && stats.bySeverity.error === 0 && stats.bySeverity.warning === 0 && (
                <span className="text-xs text-success">All clear</span>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-surface">
          <CardContent className="p-3">
            <p className="text-2xs font-semibold uppercase tracking-wide text-text3 mb-2">By Source</p>
            <div className="flex gap-2">
              {stats.bySource.client_js > 0 && <Badge variant="outline" className="text-2xs">{stats.bySource.client_js} frontend</Badge>}
              {stats.bySource.server_api > 0 && <Badge variant="outline" className="text-2xs">{stats.bySource.server_api} API</Badge>}
              {stats.bySource.agent_error > 0 && <Badge variant="outline" className="text-2xs">{stats.bySource.agent_error} agent</Badge>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top recurring errors */}
      {stats.topErrors.length > 0 && (
        <Card className="border-border bg-surface">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-2xs font-semibold uppercase tracking-wide text-text3">Recurring Errors</h3>
              <Button variant="outline" size="xs" onClick={() => resolveAll.mutate({})}>Resolve All</Button>
            </div>
            <div className="space-y-1.5">
              {stats.topErrors.map((e, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-background px-3 py-2">
                  <Badge className={`text-2xs ${severityColor[e.severity] ?? "bg-text3/15 text-text3"} border-0`}>
                    {e.severity}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-text truncate">{e.message}</p>
                    <p className="text-2xs text-text3">{e.source} · {fmtRel(e.last_seen)}</p>
                  </div>
                  <Badge variant="outline" className="text-2xs shrink-0">{e.count}x</Badge>
                  <Button variant="ghost" size="icon-xs" onClick={() => resolveAll.mutate({ message: e.message })}>
                    <CheckCircle className="size-3 text-success" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error list */}
      <Card className="border-border bg-surface">
        <CardContent className="p-3">
          <h3 className="text-2xs font-semibold uppercase tracking-wide text-text3 mb-2">Error Log</h3>
          {errors.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-success">
              <CheckCircle className="size-4" /> No open errors
            </div>
          ) : (
            <div className="space-y-1">
              {errors.map((e) => {
                const Icon = sourceIcon[e.source] ?? Bug
                const isExpanded = expanded === e.id
                return (
                  <div key={e.id}>
                    <div
                      className="flex items-center gap-2 rounded-lg bg-background px-3 py-2 cursor-pointer hover:bg-raised transition-colors"
                      onClick={() => setExpanded(isExpanded ? null : e.id)}
                    >
                      <Icon className="size-3.5 text-text3 shrink-0" />
                      <Badge className={`text-2xs ${severityColor[e.severity] ?? ""} border-0 shrink-0`}>
                        {e.severity}
                      </Badge>
                      <p className="text-xs text-text flex-1 min-w-0 truncate">{e.message}</p>
                      {e.username && <span className="text-2xs text-text3 shrink-0">@{e.username}</span>}
                      <span className="text-2xs text-text3 shrink-0">{fmtRel(e.created_at)}</span>
                      <Button variant="ghost" size="icon-xs" onClick={(ev) => { ev.stopPropagation(); resolve.mutate(e.id) }}>
                        <X className="size-3" />
                      </Button>
                    </div>
                    {isExpanded && e.stack && (
                      <pre className="mx-3 mt-1 mb-2 overflow-x-auto rounded-md bg-background p-3 text-2xs text-text3 font-mono leading-relaxed">
                        {e.stack}
                      </pre>
                    )}
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

export default function DiagnosticsPage() {
  return (
      <div className="overflow-y-auto p-4 flex-1">
        <AgentPresenceSummary surface="diagnostics" className="mb-3" />
        <DiagnosticsContent />
      </div>
  )
}
