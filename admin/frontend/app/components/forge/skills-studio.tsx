import { useState, useMemo } from "react"
import { useNavigate } from "react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Switch } from "~/components/ui/switch"
import { Input } from "~/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "~/components/ui/sheet"
import { Separator } from "~/components/ui/separator"
import { Progress } from "~/components/ui/progress"
import {
  Sparkles, Search, Bot, Plus, Download, Loader2,
  CircleDot, CircleCheck, Star, AlertTriangle, CircleDashed,
  ChevronRight, Package, ArrowUpRight, Zap,
} from "lucide-react"
import { SkillCreateDialog } from "~/components/forge/skill-create-dialog"
import { SkillEditSheet } from "~/components/forge/skill-edit-sheet"
import { SkillImportDialog } from "~/components/forge/skill-import-dialog"
import { EvolutionPanel } from "~/components/forge/evolution-panel"

// ── Types ──────────────────────────────────────────────────

interface SkillAgent { id: string; name: string; role: string; enabled: boolean }
interface Skill {
  id: string; name: string; description: string; category: string; source: string
  enabled: boolean; visible: boolean; featured: boolean
  icon: string; color: string; short_label: string
  sort_order: number; featured_order: number
  packStatus: string
  qualityScore: number
  qualityTier: QualityTier
  tags: string[]
  agents: SkillAgent[]
}
interface SkillsResponse {
  skills: Skill[]; totalSkills: number; totalAssignments: number; assignedSkills: number
  categories: Record<string, number>; sources: Record<string, number>
  allTags: Record<string, number>
  status: { ready: number; partial: number; missing: number }
  tiers: { scaffold: number; baseline: number; production: number; 'high-performing': number; stale: number }
}

// ── Quality tier config ────────────────────────────────────

type QualityTier = "scaffold" | "baseline" | "production" | "high-performing" | "stale"

const TIER_CONFIG: Record<QualityTier, {
  label: string
  icon: typeof CircleDot
  bg: string
  text: string
  dot: string
}> = {
  "scaffold":        { label: "Scaffold",       icon: CircleDashed,  bg: "bg-danger/8",          text: "text-danger",       dot: "bg-danger" },
  "baseline":        { label: "Baseline",       icon: CircleDot,     bg: "bg-warning/8",         text: "text-warning",      dot: "bg-warning" },
  "production":      { label: "Production",     icon: CircleCheck,   bg: "bg-success/8",         text: "text-success",      dot: "bg-success" },
  "high-performing": { label: "High Perf",      icon: Star,          bg: "bg-blue-500/8",        text: "text-blue-400",     dot: "bg-blue-400" },
  "stale":           { label: "Stale",          icon: AlertTriangle, bg: "bg-slate-500/8",       text: "text-slate-400",    dot: "bg-slate-400" },
}

const SOURCE_COLORS: Record<string, string> = {
  "porter-core": "text-accent-porter",
  "porter-internal": "text-warning",
  "porter-curated": "text-success",
  "runtime": "text-blue-400",
}

// ── Component ──────────────────────────────────────────────

export function SkillsStudio() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<"library" | "evolution">("library")
  const [search, setSearch] = useState("")
  const [activeCat, setActiveCat] = useState("all")
  const [activeTier, setActiveTier] = useState("all")
  const [detailSkill, setDetailSkill] = useState<Skill | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editSkill, setEditSkill] = useState<Skill | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "skills"],
    queryFn: () => api<SkillsResponse>("/api/admin/skills"),
  })

  const toggleSkill = useMutation({
    mutationFn: ({ personaId, skillName }: { personaId: string; skillName: string }) =>
      api(`/api/admin/skills/${personaId}/${skillName}/toggle`, { method: "PUT" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "skills"] }),
  })

  const runAudit = useMutation({
    mutationFn: () => api("/api/admin/skills/audit", { method: "GET" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "skills"] }),
  })

  // ── Derived data ──────────────────────────────────────────

  const allSkills = data?.skills ?? []
  const categories = data?.categories ?? {}
  const tierCounts = data?.tiers ?? { scaffold: 0, baseline: 0, production: 0, "high-performing": 0, stale: 0 }
  const missingCount = data?.status?.missing ?? 0

  const filtered = useMemo(() => {
    let result = allSkills
    if (activeCat !== "all") result = result.filter(s => s.category === activeCat)
    if (activeTier !== "all") result = result.filter(s => s.qualityTier === activeTier)
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.tags?.some(t => t.toLowerCase().includes(q))
      )
    }
    return result
  }, [allSkills, activeCat, activeTier, search])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── Tab bar ── */}
      <div className="flex items-center gap-1 border-b border-border">
        {(["library", "evolution"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`relative px-4 py-2 text-xs font-semibold transition-colors ${
              activeTab === tab ? "text-foreground" : "text-text3 hover:text-text2"
            }`}
          >
            {tab === "library" ? "Skill Library" : "Evolution"}
            {activeTab === tab && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-t-full bg-accent-porter" />
            )}
          </button>
        ))}
      </div>

      {activeTab === "evolution" ? <EvolutionPanel /> : (
        <>
          {/* ── Header: search + actions ── */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-text3" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search skills, tags, categories..."
                className="h-9 bg-surface border-border pl-9 text-sm"
              />
            </div>
            <span className="text-xs text-text3 tabular-nums">
              {filtered.length}/{allSkills.length} skills
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => runAudit.mutate()} disabled={runAudit.isPending} className="h-8 text-xs gap-1.5">
                {runAudit.isPending ? <Loader2 className="size-3 animate-spin" /> : <Zap className="size-3" />}
                Audit
              </Button>
              <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="h-8 text-xs gap-1.5">
                <Download className="size-3" /> Import
              </Button>
              <Button size="sm" onClick={() => setCreateOpen(true)} className="h-8 text-xs gap-1.5">
                <Plus className="size-3" /> New Skill
              </Button>
            </div>
          </div>

          {/* ── Tier summary cards ── */}
          <div className="grid grid-cols-5 gap-2">
            {(Object.entries(TIER_CONFIG) as [QualityTier, typeof TIER_CONFIG[QualityTier]][]).map(([tier, cfg]) => {
              const count = tierCounts[tier] ?? 0
              const Icon = cfg.icon
              const isActive = activeTier === tier
              return (
                <button
                  key={tier}
                  onClick={() => setActiveTier(activeTier === tier ? "all" : tier)}
                  className={`rounded-lg border p-3 text-left transition-all ${
                    isActive
                      ? `${cfg.bg} border-current ${cfg.text}`
                      : "border-border bg-surface hover:bg-raised/50"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`size-3.5 ${isActive ? cfg.text : "text-text3"}`} />
                    <span className={`text-2xs font-semibold uppercase tracking-wide ${isActive ? cfg.text : "text-text3"}`}>
                      {cfg.label}
                    </span>
                  </div>
                  <span className={`text-xl font-bold tabular-nums ${isActive ? cfg.text : "text-foreground"}`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* ── Category filter pills ── */}
          <div className="flex flex-wrap items-center gap-1">
            <button
              onClick={() => setActiveCat("all")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                activeCat === "all"
                  ? "bg-accent-porter/15 text-accent-porter"
                  : "bg-raised text-text3 hover:text-text2"
              }`}
            >All</button>
            {Object.entries(categories).sort(([,a],[,b]) => b - a).map(([cat, cnt]) => (
              <button
                key={cat}
                onClick={() => setActiveCat(activeCat === cat ? "all" : cat)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  activeCat === cat
                    ? "bg-accent-porter/15 text-accent-porter"
                    : "bg-raised text-text3 hover:text-text2"
                }`}
              >
                {cat} <span className="text-text3/60 ml-0.5">{cnt}</span>
              </button>
            ))}
          </div>

          {/* ── Skill card grid ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(skill => {
              const tierCfg = TIER_CONFIG[skill.qualityTier] ?? TIER_CONFIG.baseline
              const TierIcon = tierCfg.icon
              const enabledAgents = skill.agents.filter(a => a.enabled).length
              return (
                <button
                  key={skill.id}
                  onClick={() => setDetailSkill(skill)}
                  className="group rounded-xl border border-border bg-surface p-4 text-left transition-all hover:border-accent-porter/30 hover:shadow-lg hover:shadow-accent-porter/5"
                >
                  {/* Top row: name + tier */}
                  <div className="flex items-start gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold text-foreground truncate group-hover:text-accent-porter transition-colors">
                        {skill.name}
                      </h3>
                      <span className={`text-2xs ${SOURCE_COLORS[skill.source] ?? "text-text3"}`}>
                        {skill.source}
                      </span>
                    </div>
                    <div className={`flex items-center gap-1 rounded-md px-2 py-0.5 ${tierCfg.bg}`}>
                      <TierIcon className={`size-3 ${tierCfg.text}`} />
                      <span className={`text-2xs font-semibold ${tierCfg.text}`}>{tierCfg.label}</span>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-text2 line-clamp-2 leading-relaxed mb-3">
                    {skill.description || "No description"}
                  </p>

                  {/* Bottom row: category + agents */}
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-2xs border-border text-text3">
                      {skill.category}
                    </Badge>
                    {skill.tags?.slice(0, 2).map(tag => (
                      <Badge key={tag} variant="outline" className="text-2xs border-border/50 text-text3/70">
                        {tag}
                      </Badge>
                    ))}
                    <div className="ml-auto flex items-center gap-1 text-2xs text-text3">
                      {enabledAgents > 0 && (
                        <>
                          <Bot className="size-3" />
                          <span className="tabular-nums">{enabledAgents}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Quality score bar */}
                  <div className="mt-3">
                    <Progress value={skill.qualityScore} className="h-1" />
                  </div>
                </button>
              )
            })}
          </div>

          {filtered.length === 0 && (
            <div className="rounded-xl border border-border bg-surface py-16 text-center">
              <Sparkles className="size-8 mx-auto text-text3/40 mb-3" />
              <p className="text-sm text-text3">{search ? "No skills match your search" : "No skills found"}</p>
            </div>
          )}
        </>
      )}

      {/* ── Detail drawer ── */}
      <Sheet open={!!detailSkill} onOpenChange={open => { if (!open) setDetailSkill(null) }}>
        <SheetContent className="w-[420px] sm:max-w-[420px] overflow-y-auto">
          {detailSkill && <SkillDetail
            skill={detailSkill}
            onEdit={() => { setEditSkill(detailSkill); setEditOpen(true); setDetailSkill(null) }}
            onNavigate={(id) => { setDetailSkill(null); navigate(`/skills/${id}/pack`) }}
            onToggleAgent={(personaId, skillId) => toggleSkill.mutate({ personaId, skillName: skillId })}
          />}
        </SheetContent>
      </Sheet>

      {/* Dialogs */}
      <SkillCreateDialog open={createOpen} onOpenChange={setCreateOpen} categories={Object.keys(categories).sort()} />
      <SkillEditSheet skill={editSkill} open={editOpen} onOpenChange={setEditOpen} categories={Object.keys(categories).sort()} />
      <SkillImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  )
}

// ── Detail panel (inside sheet) ─────────────────────────────

function SkillDetail({ skill, onEdit, onNavigate, onToggleAgent }: {
  skill: Skill
  onEdit: () => void
  onNavigate: (id: string) => void
  onToggleAgent: (personaId: string, skillId: string) => void
}) {
  const tierCfg = TIER_CONFIG[skill.qualityTier] ?? TIER_CONFIG.baseline
  const TierIcon = tierCfg.icon
  const enabledAgents = skill.agents.filter(a => a.enabled).length

  return (
    <div className="space-y-5 pt-2">
      <SheetHeader className="space-y-1">
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 rounded-md px-2 py-1 ${tierCfg.bg}`}>
            <TierIcon className={`size-3.5 ${tierCfg.text}`} />
            <span className={`text-xs font-semibold ${tierCfg.text}`}>{tierCfg.label}</span>
          </div>
          <span className={`text-xs ${SOURCE_COLORS[skill.source] ?? "text-text3"}`}>
            {skill.source}
          </span>
        </div>
        <SheetTitle className="text-lg">{skill.name}</SheetTitle>
      </SheetHeader>

      <p className="text-sm text-text2 leading-relaxed">{skill.description || "No description"}</p>

      {/* Quality score */}
      <div className="rounded-lg border border-border bg-raised/30 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-text3">Quality Score</span>
          <span className={`text-sm font-bold ${tierCfg.text} tabular-nums`}>{skill.qualityScore}/100</span>
        </div>
        <Progress value={skill.qualityScore} className="h-2" />
      </div>

      {/* Tags */}
      {skill.tags && skill.tags.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-text3">Tags</span>
          <div className="flex flex-wrap gap-1.5">
            {skill.tags.map(tag => (
              <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md bg-surface border border-border/50 p-2">
          <span className="text-text3">Category</span>
          <p className="font-semibold text-foreground">{skill.category}</p>
        </div>
        <div className="rounded-md bg-surface border border-border/50 p-2">
          <span className="text-text3">Agents</span>
          <p className="font-semibold text-foreground">{enabledAgents}/{skill.agents.length}</p>
        </div>
      </div>

      <Separator />

      {/* Agent assignment */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Bot className="size-3.5 text-text3" />
          <span className="text-xs font-semibold text-text3">Agent Assignment</span>
        </div>
        {skill.agents.length === 0 ? (
          <p className="text-xs text-text3 py-2">No agents available for this skill</p>
        ) : (
          <div className="space-y-1">
            {skill.agents.map(agent => (
              <div key={agent.id} className="flex items-center gap-3 rounded-lg border border-border/50 bg-surface px-3 py-2">
                <Bot className="size-3.5 text-text3 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold text-foreground">{agent.name}</span>
                  <p className="text-2xs text-text3 truncate">{agent.role}</p>
                </div>
                <Switch
                  checked={agent.enabled}
                  onCheckedChange={() => onToggleAgent(agent.id, skill.id)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={onEdit}>
          Edit Skill
        </Button>
        <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => onNavigate(skill.id)}>
          View Pack <ArrowUpRight className="size-3" />
        </Button>
      </div>
    </div>
  )
}
