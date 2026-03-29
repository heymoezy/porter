import { useState } from "react"
import { Link } from "react-router"
import { ChatPanel } from "~/components/chat-panel"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs"
import { PixelPortrait } from "~/components/pixel-portrait"
import {
  StationCard, ConveyorLine,
  TextScramble, StatusPulse,
} from "~/components/forge"
import { useForgeSSE, useForgeState, useForgeStart, useForgeStop, useForgeQueue, useForgeRemove } from "~/hooks/use-forge"
import { useChatPanel } from "~/hooks/use-chat-panel"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Play, Pause, Search, Flame } from "lucide-react"

// ── Station Specialists ──────────────────────────────────

const DEFAULT_PORTRAIT = { skin: "#F5D0A9", hair: "#2C1810", eyes: "#1A1A2E", shirt: "#8B5CF6", hairStyle: "short" as const }

const SPECIALISTS = {
  1: { name: "The Scribe", skin: "#f1c27d", hair: "#4a3728", eyes: "#1a1a2e", shirt: "#c2410c", hairStyle: "parted" as const },
  2: { name: "The Mentor", skin: "#8d5524", hair: "#1a1a2e", eyes: "#0f172a", shirt: "#a16207", hairStyle: "short" as const },
  3: { name: "The Armorer", skin: "#c68642", hair: "#292524", eyes: "#1a1a2e", shirt: "#92400e", hairStyle: "mohawk" as const },
}

// ── Bombastic Verbs ──────────────────────────────────────

const WRITER_VERBS = ["Precipitating", "Conjuring", "Inscribing", "Crystallizing", "Atomizing"]
const TRAINER_VERBS = ["Calibrating", "Harmonizing", "Orchestrating", "Synthesizing"]
const OUTFITTER_VERBS = ["Forging", "Tempering", "Galvanizing", "Annealing"]

function pickVerb(verbs: string[], seed: string): string {
  return verbs[Math.abs(seed.charCodeAt(0)) % verbs.length]
}

// ── Templates Types ──────────────────────────────────────

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

// ── Page ─────────────────────────────────────────────────

export default function ForgePage() {
  useForgeSSE()
  const { data, isLoading } = useForgeState()
  const startMut = useForgeStart()
  const stopMut = useForgeStop()
  const queueMut = useForgeQueue()
  const removeMut = useForgeRemove()
  const chat = useChatPanel()
  const [templateSearch, setTemplateSearch] = useState("")
  const [templateCat, setTemplateCat] = useState("all")

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
  const flagged = items.filter(i => i.status === "error" || i.status === "dead_letter")

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
        {!chat.expanded && <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">

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
                name="Writer"
                stationNumber={1}
                specialist={SPECIALISTS[1]}
                state={active.some(i => i.station === 1) ? "active" : "idle"}
                action={active.find(i => i.station === 1)?.template_name
                  ? `${pickVerb(WRITER_VERBS, active.find(i => i.station === 1)!.template_id)} ${active.find(i => i.station === 1)?.template_name}...`
                  : undefined}
                processedCount={items.filter(i => i.station > 1 || i.status === "complete").length}
                href="/agents/forge-scribe"
              />

              <ConveyorLine active={running} length={24} />

              <StationCard
                name="Trainer"
                stationNumber={2}
                specialist={SPECIALISTS[2]}
                state={active.some(i => i.station === 2) ? "active" : "idle"}
                action={active.find(i => i.station === 2)?.template_name
                  ? `${pickVerb(TRAINER_VERBS, active.find(i => i.station === 2)!.template_id)} ${active.find(i => i.station === 2)?.template_name}...`
                  : undefined}
                processedCount={items.filter(i => i.station > 2 || i.status === "complete").length}
                href="/agents/forge-mentor"
              />

              <ConveyorLine active={running} length={24} />

              <StationCard
                name="Outfitter"
                stationNumber={3}
                specialist={SPECIALISTS[3]}
                state={active.some(i => i.station === 3) ? "active" : "idle"}
                action={active.find(i => i.station === 3)?.template_name
                  ? `${pickVerb(OUTFITTER_VERBS, active.find(i => i.station === 3)!.template_id)} ${active.find(i => i.station === 3)?.template_name}...`
                  : undefined}
                processedCount={complete.length}
                href="/agents/forge-armorer"
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
          <div className="flex-1 min-h-0 px-5 py-4 space-y-4 overflow-y-auto">

            {/* Queue — Queue Master at gate, avatars waiting in line */}
            <div className="shrink-0 border-b border-border pb-3">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="text-2xs font-bold text-[var(--forge-flame)] uppercase tracking-wider">Queue</span>
                <span className="text-2xs text-text3">{queued.length} waiting</span>
              </div>
              <div className="flex items-end gap-4 overflow-x-auto pb-1 scrollbar-thin">
                {/* Queue Master — at the gate, unborn (grey) */}
                <Link to="/agents/forge-queue-master" className="shrink-0 flex flex-col items-center grayscale opacity-50 hover:opacity-70 transition-opacity">
                  <PixelPortrait skin="#8d5524" hair="#1a1a2e" eyes="#0f172a" shirt="#dc2626" hairStyle="ponytail" size="sm" />
                  <span className="text-2xs font-bold text-text3 mt-1">Queue Master</span>
                </Link>

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
              {/* Porter — always first */}
              <Link to="/agents/porter-core"
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
              </Link>

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
                          <p className="text-2xs text-text3 truncate">{t.category}</p>
                        </div>
                      </div>
                      <p className="text-2xs text-text2 mt-1.5 line-clamp-2 leading-relaxed">{t.description}</p>
                    </Link>
                    <div className="mt-2 flex items-center gap-1.5">
                      {inPipeline ? (
                        <Badge className="text-2xs border-0 bg-[var(--forge-ember)]/10 text-[var(--forge-flame)]">Queued</Badge>
                      ) : (
                        <Button size="sm" variant="outline" className="h-5 text-2xs px-2 gap-1 border-border text-text3 hover:text-[var(--forge-ember)] hover:border-[var(--forge-ember)]/30"
                          onClick={() => queueMut.mutate({ template_id: t.id })}
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
        </div>}

        {/* Chat */}
        {chat.open ? (
          <ChatPanel
            streamEndpoint="/api/admin/porter/chat"
            context={{ scope: "forge" }}
            systemContext={`You are Porter on the Agent Forge page. ${stats.queued} queued, ${stats.claimed} forging, ${stats.complete} born, ${stats.error} errors. Wave ${state?.currentWave ?? 0}. ${running ? "RUNNING." : "PAUSED."} ${tmplData?.count ?? 0} templates in catalog.`}
            placeholder="Control the forge..."
            greeting={running ? "Forge is active. What do you need?" : "Forge is idle. Say 'start' to ignite, or browse the templates below."}
            storageKey="chat_forge"
            {...chat.chatProps}
          />
        ) : (
          <button onClick={chat.reopen} className="shrink-0 w-8 border-l border-border bg-background flex items-center justify-center hover:bg-raised transition-colors" title="Open chat">
            <PixelPortrait {...DEFAULT_PORTRAIT} size="xs" />
          </button>
        )}
      </div>
  )
}
