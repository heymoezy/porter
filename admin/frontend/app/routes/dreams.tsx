import { useEffect, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Moon, RefreshCw, Play } from "lucide-react"
import { toast } from "sonner"
import { Button } from "~/components/ui/button"
import { Badge } from "~/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "~/components/ui/select"
import { api } from "~/lib/api"
import { ProposalKindBadge } from "~/components/ProposalKindBadge"
import { ProposalDetailDrawer } from "~/components/ProposalDetailDrawer"

// ──────────────────────────────────────────────────────────────────────────
// Types — mirror raw pg snake_case shape from /api/admin/dreams/* (Plan 02).
// api() helper auto-unwraps the { data: T } envelope (api.ts:62-66), so call
// sites receive T directly.
// ──────────────────────────────────────────────────────────────────────────
interface MemoryProposal {
  id: string
  dream_run_id: string
  silo_id: string
  proposal_kind: "merge" | "supersede" | "delete" | "new_directive"
  target_directive_ids: string[]
  proposed_content: string
  proposed_metadata: Record<string, unknown>
  source_evidence: Record<string, unknown>
  sort_order: number
  status: "pending" | "accepted" | "rejected" | "expired"
  created_at: number
  expires_at: number | null
  reviewed_at: number | null
  reviewed_by: string | null
}

interface ProposalsResponse {
  proposals: MemoryProposal[]
  count: number
  total: number
  counts_by_status: {
    pending: number
    accepted: number
    rejected: number
    expired: number
  }
}

interface DreamRun {
  id: string
  silo_id: string
  status: "running" | "completed" | "failed"
  model_used: string | null
  triggered_by: string
  proposals_extracted: number | null
  duration_ms: number | null
  started_at: number
  completed_at: number | null
  proposals_count: number
  pending_count: number
  accepted_count: number
  rejected_count: number
  expired_count: number
}

interface RunsResponse {
  runs: DreamRun[]
  count: number
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────
function fmtRel(ts: number | null | undefined): string {
  if (!ts) return "—"
  const now = Date.now() / 1000
  const diff = now - ts
  if (diff < 60) return "just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`
  return new Date(ts * 1000).toLocaleDateString()
}

function truncate(s: string, n = 120): string {
  if (!s) return ""
  return s.length > n ? s.slice(0, n - 1) + "…" : s
}

// ──────────────────────────────────────────────────────────────────────────
// Page component
// ──────────────────────────────────────────────────────────────────────────
export default function DreamsPage() {
  const qc = useQueryClient()
  // Silo Select is hardcoded for v1; future enhancement loads from /api/admin/silos.
  const [silo, setSilo] = useState<string>("software")
  const [status, setStatus] = useState<string>("pending")
  // runFilter narrows the proposals table to a single dream_run_id when set
  // (via the "view" button in the Recent runs card). null = no filter.
  const [runFilter, setRunFilter] = useState<string | null>(null)
  // selectedProposalId opens ProposalDetailDrawer when non-null.
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(
    null,
  )

  const proposalsQ = useQuery<ProposalsResponse>({
    queryKey: ["admin", "dreams", "proposals", silo, status, runFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (silo) params.set("silo_id", silo)
      if (status && status !== "all") params.set("status", status)
      if (runFilter) params.set("dream_run_id", runFilter)
      params.set("limit", "200")
      return api<ProposalsResponse>(`/api/admin/dreams/proposals?${params}`)
    },
  })

  // ── Listen for SSE-driven dream-run-completed event (dispatched by useAdminSSE).
  // Show a toast so the reviewer notices a completed run even when not looking
  // at the runs sidebar. Cleanup on unmount.
  useEffect(() => {
    function onRunCompleted(e: Event) {
      const detail = (e as CustomEvent).detail as
        | {
            status?: string
            proposals_extracted?: number
            silo_id?: string
          }
        | undefined
      if (!detail) return
      if (detail.status === "completed") {
        toast.success(
          `Dream run completed: ${detail.proposals_extracted ?? 0} proposals (${detail.silo_id ?? "—"})`,
        )
      } else if (detail.status === "failed") {
        toast.error(`Dream run failed (${detail.silo_id ?? "—"})`)
      }
    }
    window.addEventListener("dreams:run-completed", onRunCompleted)
    return () =>
      window.removeEventListener("dreams:run-completed", onRunCompleted)
  }, [])

  const runsQ = useQuery<RunsResponse>({
    queryKey: ["admin", "dreams", "runs", silo],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (silo) params.set("silo_id", silo)
      params.set("limit", "20")
      return api<RunsResponse>(`/api/admin/dreams/runs?${params}`)
    },
  })

  const runNow = useMutation({
    // api() helper sets Content-Type + stringifies via `json:` option (api.ts:12-14
    // — ApiOptions extends Omit<RequestInit, "body">). Never pass body/headers manually.
    mutationFn: () =>
      api<{ dream_run_id: string; status: string; poll_url?: string }>(
        "/api/v1/intellect/dream-run",
        {
          method: "POST",
          json: {
            silo_id: silo,
            sample_size_override: 200000,
            triggered_by: "admin-ui",
          },
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "dreams", "runs"] })
    },
  })

  const proposals = proposalsQ.data?.proposals ?? []
  const counts =
    proposalsQ.data?.counts_by_status ?? {
      pending: 0,
      accepted: 0,
      rejected: 0,
      expired: 0,
    }
  const runs = runsQ.data?.runs ?? []

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Moon className="size-5 text-accent-porter" />
            Dreams
          </h1>
          <p className="text-sm text-text3 mt-0.5">
            {counts.pending} pending · {counts.accepted} accepted ·{" "}
            {counts.rejected} rejected · {counts.expired} expired
            <span className="ml-2 opacity-60">({silo} silo)</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              qc.invalidateQueries({ queryKey: ["admin", "dreams"] })
            }}
          >
            <RefreshCw className="size-3.5 mr-1" /> Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => runNow.mutate()}
            disabled={runNow.isPending}
          >
            <Play className="size-3.5 mr-1" />
            {runNow.isPending ? "Dispatching…" : "Run Now"}
          </Button>
        </div>
      </div>

      {/* ─── Filters ─────────────────────────────────────────────────────── */}
      <div className="flex gap-3 items-end">
        <div>
          <label
            className="text-2xs uppercase tracking-wider text-text3 block mb-1"
            htmlFor="silo-filter"
          >
            Silo
          </label>
          <Select value={silo} onValueChange={setSilo}>
            <SelectTrigger id="silo-filter" className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="software">software</SelectItem>
              <SelectItem value="software-smoke-48.4">
                software-smoke-48.4 (smoke)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label
            className="text-2xs uppercase tracking-wider text-text3 block mb-1"
            htmlFor="status-filter"
          >
            Status
          </label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="status-filter" className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ─── Proposals table ─────────────────────────────────────────────── */}
      {proposalsQ.isLoading ? (
        <div className="rounded-lg border border-border p-6 space-y-2">
          <div className="h-8 w-full animate-pulse rounded bg-raised" />
          <div className="h-8 w-full animate-pulse rounded bg-raised" />
          <div className="h-8 w-full animate-pulse rounded bg-raised" />
        </div>
      ) : proposalsQ.isError ? (
        <div className="rounded-lg border border-border p-6 text-sm text-red-400">
          Failed to load proposals:{" "}
          {String((proposalsQ.error as Error)?.message ?? "unknown")}
        </div>
      ) : proposals.length === 0 ? (
        <div className="rounded-lg border border-border p-12 text-center">
          <Moon className="size-10 mx-auto mb-3 text-text3/30" />
          <p className="text-sm text-text3">
            No proposals matching filters:{" "}
            <strong className="text-text2">{silo}</strong> /{" "}
            <strong className="text-text2">{status}</strong>.
          </p>
          <p className="text-2xs text-text3/60 mt-2">
            Try changing the silo or status filter, or click{" "}
            <strong>Run Now</strong> to trigger a fresh dream run.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface/50">
                  <th className="text-left font-medium text-text3 px-4 py-2.5 w-[110px]">
                    Kind
                  </th>
                  <th className="text-left font-medium text-text3 px-4 py-2.5 w-[200px]">
                    Target
                  </th>
                  <th className="text-left font-medium text-text3 px-4 py-2.5">
                    Content
                  </th>
                  <th className="text-left font-medium text-text3 px-4 py-2.5 w-[140px]">
                    Source
                  </th>
                  <th className="text-left font-medium text-text3 px-4 py-2.5 w-[100px]">
                    Created
                  </th>
                  <th className="text-left font-medium text-text3 px-4 py-2.5 w-[100px]">
                    Status
                  </th>
                  <th className="text-right font-medium text-text3 px-4 py-2.5 w-[40px]"></th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => setSelectedProposalId(p.id)}
                    className="border-b border-border/50 hover:bg-surface/30 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-2.5">
                      <ProposalKindBadge kind={p.proposal_kind} />
                    </td>
                    <td className="px-4 py-2.5 font-mono text-2xs text-text2">
                      {p.target_directive_ids.length === 0 ? (
                        <span className="text-text3">—</span>
                      ) : (
                        truncate(p.target_directive_ids.join(", "), 40)
                      )}
                    </td>
                    <td
                      className="px-4 py-2.5 text-foreground"
                      title={p.proposed_content}
                    >
                      {truncate(p.proposed_content, 100)}
                    </td>
                    <td className="px-4 py-2.5 text-2xs text-text3">
                      {String(
                        (p.proposed_metadata as Record<string, unknown>)
                          ?.conceptual_area ?? "—",
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-2xs text-text3 tabular-nums">
                      {fmtRel(p.created_at)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge
                        variant="outline"
                        className={`text-2xs ${
                          p.status === "pending"
                            ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/20"
                            : p.status === "accepted"
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
                            : p.status === "rejected"
                            ? "bg-red-500/15 text-red-400 border-red-500/20"
                            : "bg-zinc-500/15 text-zinc-400 border-zinc-500/20"
                        }`}
                      >
                        {p.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right text-text3">▸</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Recent runs (full sidebar) ──────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>Recent runs</span>
            {runFilter && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRunFilter(null)}
              >
                Clear run filter
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 pb-3">
          {runsQ.isLoading ? (
            <div className="h-12 w-full animate-pulse rounded bg-raised" />
          ) : runs.length === 0 ? (
            <p className="text-2xs text-text3">
              No runs yet for this silo. Click <strong>Run Now</strong> to
              dispatch one.
            </p>
          ) : (
            runs.slice(0, 20).map((r) => {
              const isFiltered = runFilter === r.id
              const dispatchId = (r as unknown as { dispatch_id?: string | null })
                .dispatch_id
              return (
                <div
                  key={r.id}
                  className={`flex items-center justify-between text-xs py-1 px-2 rounded transition-colors ${
                    isFiltered ? "bg-surface/60" : "hover:bg-surface/30"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <Badge
                      variant="outline"
                      className={`text-2xs ${
                        r.status === "completed"
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
                          : r.status === "failed"
                          ? "bg-red-500/15 text-red-400 border-red-500/20"
                          : "bg-yellow-500/15 text-yellow-400 border-yellow-500/20"
                      }`}
                    >
                      {r.status}
                    </Badge>
                    <span className="font-mono text-2xs text-text2 truncate">
                      {r.id}
                    </span>
                    <span className="text-2xs text-text3 truncate">
                      {r.model_used ?? "—"}
                    </span>
                    <span className="text-2xs text-text3">·</span>
                    <span className="text-2xs">
                      {r.proposals_count} proposals
                    </span>
                    <span className="text-2xs text-text3">·</span>
                    <span className="text-2xs">
                      {r.duration_ms
                        ? Math.round(r.duration_ms / 1000) + "s"
                        : "—"}
                    </span>
                    {dispatchId && (
                      <>
                        <span className="text-2xs text-text3">·</span>
                        <span
                          className="font-mono text-[10px] text-text3"
                          title={`dispatch_id=${dispatchId}`}
                        >
                          {String(dispatchId).slice(0, 12)}…
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-2xs text-text3 shrink-0">
                    <span className="tabular-nums">{fmtRel(r.started_at)}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setRunFilter(r.id)}
                    >
                      view
                    </Button>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {/* ─── Proposal detail drawer ──────────────────────────────────────── */}
      <ProposalDetailDrawer
        proposalId={selectedProposalId}
        proposals={proposals}
        onClose={() => setSelectedProposalId(null)}
      />
    </div>
  )
}
