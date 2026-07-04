import { useState } from "react"
import { Link } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { MessageSquare } from "lucide-react"

// -- Types --

interface FeedbackEvent {
  id: string
  persona_id: string
  skill_id: string
  dispatch_id: string
  event_type: string
  note: string | null
  created_at: number
  skill_name: string | null
  agent_name: string | null
}

interface FeedbackStats {
  total: number
  positiveRate: number
  byType: Array<{ type: string; count: number }>
  bySkill: Array<{ skill_id: string; skill_name: string; count: number }>
}

// -- Helpers --

function fmtDate(epoch: number) {
  if (!epoch) return "--"
  return new Date(epoch * 1000).toLocaleString()
}

const TYPE_BADGE: Record<string, string> = {
  positive:   "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  success:    "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  negative:   "bg-red-500/15 text-red-400 border-red-500/20",
  correction: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  retry:      "bg-orange-500/15 text-orange-400 border-orange-500/20",
  abandon:    "bg-text3/15 text-text3 border-text3/20",
}

// -- Component --

export default function SkillFeedbackPage() {
  const [filterType, setFilterType] = useState("")
  const [filterSkill, setFilterSkill] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ["admin", "skill-feedback", "stats"],
    queryFn: () => api<FeedbackStats>("/api/admin/skill-feedback/stats"),
  })

  const params = new URLSearchParams()
  if (filterType) params.set("type", filterType)
  if (filterSkill) params.set("skill", filterSkill)

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "skill-feedback", filterType, filterSkill],
    queryFn: () => api<{ events: FeedbackEvent[]; count: number }>(`/api/admin/skill-feedback?${params}`),
  })

  const events = data?.events ?? []
  const topSkill = stats?.bySkill?.[0]

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <MessageSquare className="size-5 text-accent-porter" />
        <div>
          <h1 className="text-xl font-semibold text-text">Skill Feedback</h1>
          <p className="text-sm text-text3 mt-0.5">Feedback events from skill executions</p>
        </div>
      </div>

      {/* Stats Row */}
      {!loadingStats && stats && (
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-lg border border-border bg-surface p-4">
            <span className="text-xs text-text3 uppercase">Total Feedback</span>
            <p className="text-2xl font-bold mt-1 text-text">{stats.total.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <span className="text-xs text-text3 uppercase">Positive Rate</span>
            <p className={`text-2xl font-bold mt-1 ${stats.positiveRate >= 50 ? "text-emerald-400" : "text-red-400"}`}>
              {stats.positiveRate}%
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <span className="text-xs text-text3 uppercase">Top Skill</span>
            <p className="text-sm font-bold mt-1 text-text truncate">
              {topSkill ? `${topSkill.skill_name} (${topSkill.count})` : "--"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <span className="text-xs text-text3 uppercase">By Type</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {stats.byType.map(t => (
                <span key={t.type} className="text-2xs text-text2">
                  {t.type}: {t.count}
                </span>
              ))}
              {stats.byType.length === 0 && <span className="text-2xs text-text3">--</span>}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2">
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="h-8 rounded-md border border-border bg-surface px-3 text-xs text-text focus:outline-none focus:ring-1 focus:ring-accent-porter"
        >
          <option value="">All types</option>
          <option value="positive">Positive</option>
          <option value="success">Success</option>
          <option value="negative">Negative</option>
          <option value="correction">Correction</option>
          <option value="retry">Retry</option>
          <option value="abandon">Abandon</option>
        </select>
        <input
          type="text"
          placeholder="Filter by skill ID..."
          value={filterSkill}
          onChange={e => setFilterSkill(e.target.value)}
          className="h-8 rounded-md border border-border bg-surface px-3 text-xs text-text placeholder:text-text3 focus:outline-none focus:ring-1 focus:ring-accent-porter"
        />
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="size-5 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
        </div>
      )}

      {/* Empty */}
      {!isLoading && events.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <MessageSquare className="size-8 text-text3/30 mb-2" />
          <p className="text-sm text-text3">No feedback events found</p>
        </div>
      )}

      {/* Table */}
      {!isLoading && events.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface/50">
                  <th className="text-left font-medium text-text3 text-xs px-4 py-2.5">Date</th>
                  <th className="text-left font-medium text-text3 text-xs px-4 py-2.5">Skill</th>
                  <th className="text-left font-medium text-text3 text-xs px-4 py-2.5">Type</th>
                  <th className="text-left font-medium text-text3 text-xs px-4 py-2.5">Agent</th>
                  <th className="text-left font-medium text-text3 text-xs px-4 py-2.5">Note</th>
                </tr>
              </thead>
              <tbody>
                {events.map(ev => (
                  <>
                    <tr
                      key={ev.id}
                      className="border-b border-border/50 hover:bg-surface/30 transition-colors cursor-pointer"
                      onClick={() => setExpandedId(expandedId === ev.id ? null : ev.id)}
                    >
                      <td className="px-4 py-2.5 text-text3 tabular-nums text-xs whitespace-nowrap">
                        {fmtDate(ev.created_at)}
                      </td>
                      <td className="px-4 py-2.5">
                        <Link
                          to={`/skills`}
                          className="text-accent-porter hover:underline text-xs"
                          onClick={e => e.stopPropagation()}
                        >
                          {ev.skill_name || ev.skill_id}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge
                          variant="outline"
                          className={`text-2xs ${TYPE_BADGE[ev.event_type] ?? "bg-text3/15 text-text3 border-text3/20"}`}
                        >
                          {ev.event_type}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        {ev.persona_id ? (
                          <Link
                            to={`/agents/${ev.persona_id}`}
                            className="text-accent-porter hover:underline text-xs"
                            onClick={e => e.stopPropagation()}
                          >
                            {ev.agent_name || ev.persona_id.slice(0, 8)}
                          </Link>
                        ) : (
                          <span className="text-text3 text-xs">--</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-text2 text-xs max-w-xs truncate">
                        {ev.note || "--"}
                      </td>
                    </tr>
                    {expandedId === ev.id && ev.note && (
                      <tr key={`${ev.id}-detail`} className="border-b border-border/50 bg-surface/20">
                        <td colSpan={5} className="px-4 py-3">
                          <div className="text-xs text-text2 whitespace-pre-wrap break-words font-mono bg-surface rounded-md p-3 border border-border">
                            {ev.note}
                          </div>
                          <div className="flex gap-4 mt-2 text-2xs text-text3">
                            <span>Dispatch: <code className="font-mono">{ev.dispatch_id}</code></span>
                            <span>Skill ID: <code className="font-mono">{ev.skill_id}</code></span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
