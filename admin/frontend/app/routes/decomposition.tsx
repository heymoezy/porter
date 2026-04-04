import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { GitBranch, ChevronDown, ChevronRight, RefreshCw } from "lucide-react"

// ── Types ──────────────────────────────────────────────

interface RootTask {
  id: string
  description: string
  status: string
  subtask_count: number
  completed_count: number
  failed_count: number
  created_at: string
}

interface Subtask {
  id: string
  description: string
  status: string
  assigned_agent?: string
  gateway?: string
  duration_ms?: number
  depth: number
  children?: Subtask[]
}

interface TreeResponse {
  root: RootTask
  subtasks: Subtask[]
}

// ── Helpers ────────────────────────────────────────────

function fmtRel(ts: string) {
  const epoch = new Date(ts).getTime() / 1000
  const d = Date.now() / 1000 - epoch
  if (d < 60) return "just now"
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  if (d < 604800) return `${Math.floor(d / 86400)}d ago`
  return new Date(epoch * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function fmtDuration(ms?: number) {
  if (!ms) return "--"
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60_000).toFixed(1)}m`
}

function truncate(s: string, len: number) {
  return s.length > len ? s.slice(0, len) + "..." : s
}

const STATUS_BADGE: Record<string, { cls: string }> = {
  pending:   { cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20" },
  ready:     { cls: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  running:   { cls: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
  completed: { cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  failed:    { cls: "bg-red-500/15 text-red-400 border-red-500/20" },
  cancelled: { cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20" },
}

// ── Subtask Row ────────────────────────────────────────

function SubtaskRow({ subtask }: { subtask: Subtask }) {
  const badge = STATUS_BADGE[subtask.status] ?? STATUS_BADGE.pending

  return (
    <>
      <tr className="border-b border-border/30 hover:bg-surface/20 transition-colors">
        <td className="px-4 py-2 text-text2">
          <span style={{ paddingLeft: `${subtask.depth * 20}px` }} className="inline-flex items-center gap-1.5">
            <GitBranch className="size-3 text-text3 shrink-0" />
            <span className="text-xs">{subtask.description}</span>
          </span>
        </td>
        <td className="px-4 py-2">
          <Badge variant="outline" className={`text-2xs ${badge.cls}`}>
            {subtask.status}
          </Badge>
        </td>
        <td className="px-4 py-2 text-2xs text-text3">{subtask.assigned_agent || "--"}</td>
        <td className="px-4 py-2 text-2xs text-text3">{subtask.gateway || "--"}</td>
        <td className="px-4 py-2 text-2xs text-text3 tabular-nums text-right">{fmtDuration(subtask.duration_ms)}</td>
      </tr>
      {subtask.children?.map(child => (
        <SubtaskRow key={child.id} subtask={child} />
      ))}
    </>
  )
}

// ── Expandable Root Row ────────────────────────────────

function RootRow({ task }: { task: RootTask }) {
  const [expanded, setExpanded] = useState(false)
  const badge = STATUS_BADGE[task.status] ?? STATUS_BADGE.pending

  const tree = useQuery({
    queryKey: ["decomposition", "tree", task.id],
    queryFn: () => api<TreeResponse>(`/api/v1/decomposition/${task.id}/tree`),
    enabled: expanded,
  })

  const subtasks = tree.data?.subtasks ?? []

  return (
    <>
      <tr
        className="border-b border-border/50 hover:bg-surface/30 transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-2.5 text-foreground">
          <span className="inline-flex items-center gap-1.5">
            {expanded
              ? <ChevronDown className="size-3.5 text-text3 shrink-0" />
              : <ChevronRight className="size-3.5 text-text3 shrink-0" />}
            <span className="line-clamp-1">{truncate(task.description, 80)}</span>
          </span>
        </td>
        <td className="px-4 py-2.5">
          <Badge variant="outline" className={`text-2xs ${badge.cls}`}>
            {task.status}
          </Badge>
        </td>
        <td className="px-4 py-2.5 text-text3 tabular-nums text-right">{task.subtask_count}</td>
        <td className="px-4 py-2.5 tabular-nums text-right">
          <span className="text-emerald-400">{task.completed_count}</span>
        </td>
        <td className="px-4 py-2.5 tabular-nums text-right">
          <span className={task.failed_count > 0 ? "text-red-400" : "text-text3"}>{task.failed_count}</span>
        </td>
        <td className="px-4 py-2.5 text-text3 tabular-nums">{fmtRel(task.created_at)}</td>
      </tr>

      {/* Expanded subtask tree */}
      {expanded && (
        tree.isLoading ? (
          <tr>
            <td colSpan={6} className="px-4 py-4">
              <div className="flex items-center justify-center">
                <div className="size-4 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
              </div>
            </td>
          </tr>
        ) : subtasks.length === 0 ? (
          <tr>
            <td colSpan={6} className="px-8 py-3 text-2xs text-text3">No subtasks</td>
          </tr>
        ) : (
          <>
            <tr className="bg-surface/20">
              <td className="px-4 py-1.5 text-2xs font-medium text-text3">Subtask</td>
              <td className="px-4 py-1.5 text-2xs font-medium text-text3">Status</td>
              <td className="px-4 py-1.5 text-2xs font-medium text-text3">Agent</td>
              <td className="px-4 py-1.5 text-2xs font-medium text-text3">Gateway</td>
              <td className="px-4 py-1.5 text-2xs font-medium text-text3 text-right">Duration</td>
            </tr>
            {subtasks.map(st => (
              <SubtaskRow key={st.id} subtask={st} />
            ))}
          </>
        )
      )}
    </>
  )
}

// ── Main ───────────────────────────────────────────────

export default function DecompositionPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin", "decomposition"],
    queryFn: () => api<{ tasks: RootTask[] }>("/api/v1/decomposition"),
    refetchInterval: 15_000,
  })

  const tasks = data?.tasks ?? []

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <GitBranch className="size-5 text-accent-porter" />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">Task Decomposition</h1>
          <p className="text-sm text-text3 mt-0.5">
            {tasks.length} root task{tasks.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={() => refetch()} className={isFetching ? "animate-spin" : ""}>
          <RefreshCw className="size-3" />
        </Button>
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
          <p className="text-sm text-red-400">{(error as Error)?.message || "Failed to load tasks"}</p>
          <button onClick={() => refetch()} className="text-sm text-accent-porter hover:underline">
            Retry
          </button>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !isError && tasks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <GitBranch className="size-8 text-text3/30 mb-2" />
          <p className="text-sm text-text3">No decomposed tasks</p>
          <p className="text-2xs text-text3/60 mt-1">Task decomposition trees will appear here when agents break down complex work</p>
        </div>
      )}

      {/* Table */}
      {!isLoading && !isError && tasks.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface/50">
                  <th className="text-left font-medium text-text3 px-4 py-2.5">Description</th>
                  <th className="text-left font-medium text-text3 px-4 py-2.5">Status</th>
                  <th className="text-right font-medium text-text3 px-4 py-2.5">Subtasks</th>
                  <th className="text-right font-medium text-text3 px-4 py-2.5">Done</th>
                  <th className="text-right font-medium text-text3 px-4 py-2.5">Failed</th>
                  <th className="text-left font-medium text-text3 px-4 py-2.5">Created</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map(t => (
                  <RootRow key={t.id} task={t} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
