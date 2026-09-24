import { useState } from "react"
import { Link } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Activity, Pause, Database, MessageSquare, BookOpen } from "lucide-react"
import { StatusBadge } from "~/components/ui/status-badge"
import { MiniMetric } from "~/components/ui/mini-metric"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "~/components/ui/table"

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

function TokenBar({ used, budget }: { used: number; budget: number }) {
  if (!budget) {
    return <span className="text-text3 text-xs font-mono">{used.toLocaleString()}</span>
  }
  const pct = Math.min(100, (used / budget) * 100)
  const color = pct > 90 ? "bg-danger" : pct > 70 ? "bg-warning" : "bg-accent-porter"

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

  // Intellect episodes — used to badge sessions that have been analyzed.
  // Single fetch (limit 200), build a Set of session_ids on the client.
  const { data: episodesData } = useQuery({
    queryKey: ["intellect", "episodes-for-sessions"],
    queryFn: () =>
      api<{ data: { episodes: Array<{ session_id: string }> } }>(
        "/api/v1/intellect/episodes?limit=200",
      ).then(r => r.data),
    refetchInterval: 60_000,
  })
  const episodeSessionIds = new Set(
    (episodesData?.episodes ?? []).map(e => e.session_id),
  )

  // Intellect coverage stat — sessions seen by Intellect
  const sessionsWithEpisodes = sessions.filter(s => {
    const sid = s.chat_id || s.id
    return episodeSessionIds.has(sid)
  }).length
  const coveragePct = sessions.length > 0
    ? Math.round((sessionsWithEpisodes / sessions.length) * 100)
    : 0

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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MiniMetric variant="card" icon={Activity} label="Active Sessions" value={stats.active} />
        <MiniMetric variant="card" icon={Database} label="Total Tokens" value={formatTokens(stats.totalTokens)} />
        <MiniMetric variant="card" icon={MessageSquare} label="Avg Context" value={`${stats.avgContext} msgs`} />
        <MiniMetric variant="card" icon={Pause} label="Paused" value={stats.paused} />
        <Link to="/intelligence" className="block">
          <MiniMetric
            variant="card"
            icon={BookOpen}
            label="Intellect coverage"
            value={`${coveragePct}% (${sessionsWithEpisodes}/${sessions.length})`}
          />
        </Link>
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
        <Table size="sm">
          <TableHeader>
            <TableRow>
              <TableHead className="pr-4">ID</TableHead>
              <TableHead className="pr-4">Agent</TableHead>
              <TableHead className="pr-4">Gateway</TableHead>
              <TableHead className="pr-4">Status</TableHead>
              <TableHead className="pr-4">Episode</TableHead>
              <TableHead className="pr-4">Tokens</TableHead>
              <TableHead className="text-right pr-4">Context</TableHead>
              <TableHead className="pr-4">Model</TableHead>
              <TableHead className="text-right pr-4">Created</TableHead>
              <TableHead className="text-right">Last Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map(s => {
              const sid = s.chat_id || s.id
              const hasEpisode = episodeSessionIds.has(sid)
              return (
              <TableRow key={s.id}>
                <TableCell className="pr-4 text-text3 font-mono text-xs">{s.id.slice(0, 8)}</TableCell>
                <TableCell className="pr-4 text-text">
                  {s.agent_id ? (
                    <Link to={`/agents/${s.agent_id}`} className="text-accent-porter hover:underline">
                      {s.agent_name ?? s.agent_id.slice(0, 8)}
                    </Link>
                  ) : (
                    s.username || "--"
                  )}
                </TableCell>
                <TableCell className="pr-4 text-text2">
                  {s.gateway_type ? (
                    <Link to="/bridge" className="text-accent-porter hover:underline">
                      {s.gateway_type}
                    </Link>
                  ) : "--"}
                </TableCell>
                <TableCell className="pr-4"><StatusBadge status={s.status} /></TableCell>
                <TableCell className="pr-4">
                  {hasEpisode ? (
                    <Link to="/intelligence" className="inline-flex items-center gap-1 text-xs text-accent-porter hover:underline" title="Intellect has analyzed this session">
                      <BookOpen className="size-3" /> yes
                    </Link>
                  ) : (
                    <span className="text-text3 text-xs">—</span>
                  )}
                </TableCell>
                <TableCell className="pr-4"><TokenBar used={s.tokens_used} budget={s.token_budget} /></TableCell>
                <TableCell className="pr-4 text-right text-text2">{s.context_msgs}</TableCell>
                <TableCell className="pr-4 text-text3 text-xs">{s.model_name ?? "--"}</TableCell>
                <TableCell className="pr-4 text-right text-text3 text-xs whitespace-nowrap">{formatDate(s.created_at)}</TableCell>
                <TableCell className="text-right text-text3 text-xs whitespace-nowrap">{formatDate(s.last_active_at)}</TableCell>
              </TableRow>
              )
            })}
          </TableBody>
        </Table>

        {!isLoading && sessions.length === 0 && (
          <div className="text-center py-12 text-text3">No sessions found</div>
        )}
      </div>
    </div>
  )
}
