import { useState } from "react"
import { useParams, Link } from "react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card, CardContent } from "~/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs"
import { Switch } from "~/components/ui/switch"
import { PixelPortrait } from "~/components/pixel-portrait"
import { getAgent, type AgentDef } from "~/lib/agent-registry"
import {
  Shield, Save, Sparkles,
  FileText, Eye, X, Flame, Users, Wrench, HeartPulse,
} from "lucide-react"
import { CharacterCard, type RpgStats, type WorkshopData } from "~/components/character-card"
import { VitalsBar } from "~/components/vitals-bar"
import { PassiveTreeView } from "~/components/passive-tree-view"

// ── Types ────────────────────────────────────────────────

interface Skill { name: string; enabled: boolean; assignedAt: number; description?: string; category?: string; source?: string }

interface AgentApiData {
  persona: Record<string, unknown>
  files: Record<string, string | null>
  skills: Skill[]
  metrics: { recentMessages: number; signalCount: number }
}

interface TemplateApiData {
  id: string; name: string; category: string; description: string
  soul: string[]; mission: string; inputs: string[]; outputs: string[]
  authority: string[]; tags: string[]; archetype: string
  appearance_spec: Record<string, string>; communication_style: string
  lifecycle: string; heartbeat_interval: number | null
  files: Record<string, string | null>
}

interface InstanceRow {
  id: string; name: string; role: string; status: string
  created_at: string; last_active: string | null
  avatar: string | null
}

type HairStyle = "short" | "long" | "mohawk" | "bald" | "parted" | "buzz" | "curly" | "ponytail"
const HAIR_STYLES: string[] = ["short", "long", "mohawk", "bald", "parted", "buzz", "curly", "ponytail"]

const CORE_TABS = [
  { id: "SOUL.md", label: "SOUL", icon: Shield },
  { id: "IDENTITY.md", label: "IDENTITY", icon: FileText },
  { id: "ROLE_CARD.md", label: "ROLE", icon: FileText },
  { id: "SKILLS.md", label: "SKILLS", icon: Sparkles },
]

function buildFileTabs(lifecycle: string | undefined, hasTools: boolean) {
  const tabs = [...CORE_TABS]
  if (hasTools) tabs.push({ id: "TOOLS.md", label: "TOOLS", icon: Wrench })
  if (lifecycle === "persistent") tabs.push({ id: "HEARTBEAT.md", label: "HEARTBEAT", icon: HeartPulse })
  return tabs
}

function parseSpec(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {}
  const obj = raw as Record<string, unknown>
  const palette = obj.palette
  if (palette && typeof palette === "object") return palette as Record<string, string>
  return obj as Record<string, string>
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ""
  try {
    const d = new Date(iso)
    return d.toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Singapore" })
  } catch { return "" }
}

// ── Detail Content ───────────────────────────────────────

function AgentDetailContent() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState("SOUL.md")
  const [editContent, setEditContent] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showWhoIs, setShowWhoIs] = useState(false)

  // Registry lookup — instant, no network
  const reg: AgentDef | null = (id ? getAgent(id) : undefined) ?? null
  const isPlanned = reg?.status === "planned"

  // Agent API — skip for planned/registry-only agents
  const { data: apiData, error: agentError } = useQuery({
    queryKey: ["admin", "agents", id],
    queryFn: () => api<AgentApiData>(`/api/admin/agents/${id}`),
    enabled: !!id && !isPlanned,
    retry: false,
  })

  // Resolve template ID: instances have persona.template_id → use that; otherwise URL id IS the template
  const hasApi = !agentError && !!apiData
  const p = apiData?.persona ?? {}
  const templateIdForLookup = hasApi && p.template_id ? String(p.template_id) : id

  // Template API — depends on agent query finishing first so we know the correct template ID
  const { data: tmplData, isLoading: tmplLoading } = useQuery({
    queryKey: ["admin", "templates", "detail", templateIdForLookup],
    queryFn: () => api<TemplateApiData>(`/api/admin/templates/${templateIdForLookup}`),
    enabled: !!templateIdForLookup,
    retry: false,
  })

  // Instances of this template
  const { data: instancesData } = useQuery({
    queryKey: ["admin", "templates", templateIdForLookup, "instances"],
    queryFn: () => api<{ instances: InstanceRow[] }>(`/api/admin/templates/${templateIdForLookup}/instances`),
    enabled: !!templateIdForLookup,
    retry: false,
  })

  // RPG stats — null if agent has no dispatches or isn't born yet
  const { data: rpgData } = useQuery({
    queryKey: ["admin", "agents", id, "rpg-stats"],
    queryFn: () => api<{ stats: RpgStats | null }>(`/api/admin/agents/${id}/rpg-stats`).catch(() => ({ stats: null })),
    enabled: !!id,
    retry: false,
    staleTime: 30_000,
  })

  // Workshop data — skills, supports, equipment, passive tree
  const { data: workshopData } = useQuery({
    queryKey: ["admin", "templates", templateIdForLookup, "workshop"],
    queryFn: () => api<WorkshopData>(`/api/admin/templates/${templateIdForLookup}/workshop`).catch(() => null),
    enabled: !!templateIdForLookup,
    retry: false,
    staleTime: 60_000,
  })

  const rpgStats = rpgData?.stats ?? null
  const workshop = workshopData ?? null

  const files = hasApi ? (apiData?.files ?? {}) : (tmplData?.files ?? {})
  const skills = apiData?.skills ?? []
  const instances = instancesData?.instances ?? []

  // Is this an instance (persona with template_id) or a template?
  const isInstance = hasApi && !!p.template_id

  // Born = has been through Forge (has soul_hash)
  const isBorn = hasApi && !!p.soul_hash

  // Build file tabs based on template capabilities
  const lifecycle = tmplData?.lifecycle
  const heartbeatInterval = tmplData?.heartbeat_interval
  const hasTools = skills.length > 0 || (tmplData?.tags ?? []).some((t: string) => t === "tools")
  const fileTabs = buildFileTabs(lifecycle, hasTools)
  const birthDate = isBorn ? fmtDate(String(p.created_at)) : null

  const saveMutation = useMutation({
    mutationFn: async ({ file, content }: { file: string; content: string }) =>
      api(`/api/admin/agents/${id}/files/${file}`, { method: "PUT", json: { content } }),
    onSuccess: () => { setSaving(false); setEditContent(null); qc.invalidateQueries({ queryKey: ["admin", "agents", id] }) },
    onError: () => setSaving(false),
  })

  const toggleSkill = useMutation({
    mutationFn: (skillName: string) =>
      api(`/api/admin/skills/${id}/${skillName}/toggle`, { method: "PUT" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "agents", id] }),
  })

  if (tmplLoading && !reg) return (
    <div className="flex items-center justify-center py-20">
      <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
    </div>
  )

  if (!hasApi && !reg && !tmplData) return (
    <div className="py-12 text-center">
      <p className="text-xs text-danger">Agent not found</p>
    </div>
  )

  // ── Resolve display values ──
  const spec = hasApi ? parseSpec(p.appearance_spec) : parseSpec(tmplData?.appearance_spec)
  const hairStyle = (HAIR_STYLES.includes(spec.hair_style) ? spec.hair_style : "short") as HairStyle

  const displayName = hasApi ? String(p.name ?? "") : (tmplData?.name ?? reg?.name ?? "")
  const displayDesc = hasApi ? String(p.role ?? "") : (tmplData?.description ?? reg?.description ?? "")
  const category = hasApi ? String(p.cat ?? p.agent_group ?? "") : (tmplData?.category ?? reg?.team ?? "")

  const defaultAvatar = { hair: "#2c1b18", skin: "#f1c27d", eyes: "#1a1a2e", shirt: "#64748b", hairStyle: "short" as HairStyle }
  const avatarProps = spec.hair
    ? { hair: spec.hair || "#2c1b18", skin: spec.skin || "#f1c27d", eyes: spec.eyes || "#1a1a2e", shirt: spec.shirt || "#64748b", hairStyle }
    : reg?.avatar ? { ...reg.avatar } : defaultAvatar

  const currentContent = editContent ?? files[activeTab] ?? ""
  const isFileTab = fileTabs.some(t => t.id === activeTab)

  // ── Soul traits / tags ──
  const soul: string[] = Array.isArray(p.soul) ? p.soul.map(String) : (tmplData?.soul ?? [])
  const tags: string[] = Array.isArray(p.tags) ? p.tags.map(String) : (tmplData?.tags ?? [])

  // ── Portrait: grayscale until born ──
  const portraitClass = isBorn ? "" : "grayscale opacity-70"

  return (
    <div className="flex flex-col gap-3 p-5 h-full min-h-0">
      {/* ── Hero Card ── */}
      <Card className="shrink-0">
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <div className={portraitClass}>
              <PixelPortrait {...avatarProps} size="lg" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-foreground">{displayName}</h2>
                {isBorn && (
                  <Badge className="text-2xs bg-success/15 text-success border-0">born</Badge>
                )}
                {!isBorn && isInstance && (
                  <Badge className="text-2xs bg-text3/15 text-text3 border-0">unborn</Badge>
                )}
                {isInstance && tmplData && (
                  <Link to={`/agents/${templateIdForLookup}`}>
                    <Badge className="text-2xs bg-accent-porter/15 text-accent-porter border-0 hover:bg-accent-porter/25 transition-colors cursor-pointer">
                      Component: {tmplData.name}
                    </Badge>
                  </Link>
                )}
                {category ? <Badge className="text-2xs bg-muted text-text3 border-0">{category}</Badge> : null}
                {lifecycle === "persistent" && (
                  <Badge className="text-2xs bg-accent-porter/15 text-accent-porter border-0 gap-1">
                    <HeartPulse className="size-2.5" /> {heartbeatInterval}s
                  </Badge>
                )}
                {lifecycle === "event-driven" && (
                  <Badge className="text-2xs bg-warning/15 text-warning border-0">event-driven</Badge>
                )}
              </div>
              <p className="text-sm text-text2 leading-none">{displayDesc}</p>
              {birthDate && (
                <p className="text-2xs text-text3 mt-1">Born {birthDate}</p>
              )}

              {/* Soul traits */}
              {soul.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {soul.map(s => <Badge key={s} variant="outline" className="text-2xs font-normal">{s}</Badge>)}
                </div>
              )}

              {/* Planned capabilities (registry agents without soul) */}
              {!isBorn && reg && reg.plannedCapabilities.length > 0 && soul.length === 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {reg.plannedCapabilities.map(cap => <Badge key={cap} variant="outline" className="text-2xs font-normal">{cap}</Badge>)}
                </div>
              )}

              {/* Tags */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {tags.map(tag => <span key={tag} className="rounded bg-raised px-1.5 py-0.5 text-2xs text-text3">{tag}</span>)}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowWhoIs(true)}>
                <Eye className="size-3" /> Who Is
              </Button>
              {!isBorn && (
                <Button size="sm" className="h-7 text-xs gap-1 bg-[var(--forge-ember)] hover:bg-[var(--forge-ember)]/80 text-white border-0">
                  <Flame className="size-3" /> Forge
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Who Is dialog ── */}
      {showWhoIs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowWhoIs(false)}>
          <Card className="w-[420px] max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-foreground">Who Is {displayName}?</span>
                <button onClick={() => setShowWhoIs(false)} className="flex h-6 w-6 items-center justify-center rounded text-text3 hover:text-foreground hover:bg-raised transition-colors">
                  <X className="size-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-3 mb-3">
                <div className={portraitClass}>
                  <PixelPortrait {...avatarProps} size="lg" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">{displayName}</p>
                  <p className="text-xs text-text3">{displayDesc}</p>
                  {birthDate && <p className="text-2xs text-text3 mt-0.5">Born {birthDate}</p>}
                </div>
              </div>
              {soul.length > 0 && (
                <div className="mb-2">
                  <p className="text-2xs font-semibold text-text3 mb-1">Soul</p>
                  <div className="flex flex-wrap gap-1">{soul.map(s => <Badge key={s} variant="outline" className="text-2xs font-normal">{s}</Badge>)}</div>
                </div>
              )}
              {!isBorn && reg && reg.plannedCapabilities.length > 0 && soul.length === 0 && (
                <div className="mb-2">
                  <p className="text-2xs font-semibold text-text3 mb-1">Planned Capabilities</p>
                  <div className="flex flex-wrap gap-1">{reg.plannedCapabilities.map(cap => <Badge key={cap} variant="outline" className="text-2xs font-normal">{cap}</Badge>)}</div>
                </div>
              )}
              {tags.length > 0 && <div className="flex flex-wrap gap-1 mt-2">{tags.map(tag => <Badge key={tag} variant="outline" className="text-2xs">{tag}</Badge>)}</div>}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex-1 min-h-0 flex flex-col">
        <Tabs value={activeTab} onValueChange={v => { setActiveTab(v); setEditContent(null) }} className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center gap-2 shrink-0">
            <TabsList variant="file">
              {fileTabs.map(tab => (
                <TabsTrigger key={tab.id} value={tab.id} className="gap-1">
                  <tab.icon className="size-2.5" />
                  {tab.label}
                  {files[tab.id] && <div className="size-1.5 rounded-full bg-success" />}
                </TabsTrigger>
              ))}
              {/* Skills tab for born agents */}
              {hasApi && (
                <TabsTrigger value="skills-tab" className="gap-1">
                  <Sparkles className="size-2.5" /> SKILLS
                </TabsTrigger>
              )}
              {/* Build tab — agent build with RPG stats */}
              <TabsTrigger value="build-tab" className="gap-1">
                <Wrench className="size-2.5" /> BUILD
              </TabsTrigger>
              {/* Instances tab — only on templates (not on instances) */}
              {!isInstance && (
              <TabsTrigger value="instances-tab" className="gap-1">
                <Users className="size-2.5" /> INSTANCES
                {instances.length > 0 && (
                  <span className="text-2xs text-text3 ml-0.5">({instances.length})</span>
                )}
              </TabsTrigger>
              )}
            </TabsList>
            {isFileTab && (
              <Button
                size="sm"
                onClick={() => { setSaving(true); saveMutation.mutate({ file: activeTab, content: editContent ?? files[activeTab] ?? "" }) }}
                disabled={saving || editContent === null || !hasApi}
                className="h-7 text-xs gap-1 ml-auto shrink-0"
              >
                <Save className="size-3" /> {saving ? "Saving..." : "Save"}
              </Button>
            )}
          </div>

          {fileTabs.map(tab => (
            <TabsContent key={tab.id} value={tab.id} className="flex-1 min-h-0 mt-2">
              <Card className="h-full flex flex-col">
                <div className="flex items-center px-3 py-1.5 border-b border-border bg-muted/50 shrink-0">
                  <span className="text-2xs font-mono text-text3">{tab.id}</span>
                </div>
                <textarea
                  value={activeTab === tab.id ? currentContent : (files[tab.id] ?? "")}
                  onChange={e => setEditContent(e.target.value)}
                  readOnly={!hasApi}
                  className="flex-1 w-full bg-background p-3 font-mono text-xs text-foreground placeholder:text-text3 focus:outline-none resize-none min-h-0"
                  spellCheck={false}
                  placeholder={hasApi
                    ? `No ${tab.id} yet. Start typing to define this agent's ${tab.label.toLowerCase()}.`
                    : `Awaiting forge — ${tab.id} will be generated when this agent is forged.`}
                />
              </Card>
            </TabsContent>
          ))}

          {hasApi && (
              <TabsContent value="skills-tab" className="flex-1 min-h-0 mt-2">
                <Card className="h-full overflow-y-auto">
                  {skills.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-text3">No skills assigned</div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border/50 bg-muted/50 text-left">
                          <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Skill</th>
                          <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Category</th>
                          <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Source</th>
                          <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3 text-right">Enabled</th>
                        </tr>
                      </thead>
                      <tbody>
                        {skills.map(s => (
                          <tr key={s.name} className="border-b border-border/20 last:border-0">
                            <td className="px-3 py-1.5">
                              <p className="text-xs font-medium text-foreground">{s.name}</p>
                              {s.description && <p className="text-2xs text-text3 truncate max-w-[280px]">{s.description}</p>}
                            </td>
                            <td className="px-3 py-1.5 text-2xs text-text3">{s.category || "—"}</td>
                            <td className="px-3 py-1.5">
                              <Badge className="text-2xs border-0 bg-text3/15 text-text3">{s.source || "detected"}</Badge>
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <Switch checked={s.enabled} onCheckedChange={() => toggleSkill.mutate(s.name)} className="scale-75" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Card>
              </TabsContent>
          )}

          {/* Instances tab */}
          <TabsContent value="instances-tab" className="flex-1 min-h-0 mt-2">
            <Card className="h-full overflow-y-auto">
              {instances.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-text3">
                  No instances yet — use Forge to create one
                </div>
              ) : (
                <div className="divide-y divide-border/20">
                  {instances.map(inst => {
                    const instBorn = !!(inst as any).soul_hash
                    return (
                    <Link key={inst.id} to={`/agents/${inst.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-raised/30 transition-colors">
                      <div className={`size-2 rounded-full shrink-0 ${instBorn ? "bg-success" : "bg-text3/40"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground">{inst.name}</p>
                        <p className="text-2xs text-text3">{inst.role}</p>
                      </div>
                      <span className="text-2xs text-text3 shrink-0">{instBorn ? "Born" : "Unborn"}</span>
                    </Link>
                    )
                  })}
                </div>
              )}
            </Card>
          </TabsContent>

          {/* Build tab — agent build with RPG stats */}
          <TabsContent value="build-tab" className="flex-1 min-h-0 mt-2">
            <div className="h-full overflow-y-auto">
              <div className="max-w-2xl mx-auto p-2 flex flex-col gap-4">
                {rpgStats || workshop ? (
                  <>
                    <CharacterCard
                      rpg={rpgStats}
                      workshop={workshop}
                      agentName={displayName}
                    />
                    <VitalsBar
                      templateId={id ?? ''}
                      reliability={rpgStats?.reliability ?? 100}
                      dispatchCount={rpgStats?.dispatchCount ?? 0}
                    />
                    <PassiveTreeView
                      nodes={workshop?.passive_tree ?? []}
                      agentLevel={rpgStats?.level ?? 1}
                    />
                  </>
                ) : (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <p className="text-xs text-text3">Forge this agent to unlock its agent build</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

export default function AgentDetailPage() {
  return <AgentDetailContent />
}
