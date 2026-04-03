import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"

// ── Types ──────────────────────────────────────────────

interface WatcherRow {
  id: string
  project_id: string
  project_name: string
  name: string
  watcher_type: string
  schedule_interval_sec: number
  status: string
  last_run_at: number | null
  next_run_at: number | null
  last_error: string | null
  run_count: number
  finding_count: number
  notify_email: string | null
  created_at: number
}

// ── Helpers ────────────────────────────────────────────

function formatRelativeTime(epoch: number | null): string {
  if (!epoch) return "never"
  const now = Date.now() / 1000
  const diff = now - epoch
  const abs = Math.abs(diff)
  const future = diff < 0

  if (abs < 60) return "just now"
  if (abs < 3600) {
    const m = Math.round(abs / 60)
    return future ? `in ${m}m` : `${m}m ago`
  }
  if (abs < 86400) {
    const h = Math.round(abs / 3600)
    return future ? `in ${h}h` : `${h}h ago`
  }
  const d = Math.round(abs / 86400)
  return future ? `in ${d}d` : `${d}d ago`
}

function formatNextRun(epoch: number | null): string {
  if (!epoch) return "never"
  const now = Date.now() / 1000
  if (epoch < now) return "overdue"
  return formatRelativeTime(epoch)
}

function formatInterval(seconds: number): string {
  if (seconds === 3600) return "Hourly"
  if (seconds === 86400) return "Daily"
  if (seconds < 3600) return `Every ${Math.round(seconds / 60)}m`
  const h = Math.round(seconds / 3600)
  return `Every ${h}h`
}

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  web_search:    { label: "Web",    cls: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  rss_feed:      { label: "RSS",    cls: "bg-orange-500/15 text-orange-400 border-orange-500/20" },
  email_monitor: { label: "Email",  cls: "bg-purple-500/15 text-purple-400 border-purple-500/20" },
  custom:        { label: "Custom", cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20" },
}

const STATUS_DOT: Record<string, { dot: string; label: string }> = {
  active: { dot: "bg-emerald-400", label: "Active" },
  paused: { dot: "bg-yellow-400",  label: "Paused" },
  error:  { dot: "bg-red-400",     label: "Error" },
}

// ── Component ──────────────────────────────────────────

export default function WatchersPage() {
  const [statusFilter, setStatusFilter] = useState("all")
  const [projectFilter, setProjectFilter] = useState("all")

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "watchers"],
    queryFn: () => api<{ watchers: WatcherRow[]; total: number }>("/api/v1/admin/watchers?limit=100"),
    refetchInterval: 30_000,
  })

  const watchers = data?.watchers ?? []

  // Unique project names for filter dropdown
  const projectNames = useMemo(() => {
    const names = new Set(watchers.map(w => w.project_name))
    return Array.from(names).sort()
  }, [watchers])

  // Client-side filtering
  const filtered = useMemo(() => {
    let result = watchers
    if (statusFilter !== "all") {
      result = result.filter(w => w.status === statusFilter)
    }
    if (projectFilter !== "all") {
      result = result.filter(w => w.project_name === projectFilter)
    }
    return result
  }, [watchers, statusFilter, projectFilter])

  const activeCount = watchers.filter(w => w.status === "active").length

  // ── Render ─────────────────────────────────────────

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Project Watchers</h1>
        <p className="text-sm text-text3 mt-1">
          {activeCount} active watcher{activeCount !== 1 ? "s" : ""} across {projectNames.length} project{projectNames.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4">
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="h-8 rounded-md border border-border bg-surface px-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent-porter"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="error">Error</option>
        </select>

        <select
          value={projectFilter}
          onChange={e => setProjectFilter(e.target.value)}
          className="h-8 rounded-md border border-border bg-surface px-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent-porter"
        >
          <option value="all">All Projects</option>
          {projectNames.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>

        <span className="text-xs text-text3 ml-auto tabular-nums">
          {filtered.length} watcher{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="size-5 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <p className="text-sm text-red-400">{(error as Error)?.message || "Failed to load watchers"}</p>
          <button
            onClick={() => refetch()}
            className="text-sm text-accent-porter hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !isError && filtered.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <p className="text-sm text-text3">
            {watchers.length === 0
              ? "No watchers configured. Create watchers via the API or project settings."
              : "No watchers match the current filters."}
          </p>
        </div>
      )}

      {/* Table */}
      {!isLoading && !isError && filtered.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface/50">
                  <th className="text-left font-medium text-text3 px-4 py-2.5">Name</th>
                  <th className="text-left font-medium text-text3 px-4 py-2.5">Project</th>
                  <th className="text-left font-medium text-text3 px-4 py-2.5">Type</th>
                  <th className="text-left font-medium text-text3 px-4 py-2.5">Status</th>
                  <th className="text-left font-medium text-text3 px-4 py-2.5">Last Run</th>
                  <th className="text-left font-medium text-text3 px-4 py-2.5">Next Run</th>
                  <th className="text-right font-medium text-text3 px-4 py-2.5">Runs</th>
                  <th className="text-right font-medium text-text3 px-4 py-2.5">Findings</th>
                  <th className="text-left font-medium text-text3 px-4 py-2.5">Schedule</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(w => {
                  const typeBadge = TYPE_BADGE[w.watcher_type] ?? TYPE_BADGE.custom
                  const statusInfo = STATUS_DOT[w.status] ?? STATUS_DOT.paused
                  return (
                    <tr key={w.id} className="border-b border-border/50 hover:bg-surface/30 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-foreground">{w.name}</td>
                      <td className="px-4 py-2.5 text-text3">{w.project_name}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className={`text-2xs ${typeBadge.cls}`}>
                          {typeBadge.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1.5" title={w.status === "error" && w.last_error ? w.last_error : undefined}>
                          <span className={`inline-block size-2 rounded-full ${statusInfo.dot}`} />
                          <span className={`text-xs ${w.status === "error" ? "text-red-400" : w.status === "paused" ? "text-yellow-400" : "text-emerald-400"}`}>
                            {statusInfo.label}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-text3 tabular-nums">{formatRelativeTime(w.last_run_at)}</td>
                      <td className="px-4 py-2.5 tabular-nums">
                        <span className={formatNextRun(w.next_run_at) === "overdue" ? "text-red-400" : "text-text3"}>
                          {formatNextRun(w.next_run_at)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-text3">{w.run_count}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-text3">{w.finding_count}</td>
                      <td className="px-4 py-2.5 text-text3">{formatInterval(w.schedule_interval_sec)}</td>
                    </tr>
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
