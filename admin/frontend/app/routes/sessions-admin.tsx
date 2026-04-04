import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Activity, Pause, Database, MessageSquare } from "lucide-react"

// ── Types ──────────────────────────────────────────────

interface Session {
  id: string
  chat_id: string | null
  agent_id: string | null
  agent_name: string | null
  username: string | null
  gateway_type: string | null
  model_name: string | null
  token_budget: number
  tokens_used: number
  context_msgs: number
  status: string
  metadata: Record<string, unknown>
  created_at: number
  last_active_at: number | null
  closed_at: number | null
  compression_events: number
  tokens_reclaimed: number
}

interface SessionStats {
  active: number
  paused: number
  total: number
  totalTokens: number
  avgContext: number
  byStatus: { status: string; cnt: number }[]
}

// ── Helpers ────────────────────────────────────────────

function formatDate(ts: number | null) {
  if (!ts) return "--"
  return new Date(ts * 1000).toLocaleString()
}

const statusColors: Record<string, string> = {
  active: "bg-green-500/10 text-green-400",
  paused: "bg-yellow-500/10 text-yellow-400",
  completed: "bg-blue-500/10 text-blue-400",
  expired: "bg-red-500/10 text-red-400",
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[status] ?? "bg-text3/10 text-text3"}`}>
      {status}
    </span>
  )
}

function TokenBar({ used, budget }: { used: number; budget: number }) {
  if (!budget) {
    return <span className="text-text3 text-xs font-mono">{used.toLocaleString()}</span>
  }
  const pct = Math.min(100, (used / budget) * 100)
  const color = pct > 90 ? "bg-red-500" : pct > 70 ? "bg-yellow-500" : "bg-accent-porter"

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-raised">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-text3 font-mono">{used.toLocaleString()}/{budget.toLocaleString()}</span>
    </div>
  )
}

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

// ── Stat Card ──────────────────────────────────────────

function StatCard({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="size-3.5 text-text3" />
        <span className="text-xs text-text3">{label}</span>
      </div>
      <div className="text-2xl font-semibold text-text">{value}</div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────

export default function SessionsAdminPage() {
  const [statusFilter, setStatusFilter] = useState("")
  const [agentFilter, setAgentFilter] = useState("")

  // Stats
  const { data: statsData } = useQuery({
    queryKey: ["sessions-stats"],
    queryFn: () => api<{ data: SessionStats }>("/api/admin/sessions/stats").then(r => r.data),
  })

  // Sessions list
  const { data, isLoading } = useQuery({
    queryKey: ["sessions-list", statusFilter, agentFilter],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "50" })
      if (statusFilter) params.set("status", statusFilter)
      if (agentFilter) params.set("agent", agentFilter)
      return api<{ data: { sessions: Session[] } }>(`/api/admin/sessions?${params}`).then(r => r.data)
    },
  })

  const stats = statsData ?? { active: 0, paused: 0, total: 0, totalTokens: 0, avgContext: 0, byStatus: [] }
  const sessions = data?.sessions ?? []

  // Extract unique agents for filter
  const uniqueAgents = [...new Map(
    sessions
      .filter(s => s.agent_id)
      .map(s => [s.agent_id, s.agent_name ?? s.agent_id?.slice(0, 8)])
  ).entries()]

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <h1 className="text-xl font-semibold text-text">Sessions</h1>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Activity} label="Active Sessions" value={stats.active} />
        <StatCard icon={Database} label="Total Tokens" value={formatTokens(stats.totalTokens)} />
        <StatCard icon={MessageSquare} label="Avg Context" value={`${stats.avgContext} msgs`} />
        <StatCard icon={Pause} label="Paused" value={stats.paused} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text"
        >
          <option value="">All statuses</option>
          {stats.byStatus.map(s => (
            <option key={s.status} value={s.status}>{s.status} ({s.cnt})</option>
          ))}
        </select>

        <select
          value={agentFilter}
          onChange={e => setAgentFilter(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text"
        >
          <option value="">All agents</option>
          {uniqueAgents.map(([id, name]) => (
            <option key={id} value={id!}>{name}</option>
          ))}
        </select>

        <span className="text-xs text-text3">{stats.total} total sessions</span>
      </div>

      {/* Table */}
      {isLoading && <div className="text-text3">Loading...</div>}

      <div className="rounded-lg border border-border bg-surface p-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-text3 text-xs">
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-4">ID</th>
              <th className="text-left py-2 pr-4">Agent</th>
              <th className="text-left py-2 pr-4">Gateway</th>
              <th className="text-left py-2 pr-4">Status</th>
              <th className="text-left py-2 pr-4">Tokens</th>
              <th className="text-right py-2 pr-4">Context</th>
              <th className="text-left py-2 pr-4">Model</th>
              <th className="text-right py-2 pr-4">Created</th>
              <th className="text-right py-2">Last Active</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map(s => (
              <tr key={s.id} className="border-b border-border/50 hover:bg-raised/50">
                <td className="py-2 pr-4 text-text3 font-mono text-xs">{s.id.slice(0, 8)}</td>
                <td className="py-2 pr-4 text-text">{s.agent_name ?? (s.agent_id?.slice(0, 8) || s.username || "--")}</td>
                <td className="py-2 pr-4 text-text2">{s.gateway_type ?? "--"}</td>
                <td className="py-2 pr-4"><StatusBadge status={s.status} /></td>
                <td className="py-2 pr-4"><TokenBar used={s.tokens_used} budget={s.token_budget} /></td>
                <td className="py-2 pr-4 text-right text-text2">{s.context_msgs}</td>
                <td className="py-2 pr-4 text-text3 text-xs">{s.model_name ?? "--"}</td>
                <td className="py-2 pr-4 text-right text-text3 text-xs whitespace-nowrap">{formatDate(s.created_at)}</td>
                <td className="py-2 text-right text-text3 text-xs whitespace-nowrap">{formatDate(s.last_active_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {!isLoading && sessions.length === 0 && (
          <div className="text-center py-12 text-text3">No sessions found</div>
        )}
      </div>
    </div>
  )
}
