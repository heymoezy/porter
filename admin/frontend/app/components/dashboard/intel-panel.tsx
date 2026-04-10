import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Link } from "react-router"
import { api } from "~/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Brain, TrendingDown, TrendingUp, Minus, Activity,
  AlertTriangle, Check, X,
} from "lucide-react"

/**
 * Dashboard Intel Panel — surfaces Porter Intellect signals at the entry point.
 *
 * Replaces the old manual /api/admin/intelligence list. Now pulls from the
 * autonomous Intellect API: live correction trend, pending directive
 * candidates (with inline accept/dismiss), and workflow health roster.
 */

interface IntellectHealth {
  corrections: {
    daily: Array<{ day: string; count: number }>
    last7d: number
    prev7d: number
    trend: "improving" | "flat" | "rising" | "unknown"
  }
  validator: { autoFixed7d: number; stale7d: number; accuracyRatio: number }
  workflows: Array<{
    name: string
    enabled: boolean
    runCount: number
    lastRunAt: number | null
    failures7d: number
    health: "healthy" | "idle" | "failing" | "unknown"
  }>
  promotion: { candidates: number; promoted7d: number }
  episodes: { created7d: number; coverageRatio: number }
}

interface DirectiveCandidate {
  id: string
  scope: string
  scope_id: string | null
  content: string
  priority: number
  updated_at: number
}

function fmtRel(ts: number): string {
  const secs = Math.floor(Date.now() / 1000 - ts)
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

export function IntelPanel() {
  const qc = useQueryClient()

  const health = useQuery({
    queryKey: ["intellect", "health"],
    queryFn: () => api<IntellectHealth>("/api/v1/intellect/health"),
    refetchInterval: 30_000,
  })

  const candidates = useQuery({
    queryKey: ["intellect", "candidates"],
    queryFn: () =>
      api<{ candidates: DirectiveCandidate[]; count: number }>(
        "/api/v1/intellect/candidates",
      ),
    refetchInterval: 15_000,
  })

  const acceptCandidate = useMutation({
    mutationFn: (id: string) =>
      api(`/api/v1/intellect/candidates/${id}/accept`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["intellect"] }),
  })
  const rejectCandidate = useMutation({
    mutationFn: (id: string) =>
      api(`/api/v1/intellect/candidates/${id}/reject`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["intellect"] }),
  })

  const h = health.data
  const cs = candidates.data?.candidates ?? []
  const newCount = candidates.data?.count ?? 0
  const trend = h?.corrections.trend ?? "unknown"
  const TrendIcon = trend === "improving" ? TrendingDown : trend === "rising" ? TrendingUp : Minus
  const trendCls =
    trend === "improving" ? "text-green-400" : trend === "rising" ? "text-yellow-400" : "text-[var(--text3,#8a95a8)]"
  const failingWorkflows = (h?.workflows ?? []).filter((w) => w.health === "failing").length
  const healthyWorkflows = (h?.workflows ?? []).filter((w) => w.health === "healthy").length
  const totalWorkflows = (h?.workflows ?? []).length
  const maxDaily = Math.max(1, ...(h?.corrections.daily ?? []).map((d) => d.count))

  return (
    <Card className="bg-[var(--surface,#222a38)] border-[var(--border,#3d4758)]">
      <CardHeader className="pb-0 pt-3">
        <CardTitle className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[var(--foreground,#f6f8fb)]">
          <Brain className="size-3.5 text-[var(--accent-porter,#6366f1)]" />
          <Link to="/intelligence" className="hover:underline">
            Intellect
          </Link>
          {newCount > 0 && (
            <Badge className="bg-yellow-500/15 text-yellow-400 text-2xs px-1.5 py-0">
              {newCount} pending
            </Badge>
          )}
          {failingWorkflows > 0 && (
            <Badge className="bg-red-500/15 text-red-400 text-2xs px-1.5 py-0">
              {failingWorkflows} failing
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2 pb-3 space-y-2">
        {/* Trend + workflow health row */}
        <div className="flex items-center gap-2 text-2xs">
          <TrendIcon className={`size-3.5 ${trendCls}`} />
          <span className="text-[var(--text2,#c7cfdc)]">
            {h?.corrections.last7d ?? 0}
            <span className="text-[var(--text3,#8a95a8)]"> corrections /7d</span>
          </span>
          <span className="text-[var(--text3,#8a95a8)]">·</span>
          <Activity className="size-3 text-[var(--text3,#8a95a8)]" />
          <span className="text-[var(--text2,#c7cfdc)]">
            {healthyWorkflows}
            <span className="text-[var(--text3,#8a95a8)]">/{totalWorkflows} healthy</span>
          </span>
        </div>

        {/* 14-day correction sparkline */}
        {h && (
          <div className="flex items-end gap-0.5 h-6">
            {h.corrections.daily.map((d, i) => (
              <div
                key={d.day}
                className={`flex-1 rounded-sm ${i >= 7 ? "bg-[var(--accent-porter,#6366f1)]" : "bg-[var(--text3,#8a95a8)]/30"}`}
                style={{ height: `${Math.max(8, (d.count / maxDaily) * 100)}%` }}
                title={`${d.day}: ${d.count}`}
              />
            ))}
          </div>
        )}

        {/* Pending candidates (inline accept/reject) */}
        {cs.length === 0 ? (
          <div className="flex items-center gap-2 py-1 text-[var(--text3,#8a95a8)] text-2xs">
            <Check className="size-3 opacity-50" />
            No pending rules — Porter is steady
          </div>
        ) : (
          <div className="space-y-1">
            {cs.slice(0, 3).map((c) => (
              <div
                key={c.id}
                className="flex items-start gap-1.5 rounded-md py-1.5 px-2 hover:bg-[var(--raised,#2b3444)]/50 transition-colors"
              >
                <AlertTriangle className="size-3 mt-0.5 shrink-0 text-yellow-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-2xs text-[var(--foreground,#f6f8fb)] line-clamp-2">{c.content}</p>
                  <p className="text-2xs text-[var(--text3,#8a95a8)]">
                    p{c.priority} · {c.scope}
                    {c.scope_id ? `:${c.scope_id}` : ""} · {fmtRel(c.updated_at)}
                  </p>
                </div>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => acceptCandidate.mutate(c.id)}
                  className="text-[var(--text3,#8a95a8)] hover:text-green-400 hover:bg-green-500/10 shrink-0"
                  title="Accept candidate"
                >
                  <Check className="size-3" />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => rejectCandidate.mutate(c.id)}
                  className="text-[var(--text3,#8a95a8)] hover:text-red-400 hover:bg-red-500/10 shrink-0"
                  title="Dismiss candidate"
                >
                  <X className="size-3" />
                </Button>
              </div>
            ))}
            {cs.length > 3 && (
              <Link
                to="/intelligence"
                className="block text-2xs text-[var(--accent-porter,#6366f1)] hover:underline px-2 pt-1"
              >
                + {cs.length - 3} more in Intelligence →
              </Link>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
