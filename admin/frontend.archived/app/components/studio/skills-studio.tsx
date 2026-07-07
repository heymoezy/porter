import { useState, useMemo } from "react"
import { useNavigate, Link } from "react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import {
  Sparkles, Search, Plus, Download, Loader2,
  CircleDot, CircleCheck, Star, AlertTriangle, CircleDashed,
  FileText, Bot, Zap, Clock, ArrowUpRight,
} from "lucide-react"
import { SkillCreateDialog } from "~/components/studio/skill-create-dialog"
import { SkillEditSheet } from "~/components/studio/skill-edit-sheet"
import { SkillImportDialog } from "~/components/studio/skill-import-dialog"
import { EvolutionPanel } from "~/components/studio/evolution-panel"

// ── Types ──────────────────────────────────────────────────

interface SkillAgent { id: string; name: string; role: string; enabled: boolean }
interface Skill {
  id: string; name: string; description: string; category: string; source: string
  enabled: boolean; visible: boolean; featured: boolean
  icon: string; color: string; short_label: string
  sort_order: number; featured_order: number
  packStatus: "ready" | "partial" | "missing"
  qualityScore: number
  qualityTier: QualityTier
  tags: string[]
  agents: SkillAgent[]
  fileCount?: number
  totalWords?: number
  updatedAt?: number
  createdAt?: number
  totalUses?: number
  lastUsed?: number | null
}
interface SkillsResponse {
  skills: Skill[]; totalSkills: number; totalAssignments: number; assignedSkills: number
  categories: Record<string, number>; sources: Record<string, number>
  allTags: Record<string, number>
  status: { ready: number; partial: number; missing: number }
  tiers: { scaffold: number; baseline: number; production: number; 'high-performing': number; stale: number }
}

type QualityTier = "scaffold" | "baseline" | "production" | "high-performing" | "stale"

const TIER_CFG: Record<QualityTier, { label: string; icon: typeof CircleDot; cls: string }> = {
  "scaffold":        { label: "Scaffold",  icon: CircleDashed,  cls: "text-danger" },
  "baseline":        { label: "Baseline",  icon: CircleDot,     cls: "text-warning" },
  "production":      { label: "Production",icon: CircleCheck,   cls: "text-success" },
  "high-performing": { label: "High Perf", icon: Star,          cls: "text-blue-400" },
  "stale":           { label: "Stale",     icon: AlertTriangle, cls: "text-slate-400" },
}

function fmtRel(ts: number | undefined | null): string {
  if (!ts) return "—"
  const d = Date.now() / 1000 - ts
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}

// ── Component ──────────────────────────────────────────────

export function SkillsStudio() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<"library" | "evolution">("library")
  const [search, setSearch] = useState("")
  const [activeCat, setActiveCat] = useState("all")
  const [activeTier, setActiveTier] = useState("all")
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editSkill, setEditSkill] = useState<Skill | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "skills"],
    queryFn: () => api<SkillsResponse>("/api/admin/skills"),
  })

  const runAudit = useMutation({
    mutationFn: () => api("/api/admin/skills/audit", { method: "GET" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "skills"] }),
  })

  const allSkills = data?.skills ?? []
  const categories = data?.categories ?? {}
  const tierCounts = data?.tiers ?? { scaffold: 0, baseline: 0, production: 0, "high-performing": 0, stale: 0 }

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

  return (
    <div className="space-y-3">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border">
        {(["library", "evolution"] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`relative px-4 py-2 text-xs font-semibold transition-colors ${activeTab === tab ? "text-foreground" : "text-text3 hover:text-text2"}`}
          >
            {tab === "library" ? "Skill Library" : "Evolution"}
            {activeTab === tab && <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-t-full bg-accent-porter" />}
          </button>
        ))}
      </div>

      {activeTab === "evolution" ? <EvolutionPanel /> : (
        <>
          {/* Header: search + tier chips + actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-text3" />
              <Input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search skills..."
                className="h-8 bg-surface border-border pl-8 text-xs" />
            </div>

            {/* Tier filter chips (compact) */}
            {(Object.entries(TIER_CFG) as [QualityTier, typeof TIER_CFG[QualityTier]][]).map(([tier, cfg]) => {
              const cnt = tierCounts[tier] ?? 0
              if (cnt === 0) return null
              const Icon = cfg.icon
              const active = activeTier === tier
              return (
                <button key={tier} onClick={() => setActiveTier(activeTier === tier ? "all" : tier)}
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-medium transition-colors ${
                    active ? `bg-surface border border-current ${cfg.cls}` : "text-text3 hover:text-text2 hover:bg-raised"
                  }`}
                >
                  <Icon className="size-3" />
                  {cfg.label} <span className="opacity-60">{cnt}</span>
                </button>
              )
            })}

            <span className="text-2xs text-text3 tabular-nums">{filtered.length}/{allSkills.length}</span>

            <div className="ml-auto flex items-center gap-1.5">
              <Button size="sm" variant="outline" onClick={() => runAudit.mutate()} disabled={runAudit.isPending} className="h-7 text-2xs gap-1">
                {runAudit.isPending ? <Loader2 className="size-3 animate-spin" /> : <Zap className="size-3" />}
                Audit
              </Button>
              <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="h-7 text-2xs gap-1">
                <Download className="size-3" /> Import
              </Button>
              <Button size="sm" onClick={() => setCreateOpen(true)} className="h-7 text-2xs gap-1">
                <Plus className="size-3" /> New
              </Button>
            </div>
          </div>

          {/* Category pills */}
          <div className="flex flex-wrap gap-1">
            <button onClick={() => setActiveCat("all")}
              className={`rounded-md px-2 py-1 text-2xs font-medium transition-colors ${
                activeCat === "all" ? "bg-accent-porter/15 text-accent-porter" : "text-text3 hover:text-text2 hover:bg-raised"
              }`}
            >All ({allSkills.length})</button>
            {Object.entries(categories).sort(([,a],[,b]) => b - a).map(([cat, cnt]) => (
              <button key={cat} onClick={() => setActiveCat(activeCat === cat ? "all" : cat)}
                className={`rounded-md px-2 py-1 text-2xs font-medium transition-colors ${
                  activeCat === cat ? "bg-accent-porter/15 text-accent-porter" : "text-text3 hover:text-text2 hover:bg-raised"
                }`}
              >{cat} ({cnt})</button>
            ))}
          </div>

          {/* Skill cards — compact, matching agent template card size */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {filtered.map(skill => {
              const cfg = TIER_CFG[skill.qualityTier] ?? TIER_CFG.baseline
              const TierIcon = cfg.icon
              const enabledAgents = skill.agents.filter(a => a.enabled).length
              return (
                <div key={skill.id}
                  className="rounded-lg border border-border bg-surface p-2.5 transition-all hover:border-text3/30"
                >
                  {/* Click name → pack explorer (files + editor) */}
                  <Link to={`/skills/${skill.id}/pack`} className="block">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-2xs font-bold text-text truncate">{skill.name}</p>
                        <p className="text-2xs text-text3 truncate">{skill.description}</p>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0" title={`${cfg.label} (${skill.qualityScore}/100)`}>
                        <TierIcon className={`size-3 ${cfg.cls}`} />
                      </div>
                    </div>
                  </Link>

                  {/* Bottom row: meta */}
                  <div className="mt-1.5 flex items-center gap-1.5 text-2xs text-text3">
                    <Badge variant="outline" className="text-2xs py-0 px-1.5 border-border/50">{skill.category}</Badge>
                    {skill.fileCount != null && (
                      <span className="flex items-center gap-0.5" title={`${skill.fileCount} files, ${skill.totalWords ?? 0} words`}>
                        <FileText className="size-2.5" /> {skill.fileCount}
                      </span>
                    )}
                    {enabledAgents > 0 && (
                      <span className="flex items-center gap-0.5" title={`${enabledAgents} agents assigned`}>
                        <Bot className="size-2.5" /> {enabledAgents}
                      </span>
                    )}
                    {(skill.totalUses ?? 0) > 0 && (
                      <span title={`${skill.totalUses} dispatches`}>
                        {skill.totalUses}x
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-0.5" title={skill.updatedAt ? `Updated ${new Date(skill.updatedAt * 1000).toLocaleDateString()}` : "Never updated"}>
                      <Clock className="size-2.5" />
                      {fmtRel(skill.updatedAt)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {filtered.length === 0 && (
            <div className="rounded-xl border border-border bg-surface py-12 text-center">
              <Sparkles className="size-6 mx-auto text-text3/40 mb-2" />
              <p className="text-xs text-text3">{search ? "No skills match" : "No skills"}</p>
            </div>
          )}
        </>
      )}

      {/* Dialogs */}
      <SkillCreateDialog open={createOpen} onOpenChange={setCreateOpen} categories={Object.keys(categories).sort()} />
      <SkillEditSheet skill={editSkill} open={editOpen} onOpenChange={setEditOpen} categories={Object.keys(categories).sort()} />
      <SkillImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  )
}
