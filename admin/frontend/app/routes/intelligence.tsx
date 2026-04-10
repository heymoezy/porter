import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Card, CardContent } from "~/components/ui/card"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "~/components/ui/dialog"
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "~/components/ui/select"
import {
  Lightbulb, AlertTriangle, Zap, Target, BookOpen,
  Plus, Search, X, Clock, Archive, Activity, FileCheck, FileX, RefreshCw, Brain,
  TrendingUp, TrendingDown, Minus, Sparkles, Heart, Trash2,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────

interface IntelEntry {
  id: string; source_agent: string; entry_type: string
  title: string; body: string; metadata: Record<string, unknown>
  status: string; created_at: number; updated_at: number
  reviewed_at: number | null; reviewed_by: string | null
}

interface IntelResponse {
  entries: IntelEntry[]
  counts: {
    total: number
    byStatus: Record<string, number>
    byType: Record<string, number>
    byAgent: Record<string, number>
  }
}

// ── Porter Intellect (autonomous system) types ─────────────────────────

interface IntellectEvent {
  id: string
  event_type: string
  source_type: string
  details_json: Record<string, unknown>
  created_at: number
}

interface IntellectStats {
  references: { total: string; valid: string; broken: string; stale: string }
  events24h: Array<{ event_type: string; count: string }>
  episodes: number
  candidates?: number
  activeDirectives?: number
  workflows?: { total: number; enabled: number }
}

interface DirectiveCandidate {
  id: string
  scope: string
  scope_id: string | null
  content: string
  priority: number
  source_session_id: string | null
  created_at: number
  updated_at: number
}

interface IntellectEpisode {
  id: string
  scope: string
  scope_id: string | null
  session_id: string
  gateway: string | null
  summary: string
  corrections_json: string[]
  files_changed_json: string[]
  duration_seconds: number
  created_at: number
}

interface IntellectHealth {
  generatedAt: number
  corrections: {
    daily: Array<{ day: string; count: number }>
    last7d: number
    prev7d: number
    trend: "improving" | "flat" | "rising" | "unknown"
  }
  memoryHitRate: {
    activeDirectives: number
    activeConcepts: number
    conceptsRecalledLast7d: number
    avgConceptUseCount: number
  }
  validator: { autoFixed7d: number; stale7d: number; accuracyRatio: number }
  workflows: Array<{
    name: string
    actionType: string
    enabled: boolean
    runCount: number
    lastRunAt: number | null
    lastRunAgoSeconds: number | null
    failures7d: number
    health: "healthy" | "idle" | "failing" | "unknown"
  }>
  promotion: {
    candidates: number
    promoted7d: number
    rejected7d: number
    archived7d: number
    velocity: number
  }
  episodes: { created7d: number; uniqueSessions7d: number; coverageRatio: number }
}

interface PatternMineResult {
  generatedAt: number
  themeClusters: Array<{
    theme: string[]
    scope: string
    scopeId: string | null
    members: Array<{ id: string; preview: string; priority: number }>
  }>
  projectTopics: Array<{
    project: string
    directiveCount: number
    topTokens: Array<{ token: string; count: number }>
  }>
  toolAffinity: Array<{
    project: string
    episodes: number
    topTools: Array<{ tool: string; uses: number }>
  }>
  totals: { directivesScanned: number; episodesScanned: number; clustersFound: number }
}

// ── Constants ──────────────────────────────────────────

const TYPE_CONFIG: Record<string, { icon: typeof Lightbulb; color: string; label: string }> = {
  capability: { icon: Zap, color: "bg-accent-porter/15 text-accent-porter", label: "Capability" },
  blocker: { icon: AlertTriangle, color: "bg-danger/15 text-danger", label: "Blocker" },
  idea: { icon: Lightbulb, color: "bg-chart-2/15 text-chart-2", label: "Idea" },
  gap: { icon: Target, color: "bg-warning/15 text-warning", label: "Gap" },
  learning: { icon: BookOpen, color: "bg-success/15 text-success", label: "Learning" },
}

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  new: { color: "bg-accent-porter/15 text-accent-porter", label: "New" },
  reviewed: { color: "bg-raised text-text2", label: "Reviewed" },
  acted: { color: "bg-success/15 text-success", label: "Acted" },
  dismissed: { color: "bg-text3/15 text-text3", label: "Dismissed" },
}

function fmtRel(ts: number) {
  const d = Date.now() / 1000 - ts
  if (d < 60) return "just now"
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}

// ── Page ───────────────────────────────────────────────

export default function IntelligencePage() {
  const qc = useQueryClient()
  const [typeFilter, setTypeFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Form state
  const [formType, setFormType] = useState("idea")
  const [formTitle, setFormTitle] = useState("")
  const [formBody, setFormBody] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "intelligence", typeFilter, statusFilter, search],
    queryFn: () => {
      const params = new URLSearchParams()
      if (typeFilter) params.set("type", typeFilter)
      if (statusFilter) params.set("status", statusFilter)
      if (search) params.set("search", search)
      return api<IntelResponse>(`/api/admin/intelligence?${params}`)
    },
  })

  // ── Porter Intellect (autonomous) ────────────────────────────────────
  const intellectStats = useQuery({
    queryKey: ["intellect", "stats"],
    queryFn: () => api<IntellectStats>("/api/v1/intellect/stats"),
    refetchInterval: 10_000,
  })

  const intellectEvents = useQuery({
    queryKey: ["intellect", "events"],
    queryFn: () => api<{ events: IntellectEvent[]; count: number }>("/api/v1/intellect/events?limit=20"),
    refetchInterval: 5_000,
  })

  const validateNow = useMutation({
    mutationFn: () => api("/api/v1/intellect/validate", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intellect"] })
    },
  })

  const intellectCandidates = useQuery({
    queryKey: ["intellect", "candidates"],
    queryFn: () => api<{ candidates: DirectiveCandidate[]; count: number }>("/api/v1/intellect/candidates"),
    refetchInterval: 15_000,
  })

  const intellectEpisodes = useQuery({
    queryKey: ["intellect", "episodes"],
    queryFn: () => api<{ episodes: IntellectEpisode[]; count: number }>("/api/v1/intellect/episodes?limit=10"),
    refetchInterval: 15_000,
  })

  const acceptCandidate = useMutation({
    mutationFn: (id: string) => api(`/api/v1/intellect/candidates/${id}/accept`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["intellect"] }),
  })
  const rejectCandidate = useMutation({
    mutationFn: (id: string) => api(`/api/v1/intellect/candidates/${id}/reject`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["intellect"] }),
  })
  const promoteNow = useMutation({
    mutationFn: () => api("/api/v1/intellect/promote", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["intellect"] }),
  })

  const intellectHealth = useQuery({
    queryKey: ["intellect", "health"],
    queryFn: () => api<IntellectHealth>("/api/v1/intellect/health"),
    refetchInterval: 30_000,
  })

  const intellectPatterns = useQuery({
    queryKey: ["intellect", "patterns"],
    queryFn: () => api<PatternMineResult>("/api/v1/intellect/patterns"),
    refetchInterval: 60_000,
  })

  const pruneNow = useMutation({
    mutationFn: () => api("/api/v1/intellect/prune", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["intellect"] }),
  })

  const createEntry = useMutation({
    mutationFn: (d: { entry_type: string; title: string; body: string }) =>
      api("/api/admin/intelligence", { method: "POST", json: d }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "intelligence"] })
      setCreateOpen(false); setFormTitle(""); setFormBody("")
    },
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/api/admin/intelligence/${id}/status`, { method: "PUT", json: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "intelligence"] }),
  })

  const deleteEntry = useMutation({
    mutationFn: (id: string) => api(`/api/admin/intelligence/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "intelligence"] }),
  })

  const entries = data?.entries ?? []
  const counts = data?.counts ?? { total: 0, byStatus: {}, byType: {}, byAgent: {} }

  const istats = intellectStats.data
  const ievents = intellectEvents.data?.events ?? []
  const icandidates = intellectCandidates.data?.candidates ?? []
  const iepisodes = intellectEpisodes.data?.episodes ?? []
  const ihealth = intellectHealth.data
  const ipatterns = intellectPatterns.data

  function describeIntellectEvent(ev: IntellectEvent): string {
    const d = ev.details_json as Record<string, any>
    switch (ev.event_type) {
      case "memory_stale":
        return `Memory stale: ${d.filePath || d.action || "reference broken"}`
      case "memory_auto_fixed":
        return `Auto-fixed: ${d.oldPath?.split('/').pop() || ''} → ${d.newPath?.split('/').pop() || 'new path'}`
      case "validation_sweep":
        return `Validation sweep: ${d.valid || 0} valid, ${d.broken || 0} broken, ${d.fixed || 0} fixed, ${d.newReferences || 0} new`
      case "correction_detected":
        return `Correction captured: ${String(d.rule || d.content || "").substring(0, 90)}`
      case "correction_reinforced":
        return `Correction reinforced (×): ${(d.similarity ? Math.round(Number(d.similarity) * 100) + "% match" : "")}`
      case "directive_promoted":
        return `Directive promoted → active: ${String(d.content || "").substring(0, 80)}`
      case "directive_archived":
        return `Candidate archived: ${String(d.content || "").substring(0, 80)}`
      case "episode_created":
        return `Episode stored (${d.dispatchCount || 0} dispatches${d.corrections ? `, ${d.corrections} corrections` : ""})`
      case "dispatch_scored":
        return `Dispatches scored: +${d.positive || 0} / −${d.negative || 0} / =${d.neutral || 0}`
      case "workflow_ran":
        return `Workflow: ${d.name || d.actionType || "ran"} (${d.durationMs || 0}ms)`
      case "workflow_failed":
        return `Workflow failed: ${d.name || d.actionType}${d.error ? " — " + d.error : ""}`
      case "directive_created":
        return `New directive: ${String(d.content || "").substring(0, 80)}`
      case "memory_pruned":
        return `Pruned: ${d.action || d.reason || "stale"}${d.count ? ` (${d.count})` : ""}${d.preview ? " — " + d.preview : ""}`
      case "pruner_swept":
        return `Pruner swept: ${d.conceptsArchived || 0} concepts, ${d.directivesDeduped || 0} dedupes, ${d.episodesCompacted || 0} episodes compacted`
      case "self_monitor_snapshot":
        return `Self-monitor: trend=${d.correctionTrend || "?"}, validator=${(Number(d.validatorAccuracy || 0) * 100).toFixed(0)}%, coverage=${(Number(d.episodeCoverage || 0) * 100).toFixed(0)}%`
      case "patterns_mined":
        return `Patterns mined: ${d.clustersFound || 0} clusters from ${d.directivesScanned || 0} directives`
      default:
        return ev.event_type.replace(/_/g, " ")
    }
  }

  function eventIcon(eventType: string) {
    switch (eventType) {
      case "memory_stale": return FileX
      case "memory_auto_fixed": return FileCheck
      case "validation_sweep": return Activity
      case "correction_detected": return AlertTriangle
      case "correction_reinforced": return AlertTriangle
      case "directive_promoted": return Zap
      case "directive_archived": return FileX
      case "episode_created": return BookOpen
      case "dispatch_scored": return Target
      case "workflow_ran": return Activity
      case "workflow_failed": return AlertTriangle
      case "directive_created": return Zap
      case "memory_pruned": return Trash2
      case "pruner_swept": return Trash2
      case "self_monitor_snapshot": return Heart
      case "patterns_mined": return Sparkles
      default: return Brain
    }
  }

  function eventColor(eventType: string): string {
    switch (eventType) {
      case "memory_stale": return "text-warning"
      case "memory_auto_fixed": return "text-success"
      case "validation_sweep": return "text-accent-porter"
      case "correction_detected": return "text-warning"
      case "correction_reinforced": return "text-warning"
      case "directive_promoted": return "text-success"
      case "directive_archived": return "text-text3"
      case "episode_created": return "text-chart-2"
      case "dispatch_scored": return "text-accent-porter"
      case "workflow_ran": return "text-accent-porter"
      case "workflow_failed": return "text-danger"
      case "directive_created": return "text-accent-porter"
      case "memory_pruned": return "text-text3"
      case "pruner_swept": return "text-chart-2"
      case "self_monitor_snapshot": return "text-success"
      case "patterns_mined": return "text-chart-2"
      default: return "text-text3"
    }
  }

  function trendIcon(trend: string) {
    if (trend === "improving") return TrendingDown
    if (trend === "rising") return TrendingUp
    return Minus
  }
  function trendColor(trend: string): string {
    if (trend === "improving") return "text-success"
    if (trend === "rising") return "text-warning"
    return "text-text3"
  }

  return (
    <div className="overflow-y-auto p-4 flex-1 space-y-4">
      {/* ── Porter Intellect (autonomous system) ─────────────────── */}
      <div className="rounded-lg border border-accent-porter/20 bg-accent-porter/[0.03] p-4">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="size-4 text-accent-porter" />
          <span className="text-sm font-bold text-foreground">Porter Intellect</span>
          <span className="text-2xs text-text3">autonomous memory validation + learning</span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-7 text-2xs gap-1"
            onClick={() => validateNow.mutate()}
            disabled={validateNow.isPending}
          >
            <RefreshCw className={`size-3 ${validateNow.isPending ? "animate-spin" : ""}`} />
            Run validation
          </Button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-6 gap-2 mb-4">
          <div className="rounded-md bg-surface border border-border/50 px-3 py-2">
            <p className="text-2xs text-text3">Refs</p>
            <p className="text-lg font-bold text-foreground tabular-nums">{istats?.references.total ?? "—"}</p>
          </div>
          <div className="rounded-md bg-surface border border-border/50 px-3 py-2">
            <p className="text-2xs text-text3">Valid</p>
            <p className="text-lg font-bold text-success tabular-nums">{istats?.references.valid ?? "—"}</p>
          </div>
          <div className="rounded-md bg-surface border border-border/50 px-3 py-2">
            <p className="text-2xs text-text3">Broken</p>
            <p className={`text-lg font-bold tabular-nums ${(parseInt(istats?.references.broken ?? "0", 10) > 0) ? "text-danger" : "text-text3"}`}>
              {istats?.references.broken ?? "—"}
            </p>
          </div>
          <div className="rounded-md bg-surface border border-border/50 px-3 py-2">
            <p className="text-2xs text-text3">Directives</p>
            <p className="text-lg font-bold text-foreground tabular-nums">{istats?.activeDirectives ?? "—"}</p>
          </div>
          <div className="rounded-md bg-surface border border-border/50 px-3 py-2">
            <p className="text-2xs text-text3">Candidates</p>
            <p className={`text-lg font-bold tabular-nums ${(istats?.candidates ?? 0) > 0 ? "text-warning" : "text-text3"}`}>
              {istats?.candidates ?? "—"}
            </p>
          </div>
          <div className="rounded-md bg-surface border border-border/50 px-3 py-2">
            <p className="text-2xs text-text3">Episodes</p>
            <p className="text-lg font-bold text-foreground tabular-nums">{istats?.episodes ?? "—"}</p>
          </div>
        </div>

        {/* Directive candidates (pending corrections) */}
        {icandidates.length > 0 && (
          <div className="mb-4 rounded-md border border-warning/20 bg-warning/[0.04] p-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="size-3 text-warning" />
              <span className="text-2xs font-semibold uppercase tracking-wide text-warning">Directive candidates</span>
              <span className="text-2xs text-text3">{icandidates.length} pending</span>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto h-6 text-2xs"
                onClick={() => promoteNow.mutate()}
                disabled={promoteNow.isPending}
              >
                Run promoter
              </Button>
            </div>
            <div className="space-y-1 max-h-[180px] overflow-y-auto">
              {icandidates.map(c => (
                <div key={c.id} className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-raised/50 text-xs">
                  <span className="rounded bg-raised text-2xs px-1.5 py-0.5 shrink-0 text-text2 tabular-nums">p{c.priority}</span>
                  <span className="rounded bg-raised text-2xs px-1.5 py-0.5 shrink-0 text-text3">{c.scope}{c.scope_id ? `:${c.scope_id}` : ""}</span>
                  <span className="text-text2 flex-1 min-w-0 break-words">{c.content}</span>
                  <span className="text-2xs text-text3 shrink-0">{fmtRel(c.updated_at)}</span>
                  <Button
                    size="sm" variant="outline"
                    className="h-6 text-2xs px-2 shrink-0"
                    onClick={() => acceptCandidate.mutate(c.id)}
                    disabled={acceptCandidate.isPending}
                  >Accept</Button>
                  <Button
                    size="sm" variant="outline"
                    className="h-6 text-2xs px-2 shrink-0 text-text3"
                    onClick={() => rejectCandidate.mutate(c.id)}
                    disabled={rejectCandidate.isPending}
                  >Dismiss</Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent episodes */}
        {iepisodes.length > 0 && (
          <div className="mb-4 rounded-md border border-border/50 bg-surface p-3">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="size-3 text-chart-2" />
              <span className="text-2xs font-semibold uppercase tracking-wide text-text3">Recent episodes</span>
            </div>
            <div className="space-y-1 max-h-[180px] overflow-y-auto">
              {iepisodes.map(ep => (
                <div key={ep.id} className="flex items-start gap-2 px-2 py-1 text-xs">
                  <span className="rounded bg-raised text-2xs px-1.5 py-0.5 shrink-0 text-text3">
                    {ep.scope_id ?? ep.scope}
                  </span>
                  <span className="text-text2 flex-1 min-w-0">{ep.summary}</span>
                  <span className="text-2xs text-text3 shrink-0">{fmtRel(ep.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Self-Monitor (Phase 3) ─────────────────────────── */}
        {ihealth && (() => {
          const TrendIcon = trendIcon(ihealth.corrections.trend)
          const trendCls = trendColor(ihealth.corrections.trend)
          const maxDaily = Math.max(1, ...ihealth.corrections.daily.map(d => d.count))
          return (
            <div className="mb-4 rounded-md border border-success/20 bg-success/[0.04] p-3">
              <div className="flex items-center gap-2 mb-3">
                <Heart className="size-3 text-success" />
                <span className="text-2xs font-semibold uppercase tracking-wide text-success">Self-monitor</span>
                <span className="text-2xs text-text3">Porter watching Porter</span>
                <Button
                  size="sm" variant="outline" className="ml-auto h-6 text-2xs"
                  onClick={() => pruneNow.mutate()} disabled={pruneNow.isPending}
                >
                  <Trash2 className="size-3 mr-1" />
                  Run pruner
                </Button>
              </div>

              {/* Health metric cards */}
              <div className="grid grid-cols-4 gap-2 mb-3">
                <div className="rounded-md bg-surface border border-border/50 px-3 py-2">
                  <p className="text-2xs text-text3 flex items-center gap-1">
                    <TrendIcon className={`size-3 ${trendCls}`} />
                    Corrections trend
                  </p>
                  <p className={`text-base font-bold tabular-nums ${trendCls}`}>
                    {ihealth.corrections.last7d}
                    <span className="text-2xs text-text3 ml-1">vs {ihealth.corrections.prev7d}</span>
                  </p>
                </div>
                <div className="rounded-md bg-surface border border-border/50 px-3 py-2">
                  <p className="text-2xs text-text3">Validator accuracy</p>
                  <p className="text-base font-bold tabular-nums text-foreground">
                    {(ihealth.validator.accuracyRatio * 100).toFixed(0)}%
                    <span className="text-2xs text-text3 ml-1">{ihealth.validator.autoFixed7d}/{ihealth.validator.autoFixed7d + ihealth.validator.stale7d}</span>
                  </p>
                </div>
                <div className="rounded-md bg-surface border border-border/50 px-3 py-2">
                  <p className="text-2xs text-text3">Episode coverage</p>
                  <p className="text-base font-bold tabular-nums text-foreground">
                    {(ihealth.episodes.coverageRatio * 100).toFixed(0)}%
                    <span className="text-2xs text-text3 ml-1">{ihealth.episodes.created7d}/{ihealth.episodes.uniqueSessions7d}</span>
                  </p>
                </div>
                <div className="rounded-md bg-surface border border-border/50 px-3 py-2">
                  <p className="text-2xs text-text3">Promotion velocity</p>
                  <p className="text-base font-bold tabular-nums text-foreground">
                    {(ihealth.promotion.velocity * 100).toFixed(0)}%
                    <span className="text-2xs text-text3 ml-1">+{ihealth.promotion.promoted7d} −{ihealth.promotion.archived7d}</span>
                  </p>
                </div>
              </div>

              {/* Daily corrections sparkline (14d) */}
              <div className="mb-3">
                <p className="text-2xs text-text3 mb-1">Corrections per day (last 14)</p>
                <div className="flex items-end gap-0.5 h-10">
                  {ihealth.corrections.daily.map((d, i) => (
                    <div
                      key={d.day}
                      className={`flex-1 rounded-sm ${i >= 7 ? "bg-accent-porter" : "bg-text3/30"}`}
                      style={{ height: `${Math.max(3, (d.count / maxDaily) * 100)}%` }}
                      title={`${d.day}: ${d.count}`}
                    />
                  ))}
                </div>
              </div>

              {/* Workflow health roster */}
              <div className="space-y-0.5 max-h-[180px] overflow-y-auto">
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="size-3 text-text3" />
                  <span className="text-2xs font-semibold uppercase tracking-wide text-text3">Workflows</span>
                </div>
                {ihealth.workflows.map(w => {
                  const dot =
                    w.health === "healthy" ? "bg-success" :
                    w.health === "failing" ? "bg-danger" :
                    w.health === "idle" ? "bg-text3/40" : "bg-text3/40"
                  return (
                    <div key={w.name} className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-raised/50 rounded">
                      <span className={`size-2 rounded-full ${dot}`} />
                      <span className="text-text2 flex-1 truncate">{w.name}</span>
                      <span className="text-2xs text-text3 tabular-nums">×{w.runCount}</span>
                      {w.failures7d > 0 && <span className="text-2xs text-danger">{w.failures7d} fail</span>}
                      <span className="text-2xs text-text3 shrink-0">
                        {w.lastRunAt ? fmtRel(w.lastRunAt) : "never"}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* ── Pattern clusters (Phase 3) ─────────────────────── */}
        {ipatterns && ipatterns.themeClusters.length > 0 && (
          <div className="mb-4 rounded-md border border-chart-2/20 bg-chart-2/[0.04] p-3">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="size-3 text-chart-2" />
              <span className="text-2xs font-semibold uppercase tracking-wide text-chart-2">Theme clusters</span>
              <span className="text-2xs text-text3">{ipatterns.themeClusters.length} found across {ipatterns.totals.directivesScanned} directives</span>
            </div>
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {ipatterns.themeClusters.map((c, idx) => (
                <div key={idx} className="rounded bg-surface border border-border/50 p-2">
                  <div className="flex items-center gap-1 mb-1">
                    {c.theme.map(t => (
                      <span key={t} className="rounded bg-chart-2/15 text-chart-2 text-2xs px-1.5 py-0.5">{t}</span>
                    ))}
                    <span className="text-2xs text-text3 ml-auto">
                      {c.scope}{c.scopeId ? `:${c.scopeId}` : ""} · {c.members.length} members
                    </span>
                  </div>
                  <ul className="space-y-0.5">
                    {c.members.slice(0, 3).map(m => (
                      <li key={m.id} className="text-2xs text-text2 truncate">• {m.preview}</li>
                    ))}
                    {c.members.length > 3 && (
                      <li className="text-2xs text-text3">+ {c.members.length - 3} more</li>
                    )}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Project topics (compact) */}
        {ipatterns && ipatterns.projectTopics.length > 0 && (
          <div className="mb-4 rounded-md border border-border/50 bg-surface p-3">
            <div className="flex items-center gap-2 mb-2">
              <Target className="size-3 text-text3" />
              <span className="text-2xs font-semibold uppercase tracking-wide text-text3">Project topics</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {ipatterns.projectTopics.map(p => (
                <div key={p.project} className="rounded bg-raised border border-border/50 px-2 py-1 text-2xs">
                  <span className="font-semibold text-text2">{p.project}</span>
                  <span className="text-text3"> · {p.directiveCount} directives · </span>
                  <span className="text-text2">{p.topTokens.slice(0, 4).map(t => t.token).join(", ")}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Event stream */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="size-3 text-text3" />
            <span className="text-2xs font-semibold uppercase tracking-wide text-text3">Recent decisions</span>
            {intellectEvents.isFetching && <div className="size-2 animate-pulse rounded-full bg-accent-porter" />}
          </div>
          {ievents.length === 0 ? (
            <p className="text-xs text-text3 px-2 py-4">No Intellect events yet. File changes and memory updates will appear here.</p>
          ) : (
            <div className="space-y-0.5 max-h-[240px] overflow-y-auto">
              {ievents.map(ev => {
                const Icon = eventIcon(ev.event_type)
                const color = eventColor(ev.event_type)
                return (
                  <div key={ev.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-raised/50 transition-colors text-xs">
                    <Icon className={`size-3 shrink-0 ${color}`} />
                    <span className="text-text2 flex-1 truncate">{describeIntellectEvent(ev)}</span>
                    <span className="text-2xs text-text3 shrink-0">{fmtRel(ev.created_at)}</span>
                    <span className="text-2xs text-text3/60 shrink-0">{ev.source_type}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Intelligence Feed (agent submissions) ────────────────── */}
      {/* Header */}
      <div className="flex items-center gap-3">
        <Lightbulb className="size-4 text-accent-porter" />
        <span className="text-sm font-bold text-foreground">Intelligence Feed</span>
        <span className="text-2xs text-text3">{counts.total} entries</span>
        <div className="ml-auto">
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5 text-xs">
            <Plus className="size-3" /> Add Feature Idea
          </Button>
        </div>
      </div>

      {/* Status chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => setStatusFilter("")}
          className={`rounded-md px-2 py-1 text-2xs font-medium transition-colors ${!statusFilter ? "bg-accent-porter/15 text-accent-porter" : "text-text3 hover:text-text2 hover:bg-raised"}`}
        >All ({counts.total})</button>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setStatusFilter(statusFilter === key ? "" : key)}
            className={`rounded-md px-2 py-1 text-2xs font-medium transition-colors ${statusFilter === key ? cfg.color : "text-text3 hover:text-text2 hover:bg-raised"}`}
          >{cfg.label} ({counts.byStatus[key] || 0})</button>
        ))}
      </div>

      {/* Type + search filters */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {Object.entries(TYPE_CONFIG).map(([key, cfg]) => {
            const Icon = cfg.icon
            return (
              <button
                key={key}
                onClick={() => setTypeFilter(typeFilter === key ? "" : key)}
                className={`rounded-md px-2 py-1 text-2xs font-medium transition-colors flex items-center gap-1 ${typeFilter === key ? cfg.color : "text-text3 hover:text-text2 hover:bg-raised"}`}
              >
                <Icon className="size-2.5" /> {cfg.label}
              </button>
            )
          })}
        </div>
        <div className="relative ml-auto">
          <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-text3" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="h-7 w-[180px] bg-raised border-border pl-7 text-xs"
          />
        </div>
      </div>

      {/* Entries */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 text-xs text-text3">
          {search || typeFilter || statusFilter ? "No entries match filters" : "No intelligence entries yet. Agents will contribute as they work."}
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map(entry => {
            const tc = TYPE_CONFIG[entry.entry_type] || TYPE_CONFIG.idea
            const sc = STATUS_CONFIG[entry.status] || STATUS_CONFIG.new
            const TypeIcon = tc.icon
            const expanded = expandedId === entry.id
            const tags = (entry.metadata?.tags as string[]) || []

            return (
              <Card key={entry.id} className="overflow-hidden">
                <button
                  onClick={() => setExpandedId(expanded ? null : entry.id)}
                  className="w-full text-left px-4 py-3 hover:bg-raised/30 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <TypeIcon className={`size-4 shrink-0 mt-0.5 ${tc.color.split(" ")[1]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-foreground truncate">{entry.title}</p>
                        <Badge className={`text-2xs border-0 shrink-0 ${tc.color}`}>{tc.label}</Badge>
                        <Badge className={`text-2xs border-0 shrink-0 ${sc.color}`}>{sc.label}</Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-2xs text-text3">
                        <span>{entry.source_agent}</span>
                        <span>·</span>
                        <span>{fmtRel(entry.created_at)}</span>
                        {entry.reviewed_by && <><span>·</span><span>reviewed by {entry.reviewed_by}</span></>}
                      </div>
                      {tags.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {tags.map(t => <span key={t} className="rounded bg-raised px-1.5 py-0.5 text-2xs text-text3">{t}</span>)}
                        </div>
                      )}
                    </div>
                    <span className="text-2xs text-text3 shrink-0 flex items-center gap-1">
                      <Clock className="size-2.5" />
                      {fmtRel(entry.created_at)}
                    </span>
                  </div>
                </button>

                {/* Expanded view */}
                {expanded && (
                  <div className="border-t border-border/30 px-4 py-3 space-y-3">
                    <p className="text-xs text-text2 whitespace-pre-wrap leading-relaxed">{entry.body}</p>
                    {/* Metadata display */}
                    {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {(entry.metadata.risk_level as string) && (
                          <Badge className={`text-2xs border-0 ${
                            entry.metadata.risk_level === "high" ? "bg-danger/15 text-danger" :
                            entry.metadata.risk_level === "medium" ? "bg-warning/15 text-warning" :
                            "bg-success/15 text-success"
                          }`}>risk: {entry.metadata.risk_level as string}</Badge>
                        )}
                        {(entry.metadata.gateway_type as string) && (
                          <Badge className="text-2xs bg-raised text-text3 border-0">{entry.metadata.gateway_type as string}</Badge>
                        )}
                        {(entry.metadata.initiated_by as string) && (
                          <Badge className="text-2xs bg-raised text-text3 border-0">by {entry.metadata.initiated_by as string}</Badge>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      {entry.status !== "dismissed" && (
                        <Button size="xs" variant="outline" onClick={() => updateStatus.mutate({ id: entry.id, status: "dismissed" })} className="gap-1 text-2xs text-text3">
                          <Archive className="size-2.5" /> Dismiss
                        </Button>
                      )}
                      <div className="flex-1" />
                      <Button size="xs" variant="ghost" onClick={() => deleteEntry.mutate(entry.id)} className="text-2xs text-danger hover:text-danger">
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Feature Idea</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={formType} onValueChange={setFormType}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={formTitle}
              onChange={e => setFormTitle(e.target.value)}
              placeholder="What should Porter do?"
              className="h-8 text-xs"
            />
            <textarea
              value={formBody}
              onChange={e => setFormBody(e.target.value)}
              placeholder="Describe the feature, idea, or problem. Porter will break it down into actionable items."
              className="w-full h-24 rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-text3 focus:outline-none focus:ring-1 focus:ring-accent-porter resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={() => createEntry.mutate({ entry_type: formType, title: formTitle, body: formBody })}
              disabled={!formTitle.trim() || !formBody.trim() || createEntry.isPending}>
              {createEntry.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
