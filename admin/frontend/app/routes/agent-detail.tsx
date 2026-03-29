import { useState } from "react"
import { useParams } from "react-router"
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
  Shield, Save, Sparkles, FolderKanban,
  FileText, MessageSquare, Eye, X, Flame,
  Activity, Server, Route, DollarSign,
} from "lucide-react"

// ── Types ────────────────────────────────────────────────

interface Skill { name: string; enabled: boolean; assignedAt: number }
interface Project { project_id: string; project_name: string; role: string }

interface AgentApiData {
  persona: Record<string, unknown>
  files: Record<string, string | null>
  skills: Skill[]
  projects: Project[]
  metrics: { recentMessages: number; signalCount: number }
}

// Template API returns rich metadata — used for mission/comms/inputs/outputs
interface TemplateApiData {
  id: string; name: string; cat: string; desc: string
  soul: string[]; mission: string; inputs: string[]; outputs: string[]
  authority: string[]; tags: string[]; archetype: string
  appearance_spec: Record<string, string>; communication_style: string
  files: Record<string, string | null>
}

type HairStyle = "short" | "long" | "mohawk" | "bald" | "parted" | "buzz" | "curly" | "ponytail"
const HAIR_STYLES: string[] = ["short", "long", "mohawk", "bald", "parted", "buzz", "curly", "ponytail"]

const FILE_TABS = [
  { id: "SOUL.md", label: "SOUL", icon: Shield },
  { id: "IDENTITY.md", label: "IDENTITY", icon: FileText },
  { id: "ROLE_CARD.md", label: "ROLE", icon: FileText },
  { id: "SKILLS.md", label: "SKILLS", icon: Sparkles },
  { id: "DELIVERABLES.md", label: "DELIVER", icon: FileText },
  { id: "MISSION.md", label: "MISSION", icon: MessageSquare },
]

const archetypeColors: Record<string, string> = {
  navigator: "bg-blue-500/15 text-blue-400",
  operator: "bg-emerald-500/15 text-emerald-400",
  maker: "bg-purple-500/15 text-purple-400",
  auditor: "bg-amber-500/15 text-amber-400",
  warden: "bg-red-500/15 text-red-400",
}

function parseSpec(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {}
  const obj = raw as Record<string, unknown>
  const palette = obj.palette
  if (palette && typeof palette === "object") return palette as Record<string, string>
  return obj as Record<string, string>
}

// ── Bridge Agent Activity ─────────────────────────────────

const BRIDGE_AGENTS: Record<string, { label: string; icon: typeof Server }> = {
  "sys-bridge-operator": { label: "Gateway Health", icon: Server },
  "sys-model-scout":     { label: "Model Catalog", icon: Route },
  "sys-route-analyst":   { label: "Dispatch Activity", icon: Activity },
  "sys-cost-controller": { label: "Cost Overview", icon: DollarSign },
}

function fmtBridgeMs(ms: number) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms)}ms`
}

function fmtBridgeTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function BridgeActivityTab({ agentId }: { agentId: string }) {
  // Operator: gateway health — shares cache with Bridge page
  const bridgeQ = useQuery({
    queryKey: ["bridge", "gateway-cards"],
    queryFn: () => api<{ gateways: Array<{ id: string; name: string; type: string; status: string; circuit_state: string; model_count: number; last_health_at: number | null }>; summary: { healthy: number; degraded: number; unavailable: number } }>("/api/admin/bridge"),
    enabled: agentId === "sys-bridge-operator",
    staleTime: 30_000,
  })

  // Scout: model catalog — shares cache with Bridge page
  const modelsQ = useQuery({
    queryKey: ["bridge", "all-models"],
    queryFn: () => api<{ models: Array<{ id: string; model_name: string; gateway_id: string; capabilities: string[]; context_window: number | null }> }>("/api/admin/bridge/models"),
    enabled: agentId === "sys-model-scout",
    staleTime: 30_000,
  })

  // Analyst: recent dispatches — dedicated key, SSE invalidates ["bridge", "dispatch-log"] prefix
  const dispatchQ = useQuery({
    queryKey: ["bridge", "dispatch-log-summary"],
    queryFn: () => api<{ entries: Array<{ id: string; model: string; gateway_type: string; reason: string; latency_ms: number; cost: number; created_at: number }>; pagination: { total: number } }>("/api/admin/bridge/dispatch-log?page=1&limit=10"),
    enabled: agentId === "sys-route-analyst",
    staleTime: 15_000,
  })

  // Controller: costs
  const costsQ = useQuery({
    queryKey: ["bridge", "costs-summary"],
    queryFn: () => api<{ total_cost: number; total_dispatches: number; tokens_in: number; tokens_out: number; by_gateway: Array<{ gateway_type: string; dispatches: number; total_cost: number }>; by_model: Array<{ model: string; dispatches: number; total_cost: number }> }>("/api/admin/bridge/costs"),
    enabled: agentId === "sys-cost-controller",
    staleTime: 30_000,
  })

  if (agentId === "sys-bridge-operator") {
    const gateways = bridgeQ.data?.gateways ?? []
    const summary = bridgeQ.data?.summary
    return (
      <Card className="h-full overflow-y-auto">
        <CardContent className="p-4 space-y-3">
          {summary && (
            <div className="flex items-center gap-4 text-xs">
              <span className="text-success font-bold">{summary.healthy} healthy</span>
              {summary.degraded > 0 && <span className="text-warning font-bold">{summary.degraded} degraded</span>}
              {summary.unavailable > 0 && <span className="text-danger font-bold">{summary.unavailable} down</span>}
            </div>
          )}
          {gateways.map(gw => (
            <div key={gw.id} className="flex items-center gap-3 py-1.5 border-b border-border/20 last:border-0">
              <div className={`size-2 rounded-full shrink-0 ${gw.status === "active" ? "bg-success" : "bg-danger"}`} />
              <span className="text-xs font-medium text-foreground flex-1">{gw.name}</span>
              <span className="text-2xs text-text3">{gw.type}</span>
              <span className="text-2xs text-text2">{gw.model_count} {gw.model_count === 1 ? "model" : "models"}</span>
              {gw.circuit_state === "open" && <Badge className="text-2xs bg-danger/15 text-danger border-0">circuit open</Badge>}
            </div>
          ))}
          {gateways.length === 0 && !bridgeQ.isLoading && <p className="text-xs text-text3 text-center py-4">No gateways</p>}
          {bridgeQ.isLoading && <p className="text-xs text-text3 text-center py-4">Loading...</p>}
        </CardContent>
      </Card>
    )
  }

  if (agentId === "sys-model-scout") {
    const models = modelsQ.data?.models ?? []
    const byGateway = models.reduce<Record<string, number>>((acc, m) => { acc[m.gateway_id] = (acc[m.gateway_id] ?? 0) + 1; return acc }, {})
    return (
      <Card className="h-full overflow-y-auto">
        <CardContent className="p-4 space-y-3">
          <p className="text-xs font-bold text-foreground">{models.length} {models.length === 1 ? "model" : "models"} across {Object.keys(byGateway).length} {Object.keys(byGateway).length === 1 ? "gateway" : "gateways"}</p>
          {models.map(m => (
            <div key={m.id} className="flex items-center gap-2 py-1 border-b border-border/20 last:border-0">
              <span className="text-xs font-medium text-foreground flex-1 truncate">{m.model_name}</span>
              <div className="flex gap-0.5">
                {(m.capabilities ?? []).map(cap => (
                  <span key={cap} className="rounded px-1 py-0.5 text-2xs bg-raised text-text3">{cap}</span>
                ))}
              </div>
              {m.context_window && <span className="text-2xs text-text3 tabular-nums">{m.context_window >= 1_000_000 ? `${(m.context_window / 1_000_000).toFixed(1)}M` : `${(m.context_window / 1_000).toFixed(0)}K`}</span>}
            </div>
          ))}
          {models.length === 0 && !modelsQ.isLoading && <p className="text-xs text-text3 text-center py-4">No models</p>}
          {modelsQ.isLoading && <p className="text-xs text-text3 text-center py-4">Loading...</p>}
        </CardContent>
      </Card>
    )
  }

  if (agentId === "sys-route-analyst") {
    const entries = dispatchQ.data?.entries ?? []
    const total = dispatchQ.data?.pagination?.total ?? 0
    return (
      <Card className="h-full overflow-y-auto">
        <CardContent className="p-4 space-y-3">
          <p className="text-xs font-bold text-foreground">{total} total dispatches</p>
          {entries.map(e => (
            <div key={e.id} className="flex items-center gap-2 py-1.5 border-b border-border/20 last:border-0">
              <span className="text-xs font-medium text-foreground truncate flex-1">{e.model}</span>
              <Badge className="text-2xs bg-raised text-text3 border-0">{e.reason}</Badge>
              <span className="text-2xs text-text3 tabular-nums">{fmtBridgeMs(e.latency_ms)}</span>
              {e.cost > 0 && <span className="text-2xs text-text3 tabular-nums">${e.cost.toFixed(4)}</span>}
            </div>
          ))}
          {entries.length === 0 && !dispatchQ.isLoading && <p className="text-xs text-text3 text-center py-4">No dispatches</p>}
          {dispatchQ.isLoading && <p className="text-xs text-text3 text-center py-4">Loading...</p>}
        </CardContent>
      </Card>
    )
  }

  if (agentId === "sys-cost-controller") {
    const d = costsQ.data
    return (
      <Card className="h-full overflow-y-auto">
        <CardContent className="p-4 space-y-3">
          {d ? (
            <>
              <div className="grid grid-cols-4 gap-3">
                <div><p className="text-2xs text-text3 uppercase">Total Spend</p><p className="text-sm font-bold text-foreground">${d.total_cost.toFixed(2)}</p></div>
                <div><p className="text-2xs text-text3 uppercase">Dispatches</p><p className="text-sm font-bold text-foreground">{d.total_dispatches}</p></div>
                <div><p className="text-2xs text-text3 uppercase">Tokens In</p><p className="text-sm font-bold text-foreground">{fmtBridgeTokens(d.tokens_in)}</p></div>
                <div><p className="text-2xs text-text3 uppercase">Tokens Out</p><p className="text-sm font-bold text-foreground">{fmtBridgeTokens(d.tokens_out)}</p></div>
              </div>
              {d.by_gateway.length > 0 && (
                <div>
                  <p className="text-2xs font-semibold text-text3 uppercase mb-1">By Gateway</p>
                  {d.by_gateway.map(g => (
                    <div key={g.gateway_type} className="flex items-center gap-2 py-1 border-b border-border/20 last:border-0">
                      <span className="text-xs text-foreground flex-1">{g.gateway_type}</span>
                      <span className="text-2xs text-text3">{g.dispatches} calls</span>
                      <span className="text-2xs font-medium text-foreground">${g.total_cost.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
              {d.by_model.length > 0 && (
                <div>
                  <p className="text-2xs font-semibold text-text3 uppercase mb-1">By Model</p>
                  {d.by_model.slice(0, 8).map(m => (
                    <div key={m.model} className="flex items-center gap-2 py-1 border-b border-border/20 last:border-0">
                      <span className="text-xs text-foreground flex-1 truncate">{m.model}</span>
                      <span className="text-2xs text-text3">{m.dispatches} calls</span>
                      <span className="text-2xs font-medium text-foreground">${m.total_cost.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : costsQ.isLoading ? (
            <p className="text-xs text-text3 text-center py-4">Loading...</p>
          ) : (
            <p className="text-xs text-text3 text-center py-4">No cost data</p>
          )}
        </CardContent>
      </Card>
    )
  }

  return null
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

  // Agent API — skip for planned/registry-only agents to avoid loading spinner on 404
  const { data: apiData, error: agentError } = useQuery({
    queryKey: ["admin", "agents", id],
    queryFn: () => api<AgentApiData>(`/api/admin/agents/${id}`),
    enabled: !!id && !isPlanned,
    retry: false,
  })

  // Template API — provides mission/comms/inputs/outputs for ALL agents
  // For planned agents this is the primary rich-data source.
  // For born agents it supplements the agent API persona.
  const { data: tmplData, isLoading: tmplLoading } = useQuery({
    queryKey: ["admin", "templates", "detail", id],
    queryFn: () => api<TemplateApiData>(`/api/admin/templates/${id}`),
    enabled: !!id,
    retry: false,
  })

  const hasApi = !agentError && !!apiData
  const p = apiData?.persona ?? {}
  const files = hasApi ? (apiData?.files ?? {}) : (tmplData?.files ?? {})
  const skills = apiData?.skills ?? []
  const projects = apiData?.projects ?? []

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

  // Show minimal loader only while the template query is in-flight AND no registry data exists
  if (tmplLoading && !reg) return (
    <div className="flex items-center justify-center py-20">
      <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
    </div>
  )

  // Neither source has this agent
  if (!hasApi && !reg && !tmplData) return (
    <div className="py-12 text-center">
      <p className="text-xs text-danger">Agent not found</p>
    </div>
  )

  // ── Resolve display values ──
  // Prefer API persona, fall back to template data, then registry
  const spec = hasApi ? parseSpec(p.appearance_spec) : parseSpec(tmplData?.appearance_spec)
  const hairStyle = (HAIR_STYLES.includes(spec.hair_style) ? spec.hair_style : "short") as HairStyle

  const displayName = hasApi ? String(p.name ?? "") : (tmplData?.name ?? reg?.name ?? "")
  const displayDesc = hasApi ? String(p.role ?? "") : (tmplData?.desc ?? reg?.description ?? "")
  const archetype = hasApi ? String(p.archetype ?? "") : (tmplData?.archetype ?? "")
  const category = hasApi ? String(p.cat ?? p.agent_group ?? "") : (tmplData?.cat ?? reg?.team ?? "")

  const defaultAvatar = { hair: "#2c1b18", skin: "#f1c27d", eyes: "#1a1a2e", shirt: "#64748b", hairStyle: "short" as HairStyle }
  const avatarProps = hasApi
    ? { hair: spec.hair || "#2c1b18", skin: spec.skin || "#f1c27d", eyes: spec.eyes || "#1a1a2e", shirt: spec.shirt || "#64748b", hairStyle }
    : spec.hair
      ? { hair: spec.hair || "#2c1b18", skin: spec.skin || "#f1c27d", eyes: spec.eyes || "#1a1a2e", shirt: spec.shirt || "#64748b", hairStyle }
      : reg?.avatar ? { ...reg.avatar } : defaultAvatar

  const currentContent = editContent ?? files[activeTab] ?? ""
  const isFileTab = activeTab !== "skills-tab" && activeTab !== "deploy-tab" && activeTab !== "bridge-activity"

  // ── Soul traits / tags ──
  // Prefer API persona, fall back to template data
  const soul: string[] = Array.isArray(p.soul) ? p.soul.map(String) : (tmplData?.soul ?? [])
  const tags: string[] = Array.isArray(p.tags) ? p.tags.map(String) : (tmplData?.tags ?? [])

  // ── Rich metadata — always sourced from template API when available ──
  // This ensures planned/registry agents show the same info grid as born agents
  const mission = hasApi ? String(p.mission ?? "") : (tmplData?.mission ?? "")
  const commStyle = hasApi ? String(p.communication_style ?? "") : (tmplData?.communication_style ?? "")
  const inputs: string[] = Array.isArray(p.inputs) ? p.inputs.map(String) : (tmplData?.inputs ?? [])
  const outputs: string[] = Array.isArray(p.outputs) ? p.outputs.map(String) : (tmplData?.outputs ?? [])

  // ── Grayscale for planned/unborn agents ──
  const portraitClass = isPlanned ? "grayscale opacity-70" : ""

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
                {isPlanned && (
                  <Badge className="text-2xs bg-text3/15 text-text3 border-0">planned</Badge>
                )}
                {archetype ? (
                  <Badge className={`text-2xs border-0 ${archetypeColors[archetype] || "bg-text3/15 text-text3"}`}>{archetype}</Badge>
                ) : null}
                {category ? <Badge className="text-2xs bg-muted text-text3 border-0">{category}</Badge> : null}
              </div>
              <p className="text-sm text-text2 leading-none">{displayDesc}</p>

              {/* Soul traits */}
              {soul.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {soul.map(s => <Badge key={s} variant="outline" className="text-2xs font-normal">{s}</Badge>)}
                </div>
              )}

              {/* Planned capabilities as traits (registry agents without soul) */}
              {isPlanned && reg && reg.plannedCapabilities.length > 0 && soul.length === 0 && (
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
              <Button size="sm" className="h-7 text-xs gap-1 bg-[var(--forge-ember)] hover:bg-[var(--forge-ember)]/80 text-white border-0">
                <Flame className="size-3" /> Queue
              </Button>
            </div>
          </div>

          {/* Info grid — shown whenever any data is available */}
          {(mission || commStyle || inputs.length > 0 || outputs.length > 0) && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4 pt-3 border-t border-border">
              {mission && (
                <div>
                  <p className="text-2xs font-semibold uppercase tracking-wider text-text3 mb-1">Mission</p>
                  <p className="text-2xs text-text2 leading-relaxed">{mission}</p>
                </div>
              )}
              {commStyle && (
                <div>
                  <p className="text-2xs font-semibold uppercase tracking-wider text-text3 mb-1">Communication</p>
                  <p className="text-2xs text-text2 italic">{commStyle}</p>
                </div>
              )}
              {inputs.length > 0 && (
                <div>
                  <p className="text-2xs font-semibold uppercase tracking-wider text-text3 mb-1">Inputs</p>
                  {inputs.map(v => <p key={v} className="text-2xs text-text2">{v}</p>)}
                </div>
              )}
              {outputs.length > 0 && (
                <div>
                  <p className="text-2xs font-semibold uppercase tracking-wider text-text3 mb-1">Outputs</p>
                  {outputs.map(v => <p key={v} className="text-2xs text-text2">{v}</p>)}
                </div>
              )}
            </div>
          )}
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
                  {archetype ? <Badge className={`text-2xs border-0 mt-1 ${archetypeColors[archetype] || "bg-text3/15 text-text3"}`}>{archetype}</Badge> : null}
                </div>
              </div>
              {soul.length > 0 && (
                <div className="mb-2">
                  <p className="text-2xs font-semibold text-text3 mb-1">Soul</p>
                  <div className="flex flex-wrap gap-1">{soul.map(s => <Badge key={s} variant="outline" className="text-2xs font-normal">{s}</Badge>)}</div>
                </div>
              )}
              {isPlanned && reg && reg.plannedCapabilities.length > 0 && soul.length === 0 && (
                <div className="mb-2">
                  <p className="text-2xs font-semibold text-text3 mb-1">Planned Capabilities</p>
                  <div className="flex flex-wrap gap-1">{reg.plannedCapabilities.map(cap => <Badge key={cap} variant="outline" className="text-2xs font-normal">{cap}</Badge>)}</div>
                </div>
              )}
              {mission && (
                <div className="mb-2">
                  <p className="text-2xs font-semibold text-text3 mb-1">Mission</p>
                  <p className="text-xs text-text2 leading-relaxed">{mission}</p>
                </div>
              )}
              {commStyle && (
                <div className="mb-2">
                  <p className="text-2xs font-semibold text-text3 mb-1">Communication</p>
                  <p className="text-xs text-text2 italic">{commStyle}</p>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2 mt-2">
                {inputs.length > 0 && <div><p className="text-2xs font-semibold text-text3 mb-0.5">Inputs</p>{inputs.map(v => <p key={v} className="text-2xs text-text2">{v}</p>)}</div>}
                {outputs.length > 0 && <div><p className="text-2xs font-semibold text-text3 mb-0.5">Outputs</p>{outputs.map(v => <p key={v} className="text-2xs text-text2">{v}</p>)}</div>}
                {skills.length > 0 && <div><p className="text-2xs font-semibold text-text3 mb-0.5">Skills</p>{skills.slice(0, 5).map((s, i) => <p key={i} className="text-2xs text-text2">{s.name}</p>)}</div>}
              </div>
              {tags.length > 0 && <div className="flex flex-wrap gap-1 mt-2">{tags.map(tag => <Badge key={tag} variant="outline" className="text-2xs">{tag}</Badge>)}</div>}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── File Editor with Tabs ── */}
      <div className="flex-1 min-h-0 flex flex-col">
        <Tabs value={activeTab} onValueChange={v => { setActiveTab(v); setEditContent(null) }}>
          <div className="flex items-center gap-2 shrink-0">
            <TabsList variant="file">
              {FILE_TABS.map(tab => (
                <TabsTrigger key={tab.id} value={tab.id} className="gap-1">
                  <tab.icon className="size-2.5" />
                  {tab.label}
                  {files[tab.id] && <div className="size-1.5 rounded-full bg-success" />}
                </TabsTrigger>
              ))}
              {/* Extra tabs for born agents — Skills + Deploy */}
              {hasApi && (
                <>
                  <TabsTrigger value="skills-tab" className="gap-1">
                    <Sparkles className="size-2.5" />
                    SKILLS
                  </TabsTrigger>
                  <TabsTrigger value="deploy-tab" className="gap-1">
                    <FolderKanban className="size-2.5" />
                    DEPLOY
                  </TabsTrigger>
                </>
              )}
              {/* Bridge agents get an ACTIVITY tab showing their domain data */}
              {id && BRIDGE_AGENTS[id] && (
                <TabsTrigger value="bridge-activity" className="gap-1">
                  {(() => { const BA = BRIDGE_AGENTS[id!]; const Icon = BA.icon; return <Icon className="size-2.5" /> })()}
                  ACTIVITY
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

          {FILE_TABS.map(tab => (
            <TabsContent key={tab.id} value={tab.id} className="flex-1 min-h-0 mt-2">
              <Card className="h-full flex flex-col">
                <div className="flex items-center px-3 py-1.5 border-b border-border bg-muted/50 shrink-0">
                  <span className="text-2xs font-mono text-text3">{tab.id}</span>
                </div>
                <textarea
                  value={activeTab === tab.id ? currentContent : (files[tab.id] ?? "")}
                  onChange={e => setEditContent(e.target.value)}
                  readOnly={!hasApi}
                  className="flex-1 w-full bg-background p-3 font-mono text-xs text-foreground placeholder:text-text3 focus:outline-none resize-none"
                  spellCheck={false}
                  placeholder={hasApi
                    ? `No ${tab.id} yet. Start typing to define this agent's ${tab.label.toLowerCase()}.`
                    : `Awaiting forge — ${tab.id} will be generated when this agent is forged.`}
                />
              </Card>
            </TabsContent>
          ))}

          {hasApi && (
            <>
              <TabsContent value="skills-tab" className="flex-1 min-h-0 mt-2">
                <Card className="h-full overflow-y-auto">
                  {skills.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-text3">No skills assigned</div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border/50 bg-muted/50 text-left">
                          <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Skill</th>
                          <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3 text-right">Enabled</th>
                        </tr>
                      </thead>
                      <tbody>
                        {skills.map(s => (
                          <tr key={s.name} className="border-b border-border/20 last:border-0">
                            <td className="px-3 py-1 text-xs font-medium text-foreground">{s.name}</td>
                            <td className="px-3 py-1 text-right">
                              <Switch checked={s.enabled} onCheckedChange={() => toggleSkill.mutate(s.name)} className="scale-75" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Card>
              </TabsContent>

              <TabsContent value="deploy-tab" className="flex-1 min-h-0 mt-2">
                <Card className="h-full overflow-y-auto">
                  {projects.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-text3">Not deployed to any projects</div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border/50 bg-muted/50 text-left">
                          <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Project</th>
                          <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Role</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projects.map(pr => (
                          <tr key={pr.project_id} className="border-b border-border/20 last:border-0">
                            <td className="px-3 py-1 text-xs font-medium text-foreground">{pr.project_name || pr.project_id}</td>
                            <td className="px-3 py-1 text-xs text-text3">{pr.role}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Card>
              </TabsContent>
            </>
          )}

          {/* Bridge agent activity tab */}
          {id && BRIDGE_AGENTS[id] && (
            <TabsContent value="bridge-activity" className="flex-1 min-h-0 mt-2">
              <BridgeActivityTab agentId={id} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  )
}

export default function AgentDetailPage() {
  return (
      <AgentDetailContent />
  )
}
