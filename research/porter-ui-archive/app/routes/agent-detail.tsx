import { useParams, Link } from "react-router"
import {
  ArrowLeft, Calendar, Shield, Sparkles,
  MessageSquare, Bot,
} from "lucide-react"
import { AppShell } from "~/components/layout/app-shell"
import { useAgents } from "~/hooks/use-api"
import { Badge } from "~/components/ui/badge"
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

function formatBorn(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    const d = new Date(iso)
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
  } catch { return "—" }
}

/* ── Page ── */

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: agents, isLoading } = useAgents()

  const agent = agents?.find((a) => a.id === id)

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center flex-1">
          <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
        </div>
      </AppShell>
    )
  }

  if (!agent) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center flex-1 text-text3">
          <Bot className="size-10 opacity-30 mb-3" />
          <p className="text-sm font-medium">Agent not found</p>
          <Link to="/agents" className="text-xs text-accent-porter hover:underline mt-2">
            Back to agents
          </Link>
        </div>
      </AppShell>
    )
  }

  const isPorter = agent.is_master
  const appearance = isPorter ? PORTER_PORTRAIT : parseAppearance(agent.appearance_spec)
  const badge = STATUS_BADGE[agent.status] ?? STATUS_BADGE.idle

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* Back nav */}
        <div className="border-b border-border px-5 py-2.5">
          <Link to="/agents" className="flex items-center gap-1.5 text-xs text-text3 hover:text-text2 transition-colors w-fit">
            <ArrowLeft className="size-3" />
            Agents
          </Link>
        </div>

        {/* Hero */}
        <div className="px-5 py-5 border-b border-border">
          <div className="flex items-center gap-4">
            <PixelPortrait
              skin={appearance.skin}
              hair={appearance.hair}
              eyes={appearance.eyes}
              shirt={appearance.shirt}
              hairStyle={appearance.hairStyle}
              size="lg"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-foreground">{agent.name}</h1>
                {agent.is_system && <Shield className="size-4 text-accent-porter" />}
                <Badge className={`text-[9px] border-0 ${badge.cls}`}>{badge.label}</Badge>
              </div>
              <p className="text-sm text-text3 mt-0.5">{agent.role || "Worker"}</p>
              <div className="flex items-center gap-4 mt-2 text-[11px] text-text3">
                {agent.created_at && (
                  <span className="flex items-center gap-1">
                    <Calendar className="size-3" />
                    Born {formatBorn(agent.created_at)}
                  </span>
                )}
                {agent.skills && agent.skills.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Sparkles className="size-3" />
                    {agent.skills.length} skills
                  </span>
                )}
              </div>
            </div>
          </div>
          {agent.description && (
            <p className="text-sm text-text2 mt-4 leading-relaxed max-w-2xl">{agent.description}</p>
          )}
        </div>

        {/* Content */}
        <div className="p-5 space-y-6 max-w-3xl">
          {/* Skills */}
          {agent.skills && agent.skills.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text3 mb-2">Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {agent.skills.map((s) => (
                  <Badge key={s} className="text-[11px] bg-accent-porter/10 text-accent-porter border-0">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Group */}
          {agent.agent_group && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text3 mb-2">Group</p>
              <Badge className="text-[11px] bg-raised text-text2 border-0">{agent.agent_group}</Badge>
            </div>
          )}

          {/* Placeholder for activity/chat */}
          <div className="rounded-xl border border-border/50 bg-surface p-6 text-center">
            <MessageSquare className="size-6 text-text3/30 mx-auto mb-2" />
            <p className="text-xs text-text3">Activity and chat coming soon</p>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
