import { useState, useMemo } from "react"
import { Link } from "react-router"
import {
  Bot, Search, Blocks, Calendar, Sparkles,
  ChevronRight, ListTodo,
} from "lucide-react"
import { AppShell } from "~/components/layout/app-shell"
import { useAgents, useTemplates } from "~/hooks/use-api"
import { Badge } from "~/components/ui/badge"
import { Input } from "~/components/ui/input"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs"
import { PixelPortrait } from "~/components/pixel-portrait"

/* ── Helpers ── */

const DEFAULT_APPEARANCE = {
  skin: "#E0AC69",
  hair: "#2C1B18",
  eyes: "#1A1A2E",
  shirt: "#64748B",
  hairStyle: "short" as const,
}

const VALID_HAIR_STYLES = new Set([
  "short", "long", "mohawk", "bald", "parted", "buzz", "curly", "ponytail",
])

function parseAppearance(raw?: Record<string, string> | string | null) {
  if (!raw) return DEFAULT_APPEARANCE
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw
    const palette = parsed.palette ?? parsed
    return {
      skin: palette.skin || DEFAULT_APPEARANCE.skin,
      hair: palette.hair || DEFAULT_APPEARANCE.hair,
      eyes: palette.eyes || DEFAULT_APPEARANCE.eyes,
      shirt: palette.shirt || DEFAULT_APPEARANCE.shirt,
      hairStyle: VALID_HAIR_STYLES.has(palette.hairStyle ?? palette.hair_style)
        ? (palette.hairStyle ?? palette.hair_style)
        : DEFAULT_APPEARANCE.hairStyle,
    }
  } catch {
    return DEFAULT_APPEARANCE
  }
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  active:  { label: "Active",  cls: "bg-success/10 text-success" },
  idle:    { label: "Idle",    cls: "bg-text3/10 text-text3" },
  waiting: { label: "Waiting", cls: "bg-warning/10 text-warning" },
  retired: { label: "Retired", cls: "bg-danger/10 text-danger" },
}

const PORTER_PORTRAIT = {
  skin: "#F5D0A9", hair: "#2C1810", eyes: "#1A1A2E",
  shirt: "#8B5CF6", hairStyle: "short" as const,
}

const QUEUE_MASTER_PORTRAIT = {
  skin: "#FDBCB4", hair: "#8B4513", eyes: "#1A1A2E",
  shirt: "#22C55E", hairStyle: "ponytail" as const,
}

function formatBorn(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    const d = new Date(iso)
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
  } catch { return "—" }
}

/* ── Skeleton ── */

function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-border bg-surface p-2.5">
      <div className="flex items-center gap-2">
        <div className="h-7 w-[19px] rounded bg-raised shrink-0" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="h-3 w-20 rounded bg-raised" />
          <div className="h-2 w-14 rounded bg-raised" />
        </div>
      </div>
      <div className="h-2 w-full rounded bg-raised mt-2" />
      <div className="h-2 w-3/4 rounded bg-raised mt-1" />
    </div>
  )
}

/* ── Empty State ── */

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-text3">
      <Bot className="h-10 w-10 mb-3 opacity-40" />
      <p className="text-sm font-medium">No agents yet</p>
      <p className="text-xs mt-1">Create agents from templates to get started.</p>
    </div>
  )
}

/* ── Queue Master Card ── */

function QueueMasterCard() {
  return (
    <div className="rounded-xl border border-dashed border-border/60 bg-surface p-3 mb-4 opacity-50">
      <div className="flex items-center gap-3">
        <div className="grayscale">
          <PixelPortrait {...QUEUE_MASTER_PORTRAIT} size="sm" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold text-text3">Queue Master</p>
            <Badge className="text-[8px] border-0 bg-text3/10 text-text3">Pending</Badge>
          </div>
          <p className="text-[10px] text-text3 mt-0.5">
            Auto-assigns agents to projects based on skills and availability.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <ListTodo className="size-3 text-text3/40" />
          <span className="text-[10px] text-text3">Not born</span>
        </div>
      </div>
    </div>
  )
}

/* ── Agent Card ── */

function AgentCard({
  agent,
  isPorter,
}: {
  agent: {
    id: string
    name: string
    role: string
    status: string
    description: string
    skills: string[]
    is_master: boolean
    is_system: boolean
    appearance_spec: Record<string, string>
    created_at: string | null
    agent_group: string
  }
  isPorter?: boolean
}) {
  const appearance = isPorter ? PORTER_PORTRAIT : parseAppearance(agent.appearance_spec)
  const badge = STATUS_BADGE[agent.status] ?? STATUS_BADGE.idle

  return (
    <Link
      to={`/agents/${agent.id}`}
      className={`animate-card-deal-in rounded-lg border bg-surface p-2.5 transition-all block group ${
        isPorter
          ? "border-2 border-accent-porter/30 hover:border-accent-porter/50"
          : "border-border hover:border-text3/30"
      }`}
    >
      <div className="flex items-center gap-2">
        <PixelPortrait
          skin={appearance.skin}
          hair={appearance.hair}
          eyes={appearance.eyes}
          shirt={appearance.shirt}
          hairStyle={appearance.hairStyle}
          size="xs"
        />
        <div className="min-w-0 flex-1">
          <p className={`text-[11px] font-bold truncate transition-colors ${
            isPorter ? "text-accent-porter" : "text-text group-hover:text-accent-porter"
          }`}>
            {agent.name}
          </p>
          <p className="text-[9px] text-text3 truncate">
            {agent.role || agent.agent_group || (isPorter ? "Master Orchestrator" : "Worker")}
          </p>
        </div>
        <Badge className={`text-[8px] border-0 shrink-0 ${isPorter ? "bg-success/10 text-success" : badge.cls}`}>
          {isPorter ? "Online" : badge.label}
        </Badge>
      </div>
      {agent.description && (
        <p className="text-[9px] text-text2 mt-1.5 line-clamp-2 leading-relaxed">
          {agent.description}
        </p>
      )}
      <div className="flex items-center gap-2 mt-1.5">
        {agent.created_at && (
          <span className="flex items-center gap-0.5 text-[8px] text-text3">
            <Calendar className="size-2" />
            {formatBorn(agent.created_at)}
          </span>
        )}
        {agent.skills && agent.skills.length > 0 && (
          <span className="flex items-center gap-0.5 text-[8px] text-text3">
            <Sparkles className="size-2" />
            {agent.skills.length}
          </span>
        )}
      </div>
    </Link>
  )
}

/* ── Template Card (grayed if not instantiated) ── */

function TemplateCard({
  template,
  isInstantiated,
  index,
}: {
  template: {
    id: string
    name: string
    category: string
    description: string
    tags: string[]
  }
  isInstantiated: boolean
  index: number
}) {
  return (
    <div
      className={`animate-card-deal-in rounded-lg border bg-surface p-2.5 transition-all ${
        isInstantiated
          ? "border-border hover:border-text3/30 cursor-pointer"
          : "border-border/50 opacity-50 cursor-default"
      }`}
      style={{ animationDelay: `${index * 20}ms` }}
    >
      <div className="flex items-center gap-2">
        <div className={`flex items-center justify-center size-7 rounded-md ${
          isInstantiated ? "bg-accent-porter/10" : "bg-raised"
        }`}>
          <Bot className={`size-3.5 ${isInstantiated ? "text-accent-porter" : "text-text3"}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-[11px] font-bold truncate ${isInstantiated ? "text-text" : "text-text3"}`}>
            {template.name}
          </p>
          <Badge className={`text-[8px] border-0 ${isInstantiated ? "bg-accent-porter/15 text-accent-porter" : "bg-text3/10 text-text3"}`}>
            {template.category}
          </Badge>
        </div>
        {isInstantiated && <ChevronRight className="size-3 text-text3 opacity-0 group-hover:opacity-100" />}
      </div>
      <p className={`text-[9px] mt-1.5 line-clamp-2 leading-relaxed ${isInstantiated ? "text-text2" : "text-text3"}`}>
        {template.description}
      </p>
      {template.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {template.tags.slice(0, 3).map((t) => (
            <span key={t} className="text-[8px] text-text3 bg-raised rounded px-1 py-0.5">{t}</span>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Page ── */

export default function AgentsPage() {
  const { data: agents, isLoading: agentsLoading } = useAgents()
  const { data: templates, isLoading: templatesLoading } = useTemplates()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  const instantiatedTemplateIds = useMemo(() => {
    if (!agents) return new Set<string>()
    const ids = new Set<string>()
    for (const a of agents) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tid = (a as any).template_id
      if (tid) ids.add(tid)
    }
    return ids
  }, [agents])

  const porter = agents?.find((a) => a.is_master)
  const workers = useMemo(() => {
    if (!agents) return []
    let list = agents.filter((a) => !a.is_master)
    if (statusFilter !== "all") {
      list = list.filter((a) => a.status === statusFilter)
    }
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.description ?? "").toLowerCase().includes(q) ||
          (a.role ?? "").toLowerCase().includes(q),
      )
    }
    return list
  }, [agents, statusFilter, search])

  const filteredTemplates = useMemo(() => {
    if (!templates) return []
    if (!search) return templates
    const q = search.toLowerCase()
    return templates.filter(
      (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
    )
  }, [templates, search])

  const isLoading = agentsLoading

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
        {/* Search */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative ml-auto">
            <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-text3" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="h-7 w-[180px] bg-surface border-border pl-7 text-xs"
            />
          </div>
        </div>

        {/* Queue Master */}
        <QueueMasterCard />

        <Tabs defaultValue="agents" className="space-y-3">
          <div className="flex items-center gap-2">
            <TabsList>
              <TabsTrigger value="agents" className="text-xs">
                <Bot className="size-3" /> Agents
              </TabsTrigger>
              <TabsTrigger value="templates" className="text-xs">
                <Blocks className="size-3" /> Templates
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-1 ml-auto">
              {["all", "active", "idle"].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                    statusFilter === s
                      ? "bg-accent-porter/15 text-accent-porter"
                      : "text-text3 hover:text-text2 hover:bg-raised"
                  }`}
                >
                  {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Agents Tab */}
          <TabsContent value="agents">
            {isLoading && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <CardSkeleton key={i} />
                ))}
              </div>
            )}

            {!isLoading && (!agents || agents.length === 0) && <EmptyState />}

            {!isLoading && agents && agents.length > 0 && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {porter && <AgentCard agent={porter} isPorter />}
                {workers.map((a) => (
                  <AgentCard key={a.id} agent={a} />
                ))}
                {workers.length === 0 && porter && (
                  <p className="col-span-full py-6 text-center text-xs text-text3">
                    No agents match your filters
                  </p>
                )}
              </div>
            )}
          </TabsContent>

          {/* Templates Tab */}
          <TabsContent value="templates">
            {templatesLoading && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <CardSkeleton key={i} />
                ))}
              </div>
            )}

            {!templatesLoading && filteredTemplates.length === 0 && (
              <p className="py-6 text-center text-xs text-text3">No templates found</p>
            )}

            {!templatesLoading && filteredTemplates.length > 0 && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredTemplates.map((t, i) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    isInstantiated={instantiatedTemplateIds.has(t.id)}
                    index={i}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  )
}
