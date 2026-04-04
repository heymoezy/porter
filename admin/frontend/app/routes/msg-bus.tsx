import { useState } from "react"
import { Link } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Radio, ChevronDown, ChevronRight } from "lucide-react"

// ── Types ──────────────────────────────────────────────

interface MsgBusEvent {
  id: string
  correlation_id: string | null
  source_agent: string | null
  source_gateway: string | null
  target_agent: string | null
  target_gateway: string | null
  intent: string | null
  payload: unknown
  response_payload: unknown
  hop_count: number | null
  latency_ms: number | null
  status: string | null
  created_at: number | null
  delivered_at: number | null
}

interface MsgBusStats {
  total: number
  avgLatencyMs: number | null
  byIntent: Array<{ intent: string; count: number }>
  byStatus: Array<{ status: string; count: number }>
}

// ── Helpers ────────────────────────────────────────────

function fmtDate(epoch: number | null) {
  if (!epoch) return "--"
  return new Date(epoch * 1000).toLocaleString()
}

const STATUS_BADGE: Record<string, string> = {
  sent:      "bg-blue-500/15 text-blue-400 border-blue-500/20",
  delivered: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  failed:    "bg-red-500/15 text-red-400 border-red-500/20",
  timeout:   "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  pending:   "bg-text3/15 text-text3 border-text3/20",
}

// ── Component ──────────────────────────────────────────

export default function MsgBusPage() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [filterIntent, setFilterIntent] = useState("")
  const [filterStatus, setFilterStatus] = useState("")

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ["admin", "msg-bus", "stats"],
    queryFn: () => api<MsgBusStats>("/api/admin/msg-bus/stats"),
  })

  const params = new URLSearchParams()
  if (filterIntent) params.set("intent", filterIntent)
  if (filterStatus) params.set("status", filterStatus)

  const { data: eventData, isLoading: loadingEvents } = useQuery({
    queryKey: ["admin", "msg-bus", "events", filterIntent, filterStatus],
    queryFn: () => api<{ events: MsgBusEvent[]; count: number }>(`/api/admin/msg-bus?${params}`),
  })

  const events = eventData?.events ?? []

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Radio className="size-5 text-accent-porter" />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">Message Bus</h1>
          <p className="text-sm text-text3 mt-0.5">Inter-agent communication events</p>
        </div>
      </div>

      {/* Stats Row */}
      {!loadingStats && stats && (
        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="rounded-xl border border-border bg-surface p-2.5">
            <span className="text-2xs text-text3 uppercase">Total Messages</span>
            <p className="text-sm font-bold text-text mt-0.5">{stats.total.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-2.5">
            <span className="text-2xs text-text3 uppercase">Avg Latency</span>
            <p className="text-sm font-bold text-text mt-0.5">
              {stats.avgLatencyMs != null ? `${stats.avgLatencyMs}ms` : "--"}
            </p>
          </div>
          {stats.byStatus.slice(0, 2).map(s => (
            <div key={s.status} className="rounded-xl border border-border bg-surface p-2.5">
              <span className="text-2xs text-text3 uppercase">{s.status}</span>
              <p className="text-sm font-bold text-text mt-0.5">{s.count.toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Filter by intent..."
          value={filterIntent}
          onChange={e => setFilterIntent(e.target.value)}
          className="h-8 rounded-md border border-border bg-surface px-3 text-xs text-text placeholder:text-text3 focus:outline-none focus:ring-1 focus:ring-accent-porter"
        />
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="h-8 rounded-md border border-border bg-surface px-3 text-xs text-text focus:outline-none focus:ring-1 focus:ring-accent-porter"
        >
          <option value="">All statuses</option>
          <option value="sent">Sent</option>
          <option value="delivered">Delivered</option>
          <option value="failed">Failed</option>
          <option value="timeout">Timeout</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {/* Loading */}
      {loadingEvents && (
        <div className="flex items-center justify-center py-20">
          <div className="size-5 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
        </div>
      )}

      {/* Empty */}
      {!loadingEvents && events.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <Radio className="size-8 text-text3/30 mb-2" />
          <p className="text-sm text-text3">No message bus events</p>
        </div>
      )}

      {/* Table */}
      {!loadingEvents && events.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface/50">
                  <th className="w-6 px-2 py-2.5" />
                  <th className="text-left font-medium text-text3 px-4 py-2.5">Time</th>
                  <th className="text-left font-medium text-text3 px-4 py-2.5">Route</th>
                  <th className="text-left font-medium text-text3 px-4 py-2.5">Intent</th>
                  <th className="text-left font-medium text-text3 px-4 py-2.5">Status</th>
                  <th className="text-right font-medium text-text3 px-4 py-2.5">Hops</th>
                  <th className="text-right font-medium text-text3 px-4 py-2.5">Latency</th>
                  <th className="text-left font-medium text-text3 px-4 py-2.5">Correlation</th>
                </tr>
              </thead>
              <tbody>
                {events.map(ev => {
                  const isExpanded = expanded.has(ev.id)
                  return (
                    <>
                      <tr
                        key={ev.id}
                        className="border-b border-border/50 hover:bg-surface/30 transition-colors cursor-pointer"
                        onClick={() => toggleExpand(ev.id)}
                      >
                        <td className="px-2 py-2.5 text-text3">
                          {isExpanded
                            ? <ChevronDown className="size-3.5" />
                            : <ChevronRight className="size-3.5" />
                          }
                        </td>
                        <td className="px-4 py-2.5 text-text3 tabular-nums text-xs whitespace-nowrap">
                          {fmtDate(ev.created_at)}
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          {ev.source_agent ? (
                            <Link to={`/agents/${ev.source_agent}`} className="text-accent-porter hover:underline font-medium">
                              {ev.source_agent}
                            </Link>
                          ) : (
                            <span className="text-foreground font-medium">?</span>
                          )}
                          {ev.source_gateway && (
                            <Badge variant="outline" className="ml-1 text-2xs bg-text3/10 text-text3 border-text3/20">
                              {ev.source_gateway}
                            </Badge>
                          )}
                          <span className="mx-1.5 text-text3">&rarr;</span>
                          {ev.target_agent ? (
                            <Link to={`/agents/${ev.target_agent}`} className="text-accent-porter hover:underline font-medium">
                              {ev.target_agent}
                            </Link>
                          ) : (
                            <span className="text-foreground font-medium">?</span>
                          )}
                          {ev.target_gateway && (
                            <Badge variant="outline" className="ml-1 text-2xs bg-text3/10 text-text3 border-text3/20">
                              {ev.target_gateway}
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-text2 text-xs">{ev.intent ?? "--"}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant="outline" className={`text-2xs ${STATUS_BADGE[ev.status ?? ""] ?? "bg-text3/15 text-text3"}`}>
                            {ev.status ?? "unknown"}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-right text-text3 tabular-nums text-xs">
                          {ev.hop_count ?? 0}
                        </td>
                        <td className="px-4 py-2.5 text-right text-text3 tabular-nums text-xs">
                          {ev.latency_ms != null ? `${ev.latency_ms}ms` : "--"}
                        </td>
                        <td className="px-4 py-2.5 text-text3 text-xs font-mono">
                          {ev.correlation_id ? ev.correlation_id.slice(0, 8) : "--"}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${ev.id}-detail`} className="border-b border-border/50 bg-surface/20">
                          <td colSpan={8} className="px-6 py-3">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-2xs font-semibold uppercase tracking-wide text-text3 mb-1">Payload</p>
                                <pre className="text-xs text-text2 bg-background rounded p-2 overflow-auto max-h-40">
                                  {JSON.stringify(ev.payload, null, 2)}
                                </pre>
                              </div>
                              <div>
                                <p className="text-2xs font-semibold uppercase tracking-wide text-text3 mb-1">Response</p>
                                <pre className="text-xs text-text2 bg-background rounded p-2 overflow-auto max-h-40">
                                  {ev.response_payload
                                    ? JSON.stringify(ev.response_payload, null, 2)
                                    : "null"
                                  }
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
