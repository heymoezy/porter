import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { ChevronDown, ChevronRight, Search } from "lucide-react"

// ── Types ──────────────────────────────────────────────

interface Decision {
  id: number
  decision_type: string
  chosen: string
  reasoning: string
  alternatives: unknown[]
  project_id: string | null
  agent_id: string | null
  agent_name: string | null
  job_id: string | null
  created_at: number
}

interface TypeStat {
  decision_type: string
  cnt: number
}

interface AgentStat {
  agent_id: string
  agent_name: string | null
  cnt: number
}

// ── Helpers ────────────────────────────────────────────

function formatDate(ts: number | null) {
  if (!ts) return "--"
  return new Date(ts * 1000).toLocaleString()
}

const typeColors: Record<string, string> = {
  routing: "bg-blue-500/10 text-blue-400",
  delegation: "bg-purple-500/10 text-purple-400",
  model_selection: "bg-green-500/10 text-green-400",
  tool_selection: "bg-yellow-500/10 text-yellow-400",
  escalation: "bg-red-500/10 text-red-400",
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${typeColors[type] ?? "bg-text3/10 text-text3"}`}>
      {type.replace(/_/g, " ")}
    </span>
  )
}

// ── Page ───────────────────────────────────────────────

export default function DecisionsPage() {
  const [typeFilter, setTypeFilter] = useState("")
  const [agentFilter, setAgentFilter] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedId, setExpandedId] = useState<number | null>(null)

  // Stats
  const { data: statsData } = useQuery({
    queryKey: ["decisions-stats"],
    queryFn: () => api<{ data: { byType: TypeStat[]; byAgent: AgentStat[] } }>("/api/admin/decisions/stats").then(r => r.data),
  })

  // Decisions list
  const { data, isLoading } = useQuery({
    queryKey: ["decisions", typeFilter, agentFilter],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "50" })
      if (typeFilter) params.set("type", typeFilter)
      if (agentFilter) params.set("agent", agentFilter)
      return api<{ data: { decisions: Decision[]; total: number } }>(`/api/admin/decisions?${params}`).then(r => r.data)
    },
  })

  const byType = statsData?.byType ?? []
  const byAgent = statsData?.byAgent ?? []
  const decisions = data?.decisions ?? []

  // Client-side search filter
  const filtered = searchQuery
    ? decisions.filter(d =>
        d.chosen.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.reasoning.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.decision_type.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : decisions

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <h1 className="text-xl font-semibold text-text">Decision Log</h1>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {byType.map(t => (
          <button
            key={t.decision_type}
            onClick={() => setTypeFilter(typeFilter === t.decision_type ? "" : t.decision_type)}
            className={`rounded-lg border p-3 text-left transition-colors ${
              typeFilter === t.decision_type
                ? "border-accent-porter bg-accent-porter/5"
                : "border-border bg-surface hover:bg-raised/50"
            }`}
          >
            <div className="text-2xl font-semibold text-text">{t.cnt}</div>
            <div className="text-xs text-text3 capitalize">{t.decision_type.replace(/_/g, " ")}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-text3" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search decisions..."
            className="w-full rounded-md border border-border bg-surface pl-9 pr-3 py-1.5 text-sm text-text placeholder:text-text3"
          />
        </div>

        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text"
        >
          <option value="">All types</option>
          {byType.map(t => (
            <option key={t.decision_type} value={t.decision_type}>
              {t.decision_type.replace(/_/g, " ")} ({t.cnt})
            </option>
          ))}
        </select>

        <select
          value={agentFilter}
          onChange={e => setAgentFilter(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text"
        >
          <option value="">All agents</option>
          {byAgent.map(a => (
            <option key={a.agent_id} value={a.agent_id}>
              {a.agent_name ?? a.agent_id.slice(0, 8)} ({a.cnt})
            </option>
          ))}
        </select>

        <span className="text-xs text-text3">{data?.total ?? 0} total</span>
      </div>

      {/* Table */}
      {isLoading && <div className="text-text3">Loading...</div>}

      <div className="rounded-lg border border-border bg-surface p-4">
        <table className="w-full text-sm">
          <thead className="text-text3 text-xs">
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-2 w-6"></th>
              <th className="text-left py-2 pr-4">Date</th>
              <th className="text-left py-2 pr-4">Agent</th>
              <th className="text-left py-2 pr-4">Type</th>
              <th className="text-left py-2 pr-4">Chosen</th>
              <th className="text-left py-2 pr-4">Reasoning</th>
              <th className="text-right py-2">Alts</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(d => {
              const isExpanded = expandedId === d.id
              const alts = Array.isArray(d.alternatives) ? d.alternatives : []

              return (
                <>
                  <tr
                    key={d.id}
                    className="border-b border-border/50 hover:bg-raised/50 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : d.id)}
                  >
                    <td className="py-2 pr-2 text-text3">
                      {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                    </td>
                    <td className="py-2 pr-4 text-text3 text-xs whitespace-nowrap">{formatDate(d.created_at)}</td>
                    <td className="py-2 pr-4 text-text">{d.agent_name ?? (d.agent_id?.slice(0, 8) || "system")}</td>
                    <td className="py-2 pr-4"><TypeBadge type={d.decision_type} /></td>
                    <td className="py-2 pr-4 text-text max-w-[200px] truncate">{d.chosen}</td>
                    <td className="py-2 pr-4 text-text2 max-w-[300px] truncate">{d.reasoning}</td>
                    <td className="py-2 text-right text-text3">{alts.length}</td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${d.id}-detail`}>
                      <td colSpan={7} className="p-0">
                        <div className="p-4 bg-raised/30 border-b border-border space-y-3">
                          <div>
                            <div className="text-xs font-semibold text-text3 mb-1">Full Reasoning</div>
                            <p className="text-sm text-text2 whitespace-pre-wrap">{d.reasoning}</p>
                          </div>
                          {alts.length > 0 && (
                            <div>
                              <div className="text-xs font-semibold text-text3 mb-1">Alternatives ({alts.length})</div>
                              <pre className="text-xs text-text3 bg-surface rounded p-2 overflow-x-auto">{JSON.stringify(alts, null, 2)}</pre>
                            </div>
                          )}
                          {d.project_id && (
                            <div className="text-xs text-text3">Project: {d.project_id}</div>
                          )}
                          {d.job_id && (
                            <div className="text-xs text-text3">Job: {d.job_id}</div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-12 text-text3">No decisions found</div>
        )}
      </div>
    </div>
  )
}
