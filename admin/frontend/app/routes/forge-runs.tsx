import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { api } from "~/lib/api"

// --- Types ---

interface PipelineRun {
  id: string
  template_id: string | null
  agent_id: string | null
  station: string
  status: string
  wave: number | null
  attempt: number
  max_attempts: number
  tokens_used: number
  worker_id: string | null
  created_at: string
  updated_at: string | null
  started_at: string | null
  completed_at: string | null
  error: string | null
  agent_name: string | null
}

interface StationRun {
  id: string
  pipeline_id: string
  station: string
  phase: string | null
  status: string
  writer_model: string | null
  checker_model: string | null
  quality_score: number | null
  rubric: unknown
  qa_rationale: string | null
  files_touched: unknown
  skills_assigned: unknown
  tools_mapped: unknown
  cost_reserved: number | null
  cost_actual: number | null
  tokens_used: number
  created_at: string
  updated_at: string | null
  started_at: string | null
  completed_at: string | null
}

interface ForgeStats {
  statusCounts: { status: string; count: number }[]
  totalTokens: number
  avgQuality: number
  totalRuns: number
}

// --- Helpers ---

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-text3/10 text-text3",
  running: "bg-blue-500/10 text-blue-400",
  complete: "bg-green-500/10 text-green-400",
  failed: "bg-red-500/10 text-red-400",
  cancelled: "bg-yellow-500/10 text-yellow-400",
}

function StatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] ?? "bg-text3/10 text-text3"
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors}`}>
      {status}
    </span>
  )
}

function QualityScore({ score }: { score: number | null }) {
  if (score === null || score === undefined) return <span className="text-text3">-</span>
  const color = score >= 80 ? "text-green-400" : score >= 60 ? "text-yellow-400" : "text-red-400"
  return <span className={`font-mono font-medium ${color}`}>{score.toFixed(1)}</span>
}

function fmtDate(d: string | null): string {
  if (!d) return "-"
  const date = new Date(d)
  if (isNaN(date.getTime())) return d
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function fmtTokens(n: number | null | undefined): string {
  if (!n) return "0"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

// --- Components ---

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="text-2xs text-text3 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold text-text mt-1">{value}</div>
      {sub && <div className="text-2xs text-text3 mt-0.5">{sub}</div>}
    </div>
  )
}

function StatsRow({ stats }: { stats: ForgeStats }) {
  const statusMap = Object.fromEntries(stats.statusCounts.map((s) => [s.status, s.count]))

  return (
    <div className="grid grid-cols-5 gap-3">
      <MetricCard label="Total Runs" value={stats.totalRuns.toLocaleString()} />
      <MetricCard
        label="By Status"
        value={`${statusMap.complete ?? 0} done`}
        sub={`${statusMap.running ?? 0} running, ${statusMap.queued ?? 0} queued, ${statusMap.failed ?? 0} failed`}
      />
      <MetricCard label="Avg Quality" value={stats.avgQuality ? stats.avgQuality.toFixed(1) : "-"} />
      <MetricCard label="Total Tokens" value={fmtTokens(stats.totalTokens)} />
      <MetricCard
        label="Cancelled"
        value={String(statusMap.cancelled ?? 0)}
      />
    </div>
  )
}

function PipelineRow({ run, expanded, onToggle }: { run: PipelineRun; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr
        className="border-b border-border/30 last:border-0 hover:bg-surface/50 cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-3 py-1.5 text-xs text-text3">
          <span className={`inline-block transition-transform ${expanded ? "rotate-90" : ""}`}>
            &#9654;
          </span>
        </td>
        <td className="px-3 py-1.5 text-xs text-text2 whitespace-nowrap">{fmtDate(run.created_at)}</td>
        <td className="px-3 py-1.5 text-xs font-medium text-text">
          {run.agent_id ? (
            <Link to={`/agents/${run.agent_id}`} className="text-accent-porter hover:underline">
              {run.agent_name ?? run.agent_id}
            </Link>
          ) : (
            <span className="text-text3">-</span>
          )}
        </td>
        <td className="px-3 py-1.5 text-xs text-text2">{run.station}</td>
        <td className="px-3 py-1.5 text-xs"><StatusBadge status={run.status} /></td>
        <td className="px-3 py-1.5 text-xs text-text2 text-right">{run.wave ?? "-"}</td>
        <td className="px-3 py-1.5 text-xs text-text2 text-right">{fmtTokens(run.tokens_used)}</td>
        <td className="px-3 py-1.5 text-xs text-right">
          {run.error && <span className="text-red-400 truncate max-w-[150px] inline-block">{run.error.slice(0, 40)}</span>}
        </td>
      </tr>
      {expanded && <ExpandedStationRuns pipelineId={run.id} />}
    </>
  )
}

function ExpandedStationRuns({ pipelineId }: { pipelineId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "forge-runs", pipelineId],
    queryFn: () =>
      api<{ pipeline: PipelineRun; stationRuns: StationRun[] }>(`/api/admin/forge-runs/${pipelineId}`),
  })

  const stationRuns = data?.stationRuns ?? []

  if (isLoading) {
    return (
      <tr>
        <td colSpan={8} className="px-6 py-3 bg-raised/50">
          <div className="flex items-center gap-2 text-xs text-text3">
            <div className="size-4 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
            Loading station runs...
          </div>
        </td>
      </tr>
    )
  }

  if (!stationRuns.length) {
    return (
      <tr>
        <td colSpan={8} className="px-6 py-3 bg-raised/50 text-xs text-text3">
          No station runs
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td colSpan={8} className="px-4 py-2 bg-raised/30">
        <div className="rounded border border-border/50 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-left bg-surface/50">
                <th className="px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-text3">Station</th>
                <th className="px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-text3">Phase</th>
                <th className="px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-text3">Status</th>
                <th className="px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-text3">Writer</th>
                <th className="px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-text3">Checker</th>
                <th className="px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-text3 text-right">Quality</th>
                <th className="px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-text3 text-right">Tokens</th>
                <th className="px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-text3">Time</th>
              </tr>
            </thead>
            <tbody>
              {stationRuns.map((sr) => (
                <tr key={sr.id} className="border-t border-border/20">
                  <td className="px-2 py-1 text-xs font-medium text-text">{sr.station}</td>
                  <td className="px-2 py-1 text-xs text-text2">{sr.phase ?? "-"}</td>
                  <td className="px-2 py-1 text-xs"><StatusBadge status={sr.status} /></td>
                  <td className="px-2 py-1 text-xs text-text3">{sr.writer_model ?? "-"}</td>
                  <td className="px-2 py-1 text-xs text-text3">{sr.checker_model ?? "-"}</td>
                  <td className="px-2 py-1 text-xs text-right"><QualityScore score={sr.quality_score} /></td>
                  <td className="px-2 py-1 text-xs text-text2 text-right">{fmtTokens(sr.tokens_used)}</td>
                  <td className="px-2 py-1 text-xs text-text3 whitespace-nowrap">{fmtDate(sr.started_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  )
}

// --- Main Page ---

export default function ForgeRunsPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState("")

  const { data: statsData } = useQuery({
    queryKey: ["admin", "forge-runs", "stats"],
    queryFn: () => api<ForgeStats>("/api/admin/forge-runs/stats"),
  })

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "forge-runs", statusFilter],
    queryFn: () =>
      api<{ runs: PipelineRun[]; total: number }>(
        `/api/admin/forge-runs${statusFilter ? `?status=${statusFilter}` : ""}`
      ),
  })

  const stats = statsData ?? { statusCounts: [], totalTokens: 0, avgQuality: 0, totalRuns: 0 }
  const runs = data?.runs ?? []

  const statuses = ["", "queued", "running", "complete", "failed", "cancelled"]

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <h1 className="text-xl font-semibold text-text">Forge Pipeline</h1>

      <StatsRow stats={stats} />

      {/* Status filter */}
      <div className="flex items-center gap-2">
        <span className="text-2xs text-text3 uppercase">Filter:</span>
        {statuses.map((s) => (
          <button
            key={s || "all"}
            onClick={() => setStatusFilter(s)}
            className={`text-2xs px-2 py-0.5 rounded ${
              statusFilter === s
                ? "bg-accent-porter text-white"
                : "bg-raised text-text3 hover:text-text"
            }`}
          >
            {s || "All"}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
        </div>
      )}

      {!isLoading && runs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-text3">
          <svg className="size-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
          </svg>
          <span className="text-sm">No forge pipeline runs</span>
        </div>
      )}

      {!isLoading && runs.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50 text-left bg-surface">
                <th className="px-3 py-1.5 w-6"></th>
                <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Date</th>
                <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Agent</th>
                <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Station</th>
                <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Status</th>
                <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3 text-right">Wave</th>
                <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3 text-right">Tokens</th>
                <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3 text-right">Error</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <PipelineRow
                  key={run.id}
                  run={run}
                  expanded={expandedId === run.id}
                  onToggle={() => setExpandedId(expandedId === run.id ? null : run.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
