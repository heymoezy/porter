import { useState } from "react"
import { Link } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { GraduationCap } from "lucide-react"

// ── Types ──────────────────────────────────────────────

interface Learning {
  session_id: string
  source: string
  learnings: string
  backend_used: string | null
  extracted_at: number
}

interface LearningsStats {
  total: number
  bySource: Array<{ source: string; count: number }>
  byBackend: Array<{ backend: string; count: number }>
}

// ── Helpers ────────────────────────────────────────────

function fmtDate(epoch: number) {
  if (!epoch) return "--"
  return new Date(epoch * 1000).toLocaleString()
}

const SOURCE_BADGE: Record<string, string> = {
  chat:       "bg-blue-500/15 text-blue-400 border-blue-500/20",
  dispatch:   "bg-purple-500/15 text-purple-400 border-purple-500/20",
  bridge:     "bg-orange-500/15 text-orange-400 border-orange-500/20",
  feedback:   "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  system:     "bg-text3/15 text-text3 border-text3/20",
}

const BACKEND_BADGE: Record<string, string> = {
  openclaw:   "bg-blue-500/15 text-blue-400 border-blue-500/20",
  ollama:     "bg-purple-500/15 text-purple-400 border-purple-500/20",
  claude:     "bg-orange-500/15 text-orange-400 border-orange-500/20",
  gemini:     "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  codex:      "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
}

// ── Component ──────────────────────────────────────────

export default function LearningsPage() {
  const [filterSource, setFilterSource] = useState("")
  const [filterBackend, setFilterBackend] = useState("")

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ["admin", "learnings", "stats"],
    queryFn: () => api<LearningsStats>("/api/admin/learnings/stats"),
  })

  const params = new URLSearchParams()
  if (filterSource) params.set("source", filterSource)
  if (filterBackend) params.set("backend", filterBackend)

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "learnings", filterSource, filterBackend],
    queryFn: () => api<{ learnings: Learning[]; count: number }>(`/api/admin/learnings?${params}`),
  })

  const learnings = data?.learnings ?? []

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <GraduationCap className="size-5 text-accent-porter" />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">Session Learnings</h1>
          <p className="text-sm text-text3 mt-0.5">Extracted knowledge from AI sessions</p>
        </div>
      </div>

      {/* Stats Row */}
      {!loadingStats && stats && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="rounded-xl border border-border bg-surface p-2.5">
            <span className="text-2xs text-text3 uppercase">Total Learnings</span>
            <p className="text-sm font-bold text-text mt-0.5">{stats.total.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-2.5">
            <span className="text-2xs text-text3 uppercase">Sources</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {stats.bySource.map(s => (
                <span key={s.source} className="text-2xs text-text2">
                  {s.source}: {s.count}
                </span>
              ))}
              {stats.bySource.length === 0 && <span className="text-2xs text-text3">--</span>}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-2.5">
            <span className="text-2xs text-text3 uppercase">Backends</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {stats.byBackend.map(b => (
                <span key={b.backend} className="text-2xs text-text2">
                  {b.backend}: {b.count}
                </span>
              ))}
              {stats.byBackend.length === 0 && <span className="text-2xs text-text3">--</span>}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Filter by source..."
          value={filterSource}
          onChange={e => setFilterSource(e.target.value)}
          className="h-8 rounded-md border border-border bg-surface px-3 text-xs text-text placeholder:text-text3 focus:outline-none focus:ring-1 focus:ring-accent-porter"
        />
        <input
          type="text"
          placeholder="Filter by backend..."
          value={filterBackend}
          onChange={e => setFilterBackend(e.target.value)}
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
      {!isLoading && learnings.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <GraduationCap className="size-8 text-text3/30 mb-2" />
          <p className="text-sm text-text3">No session learnings found</p>
        </div>
      )}

      {/* Table */}
      {!isLoading && learnings.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface/50">
                  <th className="text-left font-medium text-text3 px-4 py-2.5">Date</th>
                  <th className="text-left font-medium text-text3 px-4 py-2.5">Source</th>
                  <th className="text-left font-medium text-text3 px-4 py-2.5">Backend</th>
                  <th className="text-left font-medium text-text3 px-4 py-2.5">Learnings</th>
                  <th className="text-left font-medium text-text3 px-4 py-2.5">Session</th>
                </tr>
              </thead>
              <tbody>
                {learnings.map(l => (
                  <tr key={l.session_id} className="border-b border-border/50 hover:bg-surface/30 transition-colors">
                    <td className="px-4 py-2.5 text-text3 tabular-nums text-xs whitespace-nowrap">
                      {fmtDate(l.extracted_at)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline" className={`text-2xs ${SOURCE_BADGE[l.source] ?? "bg-text3/15 text-text3 border-text3/20"}`}>
                        {l.source || "unknown"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline" className={`text-2xs ${BACKEND_BADGE[l.backend_used ?? ""] ?? "bg-text3/15 text-text3 border-text3/20"}`}>
                        {l.backend_used || "unknown"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-text2 text-xs max-w-lg">
                      <p className="whitespace-pre-wrap break-words">{l.learnings}</p>
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono">
                      <Link to="/sessions" className="text-accent-porter hover:underline">
                        {l.session_id.slice(0, 8)}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
