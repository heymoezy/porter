import React, { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card, CardContent } from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "~/components/ui/select"
import { XCircle, ChevronDown, ChevronRight, GitBranch, Zap } from "lucide-react"

// ── Types ──────────────────────────────────────────────

interface DispatchEntry {
  id: string
  gateway_id: string | null
  gateway_type: string
  model_name: string
  chosen_reason: string
  alternatives: unknown
  estimated_cost_usd: number | null
  input_tokens: number | null
  output_tokens: number | null
  cached_tokens: number | null
  latency_ms: number | null
  agent_id: string | null
  project_id: string | null
  chat_id: string | null
  rule_id: string | null
  username: string | null
  created_at: number | null
}

interface Pagination {
  page: number
  limit: number
  total: number
  pages: number
}

interface DispatchLogData {
  entries: DispatchEntry[]
  pagination: Pagination
}

interface AgentStatRow {
  model_name: string
  gateway_type: string
  dispatch_count: number
  avg_latency_ms: number | null
  total_cost_usd: number
  total_input_tokens: number
  total_output_tokens: number
}

interface AgentStatsData {
  stats: AgentStatRow[]
  summary: {
    agent_id: string
    total_dispatches: number
    total_cost_usd: number
    model_count: number
  }
}

interface SessionTurn {
  message_sequence: number
  gateway_type: string
  model_name: string
  created_at: number | null
  estimated_cost_usd: number | null
  latency_ms: number | null
  input_tokens: number | null
  output_tokens: number | null
}

interface SessionData {
  chat_id: string
  turns: SessionTurn[]
  turn_count: number
}

// ── Helpers ─────────────────────────────────────────────

function fmtMs(ms: number | null): string {
  if (ms === null) return "—"
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${ms}ms`
}

function fmtCost(usd: number | null): string {
  if (usd === null) return "—"
  if (usd < 0.01) return `$${usd.toFixed(6)}`
  return `$${usd.toFixed(4)}`
}

function fmtTime(epoch: number | null): string {
  if (epoch === null) return "—"
  const d = Date.now() / 1000 - epoch
  if (d < 60) return "just now"
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}

function fmtTokens(n: number | null): string {
  if (n === null) return "—"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function reasonBadgeClass(reason: string): string {
  if (reason === "forced") return "bg-accent-porter/15 text-accent-porter border-0"
  if (reason === "rule_match") return "bg-blue-500/15 text-blue-400 border-0"
  if (reason === "fallback") return "bg-warning/15 text-warning border-0"
  if (reason === "only_available") return "bg-muted text-text3 border-0"
  return "bg-muted text-text3 border-0"
}

// ── Skeleton ─────────────────────────────────────────────

function DispatchRowSkeleton() {
  return (
    <tr className="border-b border-border/20">
      {[32, 20, 28, 14, 14, 20, 16, 6].map((w, i) => (
        <td key={i} className="px-3 py-2">
          <div className={`h-3 w-${w} rounded bg-muted animate-pulse`} />
        </td>
      ))}
    </tr>
  )
}

// ── SessionPanel ─────────────────────────────────────────

function SessionPanel({ chatId }: { chatId: string }) {
  const sessionQuery = useQuery({
    queryKey: ["bridge", "session-routing", chatId],
    queryFn: () => api<SessionData>(`/api/admin/bridge/session/${chatId}/routing`),
    enabled: chatId !== "",
    staleTime: 30_000,
  })

  if (sessionQuery.isLoading) {
    return <span className="text-xs text-text3">Loading turns...</span>
  }

  if (sessionQuery.isError) {
    return <span className="text-xs text-danger">Failed to load session routing</span>
  }

  const turns = sessionQuery.data?.turns ?? []

  if (turns.length === 0) {
    return <span className="text-xs text-text3">No routing data recorded for this session</span>
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 mb-2">
        <Zap className="size-3 text-accent-porter" />
        <span className="text-2xs font-semibold uppercase text-text3">Session Routing</span>
        <span className="text-2xs text-text3 ml-1">chat: {chatId.slice(0, 8)}…</span>
      </div>
      {turns.map(turn => (
        <div key={turn.message_sequence} className="flex items-center gap-3 text-2xs py-0.5">
          <span className="text-text3 w-10 shrink-0">Turn {turn.message_sequence}</span>
          <span className="font-medium text-text">{turn.model_name}</span>
          <span className="text-text3">via {turn.gateway_type}</span>
          <span className="text-text3">·</span>
          <span className="text-text2">{fmtMs(turn.latency_ms)}</span>
          <span className="text-text3">·</span>
          <span className="text-text2">{fmtCost(turn.estimated_cost_usd)}</span>
          {(turn.input_tokens !== null || turn.output_tokens !== null) && (
            <>
              <span className="text-text3">·</span>
              <span className="text-text3">{fmtTokens(turn.input_tokens)} in / {fmtTokens(turn.output_tokens)} out</span>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

// ── AgentStats ─────────────────────────────────────────────

function AgentStats({ agentId }: { agentId: string }) {
  const statsQuery = useQuery({
    queryKey: ["bridge", "agent-stats", agentId],
    queryFn: () => api<AgentStatsData>(`/api/admin/bridge/agent-stats?agent_id=${agentId}`),
    enabled: agentId !== "",
    staleTime: 30_000,
  })

  if (statsQuery.isLoading) {
    return (
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full">
              <tbody>
                <tr className="border-b border-border/20">
                  {[28, 20, 14, 16, 14, 14, 14].map((w, i) => (
                    <td key={i} className="px-3 py-2">
                      <div className={`h-3 w-${w} rounded bg-muted animate-pulse`} />
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border/20">
                  {[28, 20, 14, 16, 14, 14, 14].map((w, i) => (
                    <td key={i} className="px-3 py-2">
                      <div className={`h-3 w-${w} rounded bg-muted animate-pulse`} />
                    </td>
                  ))}
                </tr>
                <tr>
                  {[28, 20, 14, 16, 14, 14, 14].map((w, i) => (
                    <td key={i} className="px-3 py-2">
                      <div className={`h-3 w-${w} rounded bg-muted animate-pulse`} />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (statsQuery.isError) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-4">
          <XCircle className="size-4 text-danger shrink-0" />
          <p className="text-xs text-text2">Failed to load agent stats</p>
        </CardContent>
      </Card>
    )
  }

  const stats = statsQuery.data?.stats ?? []
  const summary = statsQuery.data?.summary

  if (stats.length === 0) {
    return (
      <Card>
        <CardContent className="py-4">
          <p className="text-xs text-text3">No stats for this agent yet.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="pt-3 pb-3">
        {/* Summary bar */}
        {summary && (
          <div className="flex items-center gap-4 mb-3 text-2xs text-text3">
            <span>
              <span className="font-semibold text-text">{summary.total_dispatches}</span> dispatches
            </span>
            <span>
              <span className="font-semibold text-text">{fmtCost(summary.total_cost_usd)}</span> total cost
            </span>
            <span>
              <span className="font-semibold text-text">{summary.model_count}</span> models used
            </span>
          </div>
        )}

        {/* Per-model table */}
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50 bg-surface text-left">
                <th className="px-3 py-2 text-2xs font-semibold uppercase text-text3">Model</th>
                <th className="px-3 py-2 text-2xs font-semibold uppercase text-text3">Gateway</th>
                <th className="px-3 py-2 text-2xs font-semibold uppercase text-text3 text-right">Dispatches</th>
                <th className="px-3 py-2 text-2xs font-semibold uppercase text-text3 text-right">Avg Latency</th>
                <th className="px-3 py-2 text-2xs font-semibold uppercase text-text3 text-right">Total Cost</th>
                <th className="px-3 py-2 text-2xs font-semibold uppercase text-text3 text-right">Tokens In</th>
                <th className="px-3 py-2 text-2xs font-semibold uppercase text-text3 text-right">Tokens Out</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((row, idx) => (
                <tr key={idx} className="border-b border-border/20 last:border-0">
                  <td className="px-3 py-2">
                    <span className="text-xs font-medium text-text">{row.model_name}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-xs text-text2">{row.gateway_type}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="text-xs tabular-nums text-text">{row.dispatch_count}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="text-xs tabular-nums text-text2">{fmtMs(row.avg_latency_ms)}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="text-xs tabular-nums text-warning">{fmtCost(row.total_cost_usd)}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="text-xs tabular-nums text-text2">{fmtTokens(row.total_input_tokens)}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="text-xs tabular-nums text-text2">{fmtTokens(row.total_output_tokens)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

// ── DispatchLog main component ────────────────────────────

export function DispatchLog() {
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [agentFilter, setAgentFilter] = useState("")
  const [gatewayFilter, setGatewayFilter] = useState("")
  const [modelSearch, setModelSearch] = useState("")
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)
  const [showAgentStats, setShowAgentStats] = useState(false)
  const [circuitAlerts, setCircuitAlerts] = useState<Array<{ id: number; gateway_name: string; circuit_state: string }>>([])

  useEffect(() => {
    let counter = 0
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      const alertId = ++counter
      setCircuitAlerts(prev => [...prev, {
        id: alertId,
        gateway_name: detail?.gateway_name ?? detail?.gateway_id ?? "Unknown gateway",
        circuit_state: detail?.circuit_state ?? "open",
      }])
      setTimeout(() => {
        setCircuitAlerts(prev => prev.filter(a => a.id !== alertId))
      }, 8000)
    }
    window.addEventListener("bridge:circuit-trip", handler)
    return () => window.removeEventListener("bridge:circuit-trip", handler)
  }, [])

  const logQuery = useQuery({
    queryKey: ["bridge", "dispatch-log", page, limit, agentFilter, gatewayFilter, modelSearch],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (agentFilter) params.set("agent_id", agentFilter)
      if (gatewayFilter) params.set("gateway_type", gatewayFilter)
      if (modelSearch) params.set("model_name", modelSearch)
      return api<DispatchLogData>(`/api/admin/bridge/dispatch-log?${params}`)
    },
    staleTime: 10_000,
  })

  const pagination = logQuery.data?.pagination
  const entries = logQuery.data?.entries ?? []

  // Loading state
  if (logQuery.isLoading) {
    return (
      <div className="space-y-3">
        {/* Frozen filter bar skeleton */}
        <div className="flex items-center gap-2">
          <div className="h-8 w-48 rounded-lg bg-muted animate-pulse" />
          <div className="h-8 w-40 rounded-lg bg-muted animate-pulse" />
          <div className="h-8 w-44 rounded-lg bg-muted animate-pulse" />
        </div>
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50 bg-surface">
                {["Model", "Gateway", "Reason", "Cost", "Latency", "Agent", "Time", ""].map((h, i) => (
                  <th key={i} className="px-3 py-2 text-2xs font-semibold uppercase text-text3 text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <DispatchRowSkeleton />
              <DispatchRowSkeleton />
              <DispatchRowSkeleton />
              <DispatchRowSkeleton />
              <DispatchRowSkeleton />
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // Error state
  if (logQuery.isError) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-6">
          <XCircle className="size-5 text-danger shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground">Failed to load dispatch log</p>
            <p className="text-xs text-text3 mt-0.5">
              {logQuery.error instanceof Error ? logQuery.error.message : "An unexpected error occurred"}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {/* Circuit trip alert banners */}
      {circuitAlerts.map(alert => (
        <div
          key={alert.id}
          className="flex items-center gap-3 rounded-xl border border-danger/30 bg-danger/8 px-4 py-2.5 animate-fade-in"
        >
          <GitBranch className="size-4 text-danger shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-danger">Circuit trip: {alert.gateway_name}</p>
            <p className="text-2xs text-text3">Circuit moved to <span className="font-medium">{alert.circuit_state}</span> state</p>
          </div>
          <button
            onClick={() => setCircuitAlerts(prev => prev.filter(a => a.id !== alert.id))}
            className="text-text3 hover:text-text2 transition-colors text-2xs"
          >
            dismiss
          </button>
        </div>
      ))}

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          placeholder="Filter by model..."
          value={modelSearch}
          onChange={e => { setModelSearch(e.target.value); setPage(1) }}
          className="h-8 w-48"
        />
        <Select
          value={gatewayFilter || "all"}
          onValueChange={v => { setGatewayFilter(v === "all" ? "" : v); setPage(1) }}
        >
          <SelectTrigger className="h-8 w-40">
            <SelectValue placeholder="All gateways" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All gateways</SelectItem>
            <SelectItem value="ollama">ollama</SelectItem>
            <SelectItem value="openclaw">openclaw</SelectItem>
            <SelectItem value="codex_cli">codex_cli</SelectItem>
            <SelectItem value="claude_cli">claude_cli</SelectItem>
            <SelectItem value="gemini_cli">gemini_cli</SelectItem>
            <SelectItem value="openai_compat">openai_compat</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Agent ID..."
          value={agentFilter}
          onChange={e => { setAgentFilter(e.target.value); setPage(1); if (!e.target.value) setShowAgentStats(false) }}
          className="h-8 w-44"
        />
        {agentFilter && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAgentStats(s => !s)}
          >
            Agent Stats
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2 text-2xs text-text3">
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-success animate-pulse" />
            live
          </span>
          {pagination ? `· ${pagination.total} entries` : ""}
        </div>
      </div>

      {/* Agent stats panel */}
      {showAgentStats && agentFilter && (
        <div className="mb-3">
          <AgentStats agentId={agentFilter} />
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/50 bg-surface text-left">
              <th className="px-3 py-2 text-2xs font-semibold uppercase text-text3">Model</th>
              <th className="px-3 py-2 text-2xs font-semibold uppercase text-text3">Gateway</th>
              <th className="px-3 py-2 text-2xs font-semibold uppercase text-text3">Reason</th>
              <th className="px-3 py-2 text-2xs font-semibold uppercase text-text3 text-right">Cost</th>
              <th className="px-3 py-2 text-2xs font-semibold uppercase text-text3 text-right">Latency</th>
              <th className="px-3 py-2 text-2xs font-semibold uppercase text-text3">Agent</th>
              <th className="px-3 py-2 text-2xs font-semibold uppercase text-text3 text-right">Time</th>
              <th className="px-3 py-2 w-6" />
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                    <div className="flex items-center justify-center size-10 rounded-xl bg-muted">
                      <GitBranch className="size-5 text-text3" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">No dispatch entries</p>
                      <p className="text-xs text-text3 mt-1">
                        Dispatches will appear here once Porter routes AI requests.
                      </p>
                    </div>
                  </div>
                </td>
              </tr>
            )}
            {entries.map(entry => (
              <React.Fragment key={entry.id}>
                <tr className="border-b border-border/20 last:border-0 hover:bg-surface/50 transition-colors">
                  {/* Model */}
                  <td className="px-3 py-2">
                    <span className="text-xs font-medium text-text">{entry.model_name}</span>
                  </td>

                  {/* Gateway */}
                  <td className="px-3 py-2">
                    <span className="text-xs text-text2">{entry.gateway_type}</span>
                  </td>

                  {/* Reason badge */}
                  <td className="px-3 py-2">
                    <Badge className={`text-2xs ${reasonBadgeClass(entry.chosen_reason)}`}>
                      {entry.chosen_reason}
                    </Badge>
                  </td>

                  {/* Cost */}
                  <td className="px-3 py-2 text-right">
                    <span className="text-xs tabular-nums text-warning">
                      {fmtCost(entry.estimated_cost_usd)}
                    </span>
                  </td>

                  {/* Latency */}
                  <td className="px-3 py-2 text-right">
                    <span className="text-xs tabular-nums text-text2">
                      {fmtMs(entry.latency_ms)}
                    </span>
                  </td>

                  {/* Agent */}
                  <td className="px-3 py-2">
                    {entry.agent_id ? (
                      <span
                        className="text-2xs text-text3 font-mono"
                        title={entry.agent_id}
                      >
                        {entry.agent_id.slice(0, 12)}
                      </span>
                    ) : (
                      <span className="text-2xs text-text3">—</span>
                    )}
                  </td>

                  {/* Time */}
                  <td className="px-3 py-2 text-right">
                    <span className="text-2xs text-text3">{fmtTime(entry.created_at)}</span>
                  </td>

                  {/* Expand toggle — only for entries with a chat_id */}
                  <td
                    className="px-3 py-2 cursor-pointer"
                    onClick={() => {
                      if (!entry.chat_id) return
                      setExpandedRowId(prev => (prev === entry.id ? null : entry.id))
                    }}
                  >
                    {entry.chat_id ? (
                      expandedRowId === entry.id
                        ? <ChevronDown className="size-3.5 text-text3" />
                        : <ChevronRight className="size-3.5 text-text3" />
                    ) : null}
                  </td>
                </tr>

                {/* Session expansion row */}
                {expandedRowId === entry.id && entry.chat_id && (
                  <tr>
                    <td colSpan={8} className="bg-raised/50 px-4 py-3">
                      <SessionPanel chatId={entry.chat_id} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      {pagination && pagination.pages > 0 && (
        <div className="flex items-center justify-between px-1 pt-2">
          <div className="flex items-center gap-2">
            <span className="text-2xs text-text3">Rows:</span>
            <Select
              value={String(limit)}
              onValueChange={v => { setLimit(Number(v)); setPage(1) }}
            >
              <SelectTrigger className="h-7 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-2xs text-text3">
              Page {pagination.page} of {pagination.pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
              disabled={page >= pagination.pages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
