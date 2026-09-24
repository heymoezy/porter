import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Check, X, CheckCircle2 } from "lucide-react"
import { StatusBadge } from "~/components/ui/status-badge"

interface ApprovalRequest {
  id: string
  task_description: string
  risk_category: string
  requesting_agent: string
  status: string
  created_at: number
}

function relativeTime(ts: number): string {
  const secs = Math.floor(Date.now() / 1000 - ts)
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

export function ApprovalsPanel() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ["approvals"],
    queryFn: () => api<{ approvals: ApprovalRequest[] }>("/api/v1/approvals"),
    refetchInterval: 10_000,
  })

  const approve = useMutation({
    mutationFn: (id: string) => api(`/api/v1/approvals/${id}/approve`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approvals"] }),
  })

  const reject = useMutation({
    mutationFn: (id: string) => api(`/api/v1/approvals/${id}/reject`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approvals"] }),
  })

  const approvals = data?.approvals ?? []
  const pending = approvals.filter((a) => a.status === "pending")

  return (
    <Card className="bg-[var(--surface,#222a38)] border-[var(--border,#3d4758)]">
      <CardHeader className="pb-0 pt-3">
        <CardTitle className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[var(--foreground,#f6f8fb)]">
          Approvals
          {pending.length > 0 && (
            <Badge variant="warning" className="px-1.5 py-0">{pending.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2 pb-3">
        {pending.length === 0 ? (
          <div className="flex items-center gap-2 py-4 justify-center text-[var(--text3,#8a95a8)]">
            <CheckCircle2 className="size-5 text-success" />
            <span className="text-xs">All clear</span>
          </div>
        ) : (
          <div className="space-y-2">
            {pending.slice(0, 5).map((a) => (
              <div key={a.id} className="rounded-md border border-[var(--border,#3d4758)] bg-[var(--bg,#171d28)] p-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-2xs text-[var(--foreground,#f6f8fb)] truncate">{a.task_description}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <StatusBadge status={a.risk_category} className="px-1.5 py-0" />
                      <span className="text-2xs text-[var(--text3,#8a95a8)]">{relativeTime(a.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => approve.mutate(a.id)}
                      className="text-success hover:bg-success/10"
                    >
                      <Check className="size-3" />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => reject.mutate(a.id)}
                      className="text-danger hover:bg-danger/10"
                    >
                      <X className="size-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
