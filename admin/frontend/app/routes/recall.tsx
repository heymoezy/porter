import { useState, useEffect } from "react"
import { AgentPresence } from "~/components/agent-presence"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import {
  Brain, Search, Filter, ChevronDown, ChevronRight,
  Lightbulb, BookOpen, Clock, Zap, Shield,
  RefreshCw, Archive, Star, Eye,
} from "lucide-react"
import { getAgentsByTeam } from "~/lib/agent-registry"

// ── Types ──────────────────────────────────────────────

interface Concept {
  id: string
  memory_kind: string      // "concept" | "directive" | "episode" | "signal"
  trust_tier: string       // "high" | "medium" | "low"
  scope: string            // "global" | "agent" | "project" | "session"
  scope_id?: string
  content: string
  source_type?: string
  confidence_score?: number
  status: string           // "active" | "archived" | "superseded"
  review_state?: string    // "accepted" | "pending" | "rejected"
  last_used_at?: number
  use_count: number
  created_at: string
  updated_at: string
}

// ── Config ─────────────────────────────────────────────

const KIND_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string; bg: string }> = {
  directive: { icon: Shield, label: "Directive", color: "text-danger", bg: "bg-danger/10" },
  concept:   { icon: Lightbulb, label: "Concept", color: "text-accent-porter", bg: "bg-accent-porter/10" },
  episode:   { icon: BookOpen, label: "Episode", color: "text-warning", bg: "bg-warning/10" },
  signal:    { icon: Zap, label: "Signal", color: "text-text3", bg: "bg-text3/10" },
}

const TRUST_CONFIG: Record<string, { label: string; color: string }> = {
  high:   { label: "High Trust", color: "text-success" },
  medium: { label: "Medium", color: "text-warning" },
  low:    { label: "Low", color: "text-text3" },
}

// ── Helpers ────────────────────────────────────────────

function fmtRel(ts: string | number) {
  const epoch = typeof ts === "string" ? new Date(ts).getTime() / 1000 : ts
  const d = Date.now() / 1000 - epoch
  if (d < 60) return "just now"
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  if (d < 604800) return `${Math.floor(d / 86400)}d ago`
  return new Date(epoch * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

// ── Concept Card ───────────────────────────────────────

function ConceptCard({ concept }: { concept: Concept }) {
  const [expanded, setExpanded] = useState(false)
  const kind = KIND_CONFIG[concept.memory_kind] ?? KIND_CONFIG.concept
  const trust = TRUST_CONFIG[concept.trust_tier] ?? TRUST_CONFIG.low
  const Icon = kind.icon

  return (
    <div
      className="rounded-lg border border-border/60 bg-card px-3 py-2.5 cursor-pointer hover:border-accent-porter/30 transition-all"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-2">
        <div className={`flex size-6 items-center justify-center rounded-md ${kind.bg}`}>
          <Icon className={`size-3 ${kind.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-text line-clamp-1">{concept.content}</p>
        </div>
        <Badge className={`text-2xs border-0 ${kind.bg} ${kind.color} shrink-0`}>{kind.label}</Badge>
        <span className={`text-2xs font-mono ${trust.color} shrink-0`}>{concept.trust_tier}</span>
        {concept.use_count > 0 && (
          <span className="flex items-center gap-0.5 text-2xs text-text3 shrink-0">
            <Eye className="size-2.5" />{concept.use_count}
          </span>
        )}
        <span className="text-2xs text-text3 shrink-0">{fmtRel(concept.created_at)}</span>
        {expanded ? <ChevronDown className="size-3 text-text3" /> : <ChevronRight className="size-3 text-text3" />}
      </div>
      {expanded && (
        <div className="mt-2 pl-8 space-y-1.5">
          <p className="text-2xs text-text2 whitespace-pre-wrap leading-relaxed">{concept.content}</p>
          <div className="flex flex-wrap gap-2 text-2xs text-text3">
            <span>Scope: <strong className="text-text2">{concept.scope}</strong>{concept.scope_id ? ` (${concept.scope_id})` : ""}</span>
            <span>Status: <strong className={concept.status === "active" ? "text-success" : "text-text3"}>{concept.status}</strong></span>
            {concept.review_state && <span>Review: <strong className="text-text2">{concept.review_state}</strong></span>}
            {concept.source_type && <span>Source: <strong className="text-text2">{concept.source_type}</strong></span>}
            {concept.confidence_score != null && <span>Confidence: <strong className="text-text2">{concept.confidence_score}/100</strong></span>}
            {concept.last_used_at && <span>Last used: <strong className="text-text2">{fmtRel(concept.last_used_at)}</strong></span>}
            <span>Updated: <strong className="text-text2">{fmtRel(concept.updated_at)}</strong></span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────

function RecallContent() {
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [kindFilter, setKindFilter] = useState<string>("all")
  const [scopeFilter, setScopeFilter] = useState<string>("all")

  // Debounce search to avoid API call per keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const concepts = useQuery({
    queryKey: ["recall", "concepts", kindFilter, scopeFilter, debouncedSearch],
    queryFn: () => {
      const params = new URLSearchParams()
      if (kindFilter !== "all") params.set("kind", kindFilter)
      if (scopeFilter !== "all") params.set("scope", scopeFilter)
      if (search) params.set("q", search)
      params.set("limit", "100")
      return api<{ concepts: Concept[]; count: number }>(`/api/v1/memory/concepts?${params}`).catch(() => ({ concepts: [], count: 0 }))
    },
    
  })

  const memoryAgents = getAgentsByTeam("memory")
  const items = concepts.data?.concepts ?? []
  const total = concepts.data?.count ?? 0

  // Count by kind
  const kindCounts: Record<string, number> = { directive: 0, concept: 0, episode: 0, signal: 0 }
  for (const c of items) {
    if (c.memory_kind in kindCounts) kindCounts[c.memory_kind]++
  }

  return (
    <div className="space-y-3 animate-page-fade-slide">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 rounded-xl border border-accent-porter/20 bg-accent-porter/5 px-4 py-3">
        <Brain className="size-5 text-accent-porter" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-accent-porter">Memory V2 — Recall</p>
          <p className="text-2xs text-text3">
            {total} memories · 4 layers: directives, concepts, episodes, signals
          </p>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={() => concepts.refetch()} className={concepts.isFetching ? "animate-spin" : ""}>
          <RefreshCw className="size-3" />
        </Button>
      </div>

      {/* ── Agent + Layer Stats ── */}
      <div className="grid grid-cols-12 gap-3">

        {/* Memory agents */}
        <div className="col-span-4">
          <AgentPresence surface="recall" />
        </div>

        {/* Layer cards */}
        <div className="col-span-8 grid grid-cols-4 gap-2">
          {(["directive", "concept", "episode", "signal"] as const).map(kind => {
            const cfg = KIND_CONFIG[kind]
            const Icon = cfg.icon
            const count = kindCounts[kind]
            const active = kindFilter === kind
            return (
              <button
                key={kind}
                onClick={() => setKindFilter(active ? "all" : kind)}
                className={`rounded-xl border p-3 text-left transition-all ${
                  active ? `${cfg.bg} border-current ${cfg.color}` : "border-border bg-surface hover:border-border2"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className={`size-3 ${cfg.color}`} />
                  <span className={`text-2xs font-bold uppercase tracking-wide ${active ? cfg.color : "text-text3"}`}>{cfg.label}s</span>
                </div>
                <p className="text-xl font-bold text-text tabular-nums">{count}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Search + Filters ── */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-text3" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search memories..."
            className="pl-8 h-8 text-xs"
          />
        </div>
        <div className="flex items-center gap-1">
          <Filter className="size-3 text-text3" />
          {["all", "global", "agent", "project"].map(scope => (
            <button
              key={scope}
              onClick={() => setScopeFilter(scope)}
              className={`rounded-md px-2 py-1 text-2xs font-medium transition-colors ${
                scopeFilter === scope ? "bg-accent-porter/15 text-accent-porter" : "text-text3 hover:text-text2 hover:bg-raised"
              }`}
            >{scope}</button>
          ))}
        </div>
      </div>

      {/* ── Concept List ── */}
      <div className="space-y-1.5">
        {concepts.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface py-12 text-center">
            <Brain className="size-8 text-text3/30 mx-auto mb-2" />
            <p className="text-sm text-text3">
              {search ? "No memories match your search" : "No memories stored yet"}
            </p>
            <p className="text-2xs text-text3/60 mt-1">
              Memories are created as Porter learns from conversations and interactions
            </p>
          </div>
        ) : (
          <>
            {items.map((c, i) => (
              <div key={c.id} className="animate-list-stagger-in" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                <ConceptCard concept={c} />
              </div>
            ))}
            {items.length >= 100 && (
              <p className="text-center text-2xs text-text3 pt-2">Showing first 100 — use search to narrow</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function RecallPage() {
  return (
      <div className="overflow-y-auto p-4 flex-1 scrollbar-thin">
        <RecallContent />
      </div>
  )
}
