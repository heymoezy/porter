import { useState, useEffect } from "react"
import { Link } from "react-router"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs"
import { PixelPortrait } from "~/components/pixel-portrait"
import {
  StationCard, ConveyorLine, BirthAnimation,
} from "~/components/forge"
import { SkillsStudio } from "~/components/forge/skills-studio"
import { ToolsStudio } from "~/components/forge/tools-studio"
import { useForgeSSE, useForgeState, useForgeStart, useForgeStop, useForgeQueue, useForgeRemove } from "~/hooks/use-forge"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Play, Pause, Search, Flame, Wrench, Sparkles } from "lucide-react"

// ── Station Specialists ──────────────────────────────────

const DEFAULT_PORTRAIT = { skin: "#F5D0A9", hair: "#2C1810", eyes: "#1A1A2E", shirt: "#8B5CF6", hairStyle: "short" as const }

const SPECIALISTS = {
  1: { name: "Quill", template: "Soul Writer", skin: "#f1c27d", hair: "#4a3728", eyes: "#1a1a2e", shirt: "#c2410c", hairStyle: "parted" as const, templateId: "cre-storyteller" },
  2: { name: "Sage", template: "Skill Trainer", skin: "#8d5524", hair: "#1a1a2e", eyes: "#0f172a", shirt: "#a16207", hairStyle: "short" as const, templateId: "sup-training" },
  3: { name: "Anvil", template: "Gear Outfitter", skin: "#c68642", hair: "#292524", eyes: "#1a1a2e", shirt: "#92400e", hairStyle: "mohawk" as const, templateId: "eng-platform" },
}

// ── Bombastic Verbs ──────────────────────────────────────

const WRITER_VERBS = ["Precipitating", "Conjuring", "Inscribing", "Crystallizing", "Atomizing"]
const TRAINER_VERBS = ["Calibrating", "Harmonizing", "Orchestrating", "Synthesizing"]
const OUTFITTER_VERBS = ["Forging", "Tempering", "Galvanizing", "Annealing"]

function pickVerb(verbs: string[], seed: string): string {
  return verbs[Math.abs(seed.charCodeAt(0)) % verbs.length]
}

// ── Template Types ──────────────────────────────────────

interface Template {
  id: string; name: string; category: string; description: string
  tags: string[]; archetype: string; appearance_spec: Record<string, unknown>
}

function parseSpec(raw: string | Record<string, unknown> | null): Record<string, string> {
  try {
    const spec = typeof raw === "string" ? JSON.parse(raw) : raw || {}
    return (spec.palette ?? spec) as Record<string, string>
  } catch { return {} }
}




// ── Workshop ──────────────────────────────────────────────

interface WorkshopSkill {
  skill_id: string; sort_order: number
  success_rate_30d: number; total_uses: number; last_used: number | null
}
interface WorkshopSupport {
  id: string; target_skill?: string; prompt_diff?: string; measured_impact?: string
}
interface WorkshopData {
  id: string; name: string; star_level: number; level: number; rarity: string
  shell: string; elo_rating: number; skill_slots: number
  intelligence: Record<string, unknown>
  skills: WorkshopSkill[]; supports: WorkshopSupport[]
}

function successRateColor(rate: number): string {
  if (rate >= 80) return "text-success"
  if (rate >= 50) return "text-warning"
  return "text-danger"
}

function WorkshopContent({ templateId }: { templateId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["forge", "workshop", templateId],
    queryFn: () => api<{ data: WorkshopData }>(`/api/admin/templates/${templateId}/workshop`),
    enabled: !!templateId,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-5 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  if (isError || !data?.data) {
    return <p className="text-xs text-text3 py-8 text-center">Failed to load workshop data.</p>
  }

  const w = data.data
  const filledSlots = w.skills.length
  const totalSlots = w.skill_slots

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 pb-2 border-b border-border">
        <div>
          <p className="text-sm font-bold text-text">{w.name}</p>
          <p className="text-2xs text-text3">Level {w.level} · {w.rarity} · Elo {w.elo_rating}</p>
        </div>
        <Badge className="ml-auto capitalize text-2xs border-0 bg-raised text-text2">{w.shell}</Badge>
      </div>

      {/* Intelligence */}
      {w.intelligence && Object.keys(w.intelligence).length > 0 && (
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wider text-text3 mb-2">Intelligence</p>
          <div className="rounded-lg border border-border bg-surface p-3 space-y-1">
            {Object.entries(w.intelligence).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <span className="text-2xs text-text3 w-32 shrink-0">{k.replace(/_/g, ' ')}</span>
                <span className="text-2xs text-text truncate">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skill Slots */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <p className="text-2xs font-semibold uppercase tracking-wider text-text3">Skill Slots</p>
          <span className="text-2xs text-text3">({filledSlots}/{totalSlots} equipped)</span>
          {w.star_level >= 2 && (
            <Badge className="text-2xs border-0 bg-[var(--forge-ember)]/10 text-[var(--forge-flame)]">
              {w.star_level}★ +{w.star_level - 1} bonus {w.star_level - 1 === 1 ? "slot" : "slots"}
            </Badge>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: totalSlots }).map((_, i) => {
            const skill = w.skills[i]
            return (
              <div
                key={i}
                className={`rounded-lg border p-2.5 ${
                  skill
                    ? "border-border bg-surface"
                    : "border-dashed border-border/40 bg-transparent"
                }`}
              >
                {skill ? (
                  <>
                    <p className="text-xs font-medium text-text truncate">{skill.skill_id.replace(/-/g, ' ')}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <span className={`text-2xs font-bold tabular-nums ${successRateColor(skill.success_rate_30d)}`}>
                        {skill.success_rate_30d.toFixed(0)}%
                      </span>
                      <span className="text-2xs text-text3">30d</span>
                    </div>
                    {skill.total_uses > 0 && (
                      <p className="text-2xs text-text3 mt-0.5">{skill.total_uses} uses</p>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-10 gap-1">
                    <span className="size-4 rounded border border-dashed border-border/40" />
                    <p className="text-2xs text-text3/40">Empty</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Supports */}
      {w.supports.length > 0 && (
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wider text-text3 mb-2">Supports</p>
          <div className="space-y-2">
            {w.supports.map((s, i) => (
              <div key={s.id || i} className="rounded-lg border border-border bg-surface p-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-text">{s.id}</p>
                    {s.target_skill && (
                      <p className="text-2xs text-text3 mt-0.5">→ {s.target_skill}</p>
                    )}
                    {s.measured_impact && (
                      <p className="text-2xs text-success mt-1">{s.measured_impact}</p>
                    )}
                    {s.prompt_diff && (
                      <pre className="mt-2 text-2xs text-text2 bg-raised rounded p-2 whitespace-pre-wrap font-mono overflow-x-auto">
                        {s.prompt_diff}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {w.supports.length === 0 && (
        <p className="text-2xs text-text3 italic">No supports equipped. Reach ★★★ (200 dispatches + 85% reliability) to unlock.</p>
      )}
    </div>
  )
}

// ── Workshop placeholder ───────────────────────────────────

function WorkshopPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-3 text-center">
      <Wrench className="size-8 text-text3" />
      <p className="text-sm font-semibold text-text2">Workshop</p>
      <p className="text-xs text-text3 max-w-xs">Select a template from the Templates tab to configure your build before forging.</p>
    </div>
  )
}

// ── Arena — coming soon ───────────────────────────────────

function ArenaSoon() {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="text-3xl">⚔️</span>
      <p className="text-sm font-semibold text-text2">Arena</p>
      <p className="text-xs text-text3">Coming in Phase 28.</p>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────

export default function ForgePage() {
  useForgeSSE()
  const { data, isLoading } = useForgeState()
  const startMut = useForgeStart()
  const stopMut = useForgeStop()
  const queueMut = useForgeQueue()
  const removeMut = useForgeRemove()
  const [templateSearch, setTemplateSearch] = useState("")
  const [templateCat, setTemplateCat] = useState("all")
  const [activeTab, setActiveTab] = useState("templates")
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [birthItem, setBirthItem] = useState<{ template_name: string | null; template_id: string; appearance_spec?: unknown } | null>(null)

  // Templates query — fetch all, filter client-side
  const { data: tmplData } = useQuery({
    queryKey: ["admin", "templates"],
    queryFn: () => api<{ templates: Template[]; count: number; categories: Record<string, number> }>("/api/admin/templates"),
  })

  const state = data
  const running = state?.running ?? false
  const stats = state?.stats ?? { queued: 0, claimed: 0, complete: 0, error: 0, dead_letter: 0 }
  const items = state?.items ?? []

  const queued = items.filter(i => i.status === "queued")
  const active = items.filter(i => i.status === "claimed")
  const complete = items.filter(i => i.status === "complete")

  // Birth animation — trigger on new complete items
  useEffect(() => {
    if (complete.length > 0) {
      const latest = complete[complete.length - 1]
      setBirthItem(latest)
      const t = setTimeout(() => setBirthItem(null), 4000)
      return () => clearTimeout(t)
    }
  }, [complete.length])

  const allTemplates = (tmplData?.templates ?? [])
    .sort((a, b) => {
      if (a.name.toLowerCase() === "porter") return -1
      if (b.name.toLowerCase() === "porter") return 1
      return a.name.localeCompare(b.name)
    })
  const categories = tmplData?.categories ?? {}

  // Client-side category + search filter
  let filteredTemplates = allTemplates
  if (templateCat !== "all") filteredTemplates = filteredTemplates.filter(t => t.category === templateCat)
  if (templateSearch) filteredTemplates = filteredTemplates.filter(t => t.name.toLowerCase().includes(templateSearch.toLowerCase()) || t.description.toLowerCase().includes(templateSearch.toLowerCase()))

  return (
    <div className="flex h-full min-h-0">
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Tab bar */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
            <TabsList className="shrink-0 h-9 px-4 border-b border-border bg-background rounded-none justify-start gap-1 w-full">
              <TabsTrigger value="templates" className="text-xs gap-1.5 data-[state=active]:bg-[var(--forge-ember)]/10 data-[state=active]:text-[var(--forge-flame)]">
                <Flame className="size-3" /> Templates
              </TabsTrigger>
              <TabsTrigger value="skills" className="text-xs gap-1.5">
                <Sparkles className="size-3" /> Skills
              </TabsTrigger>
              <TabsTrigger value="tools" className="text-xs gap-1.5">
                <Wrench className="size-3" /> Tools
              </TabsTrigger>
              <TabsTrigger value="workshop" className="text-xs gap-1.5">
                <Wrench className="size-3" /> Workshop
              </TabsTrigger>
              <TabsTrigger value="arena" className="text-xs gap-1.5 opacity-50" disabled>
                <span className="text-xs leading-none">⚔️</span> Arena
              </TabsTrigger>
            </TabsList>

            {/* Templates — existing forge content */}
            <TabsContent value="templates" className="flex-1 flex flex-col min-h-0 mt-0 overflow-y-auto">

              {/* ── Zone 1: Forge Console ── */}
              <div className="shrink-0 flex items-center gap-4 px-5 py-2.5 border-b border-border">
                {running ? (
                  <Badge className="bg-[var(--forge-ember)]/15 text-[var(--forge-flame)] border-0 gap-1.5 text-xs">
                    <span className="size-1.5 rounded-full bg-[var(--forge-ember)] animate-pulse" /> Forging
                  </Badge>
                ) : (
                  <Badge className="bg-raised text-text3 border-0 text-xs">Idle</Badge>
                )}
                <div className="flex items-center gap-3 text-2xs text-text2">
                  <span><strong className="text-text tabular-nums">{stats.queued}</strong> queued</span>
                  <span><strong className="text-[var(--forge-ember)] tabular-nums">{stats.claimed}</strong> active</span>
                  <span><strong className="text-success tabular-nums">{stats.complete}</strong> born</span>
                  {stats.error > 0 && <span><strong className="text-danger tabular-nums">{stats.error}</strong> errors</span>}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {running ? (
                    <Button size="sm" variant="outline" onClick={() => stopMut.mutate()} className="gap-1.5 text-xs border-border text-text2">
                      <Pause className="size-3" /> Pause
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => startMut.mutate()} className="gap-1.5 text-xs bg-[var(--forge-ember)] hover:bg-[var(--forge-ember)]/80 text-white border-0">
                      <Play className="size-3" /> Ignite
                    </Button>
                  )}
                </div>
              </div>

              {/* ── Zone 2: Assembly Line ── */}
              <div className="shrink-0 px-6 py-6 border-b border-border bg-raised/20">
                <div className="flex items-center justify-center gap-0">
                  {/* Queue */}
                  <div className="flex flex-col items-center justify-center w-16 shrink-0">
                    <p className="text-xl font-bold text-text tabular-nums leading-none">{stats.queued}</p>
                    <p className="text-2xs text-text3 uppercase tracking-widest mt-1">Queue</p>
                  </div>

                  <ConveyorLine active={running} length={32} />

                  <StationCard
                    name="Quill"
                    stationNumber={1}
                    specialist={SPECIALISTS[1]}
                    state={active.some(i => i.station === 1) ? "active" : "idle"}
                    action={active.find(i => i.station === 1)?.template_name
                      ? `${pickVerb(WRITER_VERBS, active.find(i => i.station === 1)!.template_id)} ${active.find(i => i.station === 1)?.template_name}...`
                      : undefined}
                    processedCount={items.filter(i => i.station > 1 || i.status === "complete").length}
                    href={`/agents/${SPECIALISTS[1].templateId}`}
                  />

                  <ConveyorLine active={running} length={24} />

                  <StationCard
                    name="Sage"
                    stationNumber={2}
                    specialist={SPECIALISTS[2]}
                    state={active.some(i => i.station === 2) ? "active" : "idle"}
                    action={active.find(i => i.station === 2)?.template_name
                      ? `${pickVerb(TRAINER_VERBS, active.find(i => i.station === 2)!.template_id)} ${active.find(i => i.station === 2)?.template_name}...`
                      : undefined}
                    processedCount={items.filter(i => i.station > 2 || i.status === "complete").length}
                    href={`/agents/${SPECIALISTS[2].templateId}`}
                  />

                  <ConveyorLine active={running} length={24} />

                  <StationCard
                    name="Anvil"
                    stationNumber={3}
                    specialist={SPECIALISTS[3]}
                    state={active.some(i => i.station === 3) ? "active" : "idle"}
                    action={active.find(i => i.station === 3)?.template_name
                      ? `${pickVerb(OUTFITTER_VERBS, active.find(i => i.station === 3)!.template_id)} ${active.find(i => i.station === 3)?.template_name}...`
                      : undefined}
                    processedCount={complete.length}
                    href={`/agents/${SPECIALISTS[3].templateId}`}
                  />

                  <ConveyorLine active={running} length={32} />

                  {/* Born */}
                  <div className="flex flex-col items-center justify-center w-16 shrink-0">
                    <p className="text-xl font-bold text-success tabular-nums leading-none">{stats.complete}</p>
                    <p className="text-2xs text-text3 uppercase tracking-widest mt-1">Born</p>
                  </div>
                </div>
              </div>

              {/* ── Zone 3: Queue Line + Catalog ── */}
              <div className="flex-1 min-h-0 px-5 py-4 space-y-4">

                {/* Queue — Queue Master at gate, avatars waiting in line */}
                <div className="shrink-0 border-b border-border pb-3">
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="text-2xs font-bold text-[var(--forge-flame)] uppercase tracking-wider">Queue</span>
                    <span className="text-2xs text-text3">{queued.length} waiting</span>
                  </div>
                  <div className="flex items-end gap-4 overflow-x-auto pb-1 scrollbar-thin">
                    {/* Warden — forge queue keeper */}
                    <div className="shrink-0 flex flex-col items-center grayscale opacity-50">
                      <PixelPortrait skin="#8d5524" hair="#1a1a2e" eyes="#0f172a" shirt="#dc2626" hairStyle="ponytail" size="sm" />
                      <span className="text-2xs font-bold text-text3 mt-1">Warden</span>
                      <span className="text-2xs text-text3 leading-none">Queue Keeper</span>
                    </div>

                    {/* Divider — the velvet rope */}
                    <div className="shrink-0 w-px h-10 bg-[var(--forge-ember)]/30" />

                    {/* Queued agents — just avatars, no cards */}
                    {queued.length === 0 ? (
                      <span className="text-2xs text-text3 italic pb-2">Empty — queue from catalog below</span>
                    ) : (
                      queued.map((item, i) => (
                        <button
                          key={item.id}
                          onClick={() => removeMut.mutate(item.id)}
                          title={`${item.template_name || item.template_id} — click to send back`}
                          className="shrink-0 flex flex-col items-center hover:opacity-50 transition-opacity animate-forge-queue-arrive"
                          style={{ animationDelay: `${i * 60}ms` }}
                        >
                          <PixelPortrait skin="#f1c27d" hair="#2c1b18" eyes="#1a1a2e" shirt="#64748b" hairStyle="short" size="sm" />
                          <span className="text-2xs text-text3 mt-1 truncate max-w-[56px] text-center leading-tight">{item.template_name || item.template_id}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                {/* Catalog header */}
                <div className="flex items-center gap-2">
                  <span className="text-2xs font-bold text-text2 uppercase tracking-wider">Catalog</span>
                  <span className="text-2xs text-text3">{filteredTemplates.length}</span>
                  <div className="relative ml-auto">
                    <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-text3" />
                    <Input value={templateSearch} onChange={e => setTemplateSearch(e.target.value)} placeholder="Search..." className="h-7 w-[160px] bg-surface border-border pl-7 text-xs" />
                  </div>
                </div>

                {/* Category filters */}
                <div className="flex flex-wrap gap-1">
                  {["all", ...Object.keys(categories).sort()].map(cat => (
                    <button key={cat} onClick={() => setTemplateCat(cat)}
                      className={`rounded-md px-2 py-1 text-2xs font-medium transition-colors ${
                        templateCat === cat ? "bg-[var(--forge-ember)]/15 text-[var(--forge-flame)]" : "text-text3 hover:text-text2 hover:bg-raised"
                      }`}
                    >
                      {cat}{cat !== "all" && categories[cat] ? ` (${categories[cat]})` : ""}
                    </button>
                  ))}
                </div>

                {/* Template grid */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {/* Porter — only in "all" view */}
                  {templateCat === "all" && <Link to="/agents/porter-core"
                    className="rounded-lg border-2 border-accent-porter/30 bg-surface p-2.5 transition-all block hover:border-accent-porter/50"
                  >
                    <div className="flex items-center gap-2">
                      <PixelPortrait {...DEFAULT_PORTRAIT} size="xs" />
                      <div className="min-w-0 flex-1">
                        <p className="text-2xs font-bold text-accent-porter truncate">Porter</p>
                        <p className="text-2xs text-text3 truncate">Master Orchestrator</p>
                      </div>
                      <Badge className="text-2xs border-0 bg-success/10 text-success">Born</Badge>
                    </div>
                    <p className="text-2xs text-text2 mt-1.5 leading-relaxed">The brain. Routes all requests, manages workers, owns the product.</p>
                    <p className="text-2xs text-text3 mt-1">Born Feb 18, 2026</p>
                  </Link>}

                  {filteredTemplates.map((t, i) => {
                    const spec = parseSpec(t.appearance_spec as any)
                    const inPipeline = items.some(it => it.template_id === t.id)
                    return (
                      <div key={t.id}
                        className={`animate-card-deal-in rounded-lg border border-border bg-surface p-2.5 transition-all ${
                          inPipeline ? "animate-forge-disintegrate pointer-events-none" : "hover:border-text3/30 grayscale opacity-60 hover:grayscale-0 hover:opacity-100"
                        }`}
                        style={{ animationDelay: `${i * 15}ms` }}
                      >
                        <Link to={`/agents/${t.id}`} className="block">
                          <div className="flex items-center gap-2">
                            <PixelPortrait
                              hair={spec.hair || "#2c1b18"} skin={spec.skin || "#f1c27d"}
                              eyes={spec.eyes || "#1a1a2e"} shirt={spec.shirt || "#64748b"}
                              hairStyle={(["short","long","mohawk","bald","parted","buzz","curly","ponytail"].includes(spec.hair_style ?? "") ? spec.hair_style : "short") as any}
                              size="xs"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-2xs font-bold text-text truncate">{t.name}</p>
                              <p className="text-2xs text-text3 line-clamp-2 leading-relaxed">{t.description}</p>
                            </div>
                            <Badge className="text-2xs bg-muted text-text3 border-0 shrink-0">{t.category}</Badge>
                          </div>
                        </Link>
                        <div className="mt-2 flex items-center gap-1.5">
                          {inPipeline ? (
                            <Badge className="text-2xs border-0 bg-[var(--forge-ember)]/10 text-[var(--forge-flame)]">Queued</Badge>
                          ) : (
                            <Button size="sm" variant="outline" className="h-5 text-2xs px-2 gap-1 border-border text-text3 hover:text-[var(--forge-ember)] hover:border-[var(--forge-ember)]/30"
                              onClick={() => {
                                queueMut.mutate({ template_id: t.id })
                                setSelectedTemplate(t.id)
                                setActiveTab("workshop")
                              }}
                            >
                              <Flame className="size-2.5" /> Queue
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {filteredTemplates.length === 0 && <p className="py-6 text-center text-xs text-text3">No templates found</p>}
              </div>
            </TabsContent>

            {/* Skills — skill registry */}
            <TabsContent value="skills" className="flex-1 overflow-y-auto p-4 mt-0">
              <SkillsStudio />
            </TabsContent>

            {/* Tools — inventory + connections */}
            <TabsContent value="tools" className="flex-1 overflow-y-auto p-4 mt-0">
              <ToolsStudio />
            </TabsContent>

            {/* Workshop — live build configurator */}
            <TabsContent value="workshop" className="flex-1 overflow-y-auto p-4 mt-0">
              {selectedTemplate
                ? <WorkshopContent templateId={selectedTemplate} />
                : <WorkshopPlaceholder />
              }
            </TabsContent>

            {/* Arena — coming soon */}
            <TabsContent value="arena" className="flex-1 flex items-center justify-center mt-0">
              <ArenaSoon />
            </TabsContent>
          </Tabs>
        </div>

      {/* Birth animation overlay — fires when a forge item transitions to complete */}
      {birthItem && (() => {
        const spec = parseSpec((birthItem as any).appearance_spec || {})
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div className="bg-background/80 backdrop-blur-sm rounded-2xl border border-[var(--forge-ember)]/30 p-8">
              <BirthAnimation
                name={birthItem.template_name || birthItem.template_id}
                appearance={{
                  skin: spec.skin || "#f1c27d",
                  hair: spec.hair || "#2c1b18",
                  eyes: spec.eyes || "#1a1a2e",
                  shirt: spec.shirt || "#64748b",
                  hairStyle: (["short","long","mohawk","bald","parted","buzz","curly","ponytail"].includes(spec.hair_style ?? "") ? spec.hair_style : "short") as any,
                }}
                bornAt={new Date().toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Singapore" })}
              />
            </div>
          </div>
        )
      })()}

    </div>
  )
}
