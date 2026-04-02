import { useState } from "react"
import { OrgNode, OrgConnector } from "~/components/forge"
import type { OrgNodeAgent, OrgNodeState } from "~/components/forge"
import { useNavigate } from "react-router"

// ── Workforce ────────────────────────────────────────────

const PORTER: OrgNodeAgent = {
  id: "porter-core",
  name: "Porter",
  role: "Master orchestrator. Routes all requests, manages all agents.",
  template: "Orchestrator",
  team: "product",
  appearance: { skin: "#f1c27d", hair: "#1e293b", eyes: "#0f172a", shirt: "#1e3a5f", hairStyle: "short" },
}

interface TeamDef {
  label: string
  mission: string
  color: string
  dotColor: string
  agents: OrgNodeAgent[]
}

const TEAMS: Record<string, TeamDef> = {
  forge: {
    label: "Forge",
    mission: "Build, validate, and improve every agent. Runs the autonomous assembly line.",
    color: "text-[var(--warning)]",
    dotColor: "bg-[var(--warning)]",
    agents: [
      { id: "forge-master",    name: "Forge Master",  role: "LEAD — Pipeline orchestrator",             template: "Orchestrator",      team: "forge", appearance: { skin: "#d2946b", hair: "#1a1a2e", eyes: "#0f172a", shirt: "#b45309", hairStyle: "buzz" } },
      { id: "forge-scribe",    name: "The Scribe",    role: "Station 1 — Writes .md files",             template: "Writer",            team: "forge", appearance: { skin: "#f1c27d", hair: "#4a3728", eyes: "#1a1a2e", shirt: "#c2410c", hairStyle: "parted" } },
      { id: "forge-mentor",    name: "The Mentor",    role: "Station 2 — Assigns skills",               template: "Skills Specialist", team: "forge", appearance: { skin: "#8d5524", hair: "#1a1a2e", eyes: "#0f172a", shirt: "#a16207", hairStyle: "short" } },
      { id: "forge-armorer",   name: "The Armorer",   role: "Station 3 — Equips tools",                 template: "Tools Specialist",  team: "forge", appearance: { skin: "#c68642", hair: "#292524", eyes: "#1a1a2e", shirt: "#92400e", hairStyle: "mohawk" } },
      { id: "forge-inspector", name: "The Inspector", role: "Cross-model QA grading",                   template: "QA Inspector",      team: "forge", appearance: { skin: "#f1c27d", hair: "#57534e", eyes: "#0f172a", shirt: "#7c2d12", hairStyle: "curly" } },
    ],
  },
  bridge: {
    label: "Bridge",
    mission: "Manage AI gateways, model routing, health monitoring, and cost optimization.",
    color: "text-[var(--accent-porter)]",
    dotColor: "bg-[var(--accent-porter)]",
    agents: [
      { id: "bridge-operator",  name: "Vigil",  role: "LEAD — Health & Sessions",        template: "Bridge Operator",  team: "admin", appearance: { skin: "#c68642", hair: "#1a1a2e", eyes: "#0f172a", shirt: "#059669", hairStyle: "short" } },
      { id: "route-optimizer",  name: "Atlas",  role: "Models · Dispatch · Rules",      template: "Route Optimizer",  team: "admin", appearance: { skin: "#8d5524", hair: "#292524", eyes: "#1a1a2e", shirt: "#2563eb", hairStyle: "mohawk" } },
      { id: "cost-controller",  name: "Ledger", role: "Tokens · Limits · Costs",        template: "Cost Controller",  team: "admin", appearance: { skin: "#e0ac69", hair: "#2C1810", eyes: "#1a1a2e", shirt: "#d97706", hairStyle: "short" } },
    ],
  },
  admin: {
    label: "Admin",
    mission: "Maintain skills catalog, tool connections, and design system.",
    color: "text-[var(--success)]",
    dotColor: "bg-[var(--success)]",
    agents: [
      { id: "skills-curator",   name: "Skills Master",  role: "LEAD — Skill catalog",      template: "Skills Specialist", team: "admin", appearance: { skin: "#f1c27d", hair: "#292524", eyes: "#0f172a", shirt: "#047857", hairStyle: "short" } },
      { id: "toolsmith",        name: "Tooling Master", role: "Connections & OAuth",        template: "Tools Specialist",  team: "admin", appearance: { skin: "#d2946b", hair: "#1a1a2e", eyes: "#0f172a", shirt: "#065f46", hairStyle: "parted" } },
      { id: "admin-design",     name: "Design",         role: "Visual consistency",         template: "Designer",          team: "admin", appearance: { skin: "#c68642", hair: "#57534e", eyes: "#1a1a2e", shirt: "#059669", hairStyle: "curly" } },
    ],
  },
  marketing: {
    label: "Marketing",
    mission: "Organic growth for askporter.app. No paid media. K-factor > 1.",
    color: "text-[var(--chart-4)]",
    dotColor: "bg-[var(--chart-4)]",
    agents: [
      { id: "marketing-growth",  name: "Growth Hacker", role: "LEAD — Viral loops & referrals",  template: "Analyst",  team: "marketing", appearance: { skin: "#f1c27d", hair: "#1a1a2e", eyes: "#0f172a", shirt: "#7c3aed", hairStyle: "mohawk" } },
      { id: "comms",             name: "Email",         role: "Campaigns & drips",               template: "Writer",   team: "marketing", appearance: { skin: "#d2946b", hair: "#44403c", eyes: "#1a1a2e", shirt: "#6d28d9", hairStyle: "parted" } },
      { id: "marketing-social",  name: "Social",        role: "X & community",                   template: "Writer",   team: "marketing", appearance: { skin: "#8d5524", hair: "#292524", eyes: "#0f172a", shirt: "#5b21b6", hairStyle: "curly" } },
      { id: "marketing-copy",    name: "Copywriter",    role: "Blog & SEO",                      template: "Writer",   team: "marketing", appearance: { skin: "#c68642", hair: "#1c1917", eyes: "#1a1a2e", shirt: "#7e22ce", hairStyle: "long" } },
    ],
  },
  memory: {
    label: "Memory",
    mission: "Curate the 4-layer memory system. Agents learn from experience, forget noise.",
    color: "text-[var(--chart-5)]",
    dotColor: "bg-[var(--chart-5)]",
    agents: [
      { id: "memory-curator",  name: "Memory Curator",      role: "LEAD — Concepts & signals",   template: "Memory Specialist", team: "admin", appearance: { skin: "#f1c27d", hair: "#1a1a2e", eyes: "#0f172a", shirt: "#d97706", hairStyle: "parted" } },
      { id: "directive-librarian", name: "Directive Librarian",  role: "Rules & disputes",            template: "Memory Specialist", team: "admin", appearance: { skin: "#d2946b", hair: "#44403c", eyes: "#1a1a2e", shirt: "#b45309", hairStyle: "short" } },
    ],
  },
}

const ALL_TEAM_KEYS = Object.keys(TEAMS)
const TOTAL_AGENTS = 1 + Object.values(TEAMS).reduce((s, t) => s + t.agents.length, 0)

// ── Page ─────────────────────────────────────────────────

export default function OrgChartPage() {
  const navigate = useNavigate()
  const [activeTeams, setActiveTeams] = useState<Set<string>>(new Set(ALL_TEAM_KEYS))
  const [hovered, setHovered] = useState<OrgNodeAgent | null>(null)

  const getState = (): OrgNodeState => "ghost"

  const toggleTeam = (key: string) => {
    setActiveTeams(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const visibleTeams = ALL_TEAM_KEYS.filter(k => activeTeams.has(k))

  return (
      <div className="flex h-full min-h-0">
        {/* Org chart — visual tree */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Filters */}
          <div className="flex items-center gap-1.5 mb-5">
            {ALL_TEAM_KEYS.map(key => {
              const t = TEAMS[key]
              const active = activeTeams.has(key)
              return (
                <button
                  key={key}
                  onClick={() => toggleTeam(key)}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                    active ? "bg-raised text-text" : "text-text3 hover:text-text2"
                  }`}
                >
                  <span className={`size-2 rounded-full ${t.dotColor} ${active ? "" : "opacity-30"}`} />
                  {t.label} <span className="text-text3">{t.agents.length}</span>
                </button>
              )
            })}
            <span className="ml-auto text-xs text-text3">{TOTAL_AGENTS} total</span>
          </div>

          {/* Tree */}
          <div className="flex flex-col items-center gap-3">
            {/* Porter */}
            <OrgNode agent={PORTER} state="born" href={`/agents/${PORTER.id}`} />
            <OrgConnector direction="vertical" active length={14} team="product" />

            {/* Teams row */}
            <div className="flex items-start gap-10 justify-center flex-wrap">
              {visibleTeams.map(key => {
                const t = TEAMS[key]
                const lead = t.agents[0]
                const rest = t.agents.slice(1)
                return (
                  <div key={key} className="flex flex-col items-center gap-1.5">
                    {/* Team label + mission */}
                    <div className="text-center max-w-[280px]">
                      <span className={`text-xs font-bold uppercase tracking-wider ${t.color}`}>{t.label}</span>
                      <p className="text-2xs text-text2 leading-snug mt-0.5">{t.mission}</p>
                    </div>

                    {/* Lead — larger */}
                    <div className="mt-1" onMouseEnter={() => setHovered(lead)} onMouseLeave={() => setHovered(null)}>
                      <OrgNode agent={lead} state={getState()} href={lead.id ? `/agents/${lead.id}` : undefined} />
                    </div>

                    {/* Rest of team */}
                    <div className="flex items-start gap-1 flex-wrap justify-center" style={{ maxWidth: key === "product" ? 420 : 280 }}>
                      {rest.map(a => (
                        <div key={a.name} onMouseEnter={() => setHovered(a)} onMouseLeave={() => setHovered(null)}>
                          <OrgNode agent={a} state={getState()} href={a.id ? `/agents/${a.id}` : undefined} />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Hover detail */}
          {hovered && (
            <div className="mt-5 mx-auto max-w-lg rounded-lg border border-border bg-surface px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-text">{hovered.name}</span>
                {hovered.role?.startsWith("LEAD") && <span className="text-2xs text-warning bg-warning/10 px-1.5 py-0.5 rounded font-bold">LEAD</span>}
                {hovered.template && <span className="text-2xs text-text3 bg-raised px-1.5 py-0.5 rounded">{hovered.template}</span>}
              </div>
              <p className="text-xs text-text2 mt-1">{hovered.role?.replace(/^LEAD — /, "")}</p>
            </div>
          )}
        </div>
      </div>
  )
}
