import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Button } from "~/components/ui/button"
import { Shield, Check, X, RefreshCw } from "lucide-react"
import { StatusBadge } from "~/components/ui/status-badge"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "~/components/ui/table"

// ── Types ──────────────────────────────────────────────

interface ApprovalRequest {
  id: string
  task_description: string
  risk_category: string
  requesting_agent: string
  status: string
  created_at: string
  updated_at?: string
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

// ── Component ──────────────────────────────────────────

export default function ApprovalsPage() {
  const qc = useQueryClient()

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin", "approvals"],
    queryFn: () => api<{ approvals: ApprovalRequest[] }>("/api/v1/approvals"),
    refetchInterval: 10_000,
  })

  const approve = useMutation({
    mutationFn: (id: string) =>
      api(`/api/v1/approvals/${id}/approve`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "approvals"] }),
  })

  const reject = useMutation({
    mutationFn: (id: string) =>
      api(`/api/v1/approvals/${id}/reject`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "approvals"] }),
  })

  const approvals = data?.approvals ?? []
  const pendingCount = approvals.filter(a => a.status === "pending").length

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Shield className="size-5 text-accent-porter" />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">Approvals</h1>
          <p className="text-sm text-text3 mt-0.5">
            {pendingCount} pending approval{pendingCount !== 1 ? "s" : ""}
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
          <p className="text-sm text-danger">{(error as Error)?.message || "Failed to load approvals"}</p>
          <button onClick={() => refetch()} className="text-sm text-accent-porter hover:underline">
            Retry
          </button>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !isError && approvals.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <Shield className="size-8 text-text3/30 mb-2" />
          <p className="text-sm text-text3">No pending approvals</p>
          <p className="text-2xs text-text3/60 mt-1">Approval requests from agents will appear here</p>
        </div>
      )}

      {/* Table */}
      {!isLoading && !isError && approvals.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <Table size="sm">
              <TableHeader>
                <TableRow className="bg-surface/50">
                  <TableHead className="px-4 py-2.5">Task</TableHead>
                  <TableHead className="px-4 py-2.5">Risk</TableHead>
                  <TableHead className="px-4 py-2.5">Agent</TableHead>
                  <TableHead className="px-4 py-2.5">Created</TableHead>
                  <TableHead className="px-4 py-2.5">Status</TableHead>
                  <TableHead className="text-right px-4 py-2.5">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvals.map(a => {
                  const isPending = a.status === "pending"
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="px-4 py-2.5 text-foreground max-w-xs">
                        <span className="line-clamp-2">{a.task_description}</span>
                      </TableCell>
                      <TableCell className="px-4 py-2.5">
                        <StatusBadge status={a.risk_category} />
                      </TableCell>
                      <TableCell className="px-4 py-2.5 text-text3">{a.requesting_agent}</TableCell>
                      <TableCell className="px-4 py-2.5 text-text3 tabular-nums">{fmtRel(a.created_at)}</TableCell>
                      <TableCell className="px-4 py-2.5">
                        <StatusBadge status={a.status} />
                      </TableCell>
                      <TableCell className="px-4 py-2.5 text-right">
                        {isPending ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2.5 text-success hover:bg-success/10"
                              onClick={() => approve.mutate(a.id)}
                              disabled={approve.isPending || reject.isPending}
                            >
                              <Check className="size-3.5 mr-1" />
                              Approve
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2.5 text-danger hover:bg-danger/10"
                              onClick={() => reject.mutate(a.id)}
                              disabled={approve.isPending || reject.isPending}
                            >
                              <X className="size-3.5 mr-1" />
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-2xs text-text3">--</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}
