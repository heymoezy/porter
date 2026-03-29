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
  Plus, Search, X, Clock, Archive,
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

  return (
    <div className="overflow-y-auto p-4 flex-1 space-y-3">
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
