import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Shield, Check, X, RefreshCw } from "lucide-react"

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

const RISK_BADGE: Record<string, { cls: string }> = {
  low:      { cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  medium:   { cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20" },
  high:     { cls: "bg-orange-500/15 text-orange-400 border-orange-500/20" },
  critical: { cls: "bg-red-500/15 text-red-400 border-red-500/20" },
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
          <p className="text-sm text-red-400">{(error as Error)?.message || "Failed to load approvals"}</p>
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
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface/50">
                  <th className="text-left font-medium text-text3 px-4 py-2.5">Task</th>
                  <th className="text-left font-medium text-text3 px-4 py-2.5">Risk</th>
                  <th className="text-left font-medium text-text3 px-4 py-2.5">Agent</th>
                  <th className="text-left font-medium text-text3 px-4 py-2.5">Created</th>
                  <th className="text-left font-medium text-text3 px-4 py-2.5">Status</th>
                  <th className="text-right font-medium text-text3 px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {approvals.map(a => {
                  const risk = RISK_BADGE[a.risk_category] ?? RISK_BADGE.medium
                  const isPending = a.status === "pending"
                  return (
                    <tr key={a.id} className="border-b border-border/50 hover:bg-surface/30 transition-colors">
                      <td className="px-4 py-2.5 text-foreground max-w-xs">
                        <span className="line-clamp-2">{a.task_description}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className={`text-2xs ${risk.cls}`}>
                          {a.risk_category}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-text3">{a.requesting_agent}</td>
                      <td className="px-4 py-2.5 text-text3 tabular-nums">{fmtRel(a.created_at)}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className={`text-2xs ${
                          a.status === "pending" ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/20"
                          : a.status === "approved" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
                          : "bg-red-500/15 text-red-400 border-red-500/20"
                        }`}>
                          {a.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {isPending ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                              onClick={() => approve.mutate(a.id)}
                              disabled={approve.isPending || reject.isPending}
                            >
                              <Check className="size-3.5 mr-1" />
                              Approve
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2.5 text-red-400 hover:text-red-300 hover:bg-red-500/10"
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
                      </td>
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
