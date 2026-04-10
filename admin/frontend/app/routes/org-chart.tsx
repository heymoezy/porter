import { useState, useMemo } from "react"
import { OrgNode, OrgConnector } from "~/components/forge"
import type { OrgNodeAgent, OrgNodeState } from "~/components/forge"
import { useNavigate } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"

// ── Types ───────────────────────────────────────────────

interface Template {
  id: string
  name: string
  category: string
  description: string
  tags: string[]
  archetype: string
  appearance_spec: Record<string, string> | null
  is_internal: boolean
}

interface Agent {
  id: string
  name: string
  role: string
  template_id: string | null
  status: string
  is_system: number
  is_master: number
  soul_hash: string | null
  appearance_spec: Record<string, unknown> | null
}

// ── Category styling ────────────────────────────────────

const CATEGORY_STYLE: Record<string, { color: string; dotColor: string; label: string }> = {
  system:      { color: "text-[var(--accent-porter)]", dotColor: "bg-[var(--accent-porter)]", label: "System" },
  engineering: { color: "text-[var(--chart-1)]",       dotColor: "bg-[var(--chart-1)]",       label: "Engineering" },
  design:      { color: "text-[var(--chart-2)]",       dotColor: "bg-[var(--chart-2)]",       label: "Design" },
  content:     { color: "text-[var(--chart-3)]",       dotColor: "bg-[var(--chart-3)]",       label: "Content" },
  creative:    { color: "text-[var(--warning)]",       dotColor: "bg-[var(--warning)]",       label: "Creative" },
  research:    { color: "text-[var(--chart-4)]",       dotColor: "bg-[var(--chart-4)]",       label: "Research" },
  business:    { color: "text-[var(--chart-5)]",       dotColor: "bg-[var(--chart-5)]",       label: "Business" },
  support:     { color: "text-[var(--success)]",       dotColor: "bg-[var(--success)]",       label: "Support" },
  legal:       { color: "text-[var(--danger)]",        dotColor: "bg-[var(--danger)]",        label: "Legal" },
  "data-ai":   { color: "text-[var(--info)]",          dotColor: "bg-[var(--info)]",          label: "Data & AI" },
  domain:      { color: "text-[var(--chart-3)]",       dotColor: "bg-[var(--chart-3)]",       label: "Domain" },
}

const DEFAULT_STYLE = { color: "text-text2", dotColor: "bg-text2", label: "Other" }

function getCategoryStyle(cat: string) {
  return CATEGORY_STYLE[cat] ?? { ...DEFAULT_STYLE, label: cat.charAt(0).toUpperCase() + cat.slice(1) }
}

// ── Appearance parsing ──────────────────────────────────

function parseAppearance(spec: Record<string, unknown> | null | undefined): OrgNodeAgent["appearance"] {
  if (!spec) return undefined
  // Some specs have palette nested, some are flat
  const palette = (spec.palette as Record<string, string>) ?? spec
  return {
    skin: palette.skin as string | undefined,
    hair: palette.hair as string | undefined,
    eyes: palette.eyes as string | undefined,
    shirt: palette.shirt as string | undefined,
    hairStyle: (palette.hair_style ?? palette.hairStyle) as string | undefined,
  }
}

// ── Page ─────────────────────────────────────────────────

export default function OrgChartPage() {
  const navigate = useNavigate()
  const [activeCategories, setActiveCategories] = useState<Set<string> | null>(null) // null = all active
  const [hovered, setHovered] = useState<OrgNodeAgent | null>(null)

  // Fetch templates and agents
  const { data: tmplData, isLoading: tmplLoading } = useQuery({
    queryKey: ["admin", "templates"],
    queryFn: () => api<{ templates: Template[]; count: number; categories: Record<string, number> }>("/api/admin/templates"),
  })

  const { data: agentData, isLoading: agentLoading } = useQuery({
    queryKey: ["admin", "agents"],
    queryFn: () => api<{ agents: Agent[]; total: number }>("/api/admin/agents"),
  })

  // Build grouped data
  const { porter, porterInstances, teams, allCategories, totalCount } = useMemo(() => {
    const templates = tmplData?.templates ?? []
    const agents = agentData?.agents ?? []

    // Find Porter instance (master orchestrator)
    const porterAgent = agents.find(a => a.is_master === 1)
    const porterNode: OrgNodeAgent | null = porterAgent ? {
      id: porterAgent.id,
      name: porterAgent.name,
      role: porterAgent.role || "Master orchestrator",
      team: "system",
      appearance: parseAppearance(porterAgent.appearance_spec),
    } : null

    // Build instance map: template_id -> agents[]
    const instanceMap = new Map<string, Agent[]>()
    for (const a of agents) {
      if (a.is_master === 1) continue // Porter handled separately
      if (!a.template_id) continue
      const list = instanceMap.get(a.template_id) ?? []
      list.push(a)
      instanceMap.set(a.template_id, list)
    }

    // Instances of Porter (no template_id, not master) — unlikely but handle
    const porterOrphans = agents.filter(a => !a.template_id && a.is_master !== 1)

    // Group templates by category
    const catMap = new Map<string, { templates: Template[]; instanceCount: number }>()
    for (const t of templates) {
      const cat = t.category || "other"
      const entry = catMap.get(cat) ?? { templates: [], instanceCount: 0 }
      entry.templates.push(t)
      entry.instanceCount += (instanceMap.get(t.id)?.length ?? 0)
      catMap.set(cat, entry)
    }

    // Sort categories: system first, then by template count desc
    const sortedCats = [...catMap.entries()].sort((a, b) => {
      if (a[0] === "system") return -1
      if (b[0] === "system") return 1
      return b[1].templates.length - a[1].templates.length
    })

    const teamResult: {
      key: string
      style: ReturnType<typeof getCategoryStyle>
      templates: (Template & { instances: Agent[] })[]
    }[] = sortedCats.map(([cat, { templates: catTemplates }]) => ({
      key: cat,
      style: getCategoryStyle(cat),
      templates: catTemplates
        .sort((a, b) => {
          // Templates with instances first
          const aCount = instanceMap.get(a.id)?.length ?? 0
          const bCount = instanceMap.get(b.id)?.length ?? 0
          if (aCount !== bCount) return bCount - aCount
          return a.name.localeCompare(b.name)
        })
        .map(t => ({ ...t, instances: instanceMap.get(t.id) ?? [] })),
    }))

    const total = 1 + templates.length // Porter + all templates
    const allCats = sortedCats.map(([cat]) => cat)

    return {
      porter: porterNode,
      porterInstances: porterOrphans,
      teams: teamResult,
      allCategories: allCats,
      totalCount: total,
    }
  }, [tmplData, agentData])

  // Initialize active categories once data loads
  const activeCats = activeCategories ?? new Set(allCategories)

  const toggleCategory = (key: string) => {
    const next = new Set(activeCats)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setActiveCategories(next)
  }

  const visibleTeams = teams.filter(t => activeCats.has(t.key))

  const isLoading = tmplLoading || agentLoading

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
          <span className="text-xs text-text3">Loading org chart...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex-1 overflow-y-auto p-5">
        {/* Filters */}
        <div className="flex items-center gap-1.5 mb-5 flex-wrap">
          {allCategories.map(key => {
            const style = getCategoryStyle(key)
            const team = teams.find(t => t.key === key)
            const count = team?.templates.length ?? 0
            const active = activeCats.has(key)
            return (
              <button
                key={key}
                onClick={() => toggleCategory(key)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                  active ? "bg-raised text-text" : "text-text3 hover:text-text2"
                }`}
              >
                <span className={`size-2 rounded-full ${style.dotColor} ${active ? "" : "opacity-30"}`} />
                {style.label} <span className="text-text3">{count}</span>
              </button>
            )
          })}
          <span className="ml-auto text-xs text-text3">{totalCount} total</span>
        </div>

        {/* Tree */}
        <div className="flex flex-col items-center gap-3">
          {/* Porter — root */}
          {porter && (
            <>
              <OrgNode agent={porter} state="born" href={`/agents/${porter.id}`} />
              <OrgConnector direction="vertical" active length={14} team="product" />
            </>
          )}

          {/* Teams row */}
          <div className="flex items-start gap-10 justify-center flex-wrap">
            {visibleTeams.map(team => {
              const style = team.style
              // Separate templates with instances (lead) from templates without
              const withInstances = team.templates.filter(t => t.instances.length > 0)
              const withoutInstances = team.templates.filter(t => t.instances.length === 0)

              return (
                <div key={team.key} className="flex flex-col items-center gap-1.5">
                  {/* Team label */}
                  <div className="text-center max-w-[320px]">
                    <span className={`text-xs font-bold uppercase tracking-wider ${style.color}`}>
                      {style.label}
                    </span>
                    <p className="text-2xs text-text3 mt-0.5">
                      {team.templates.length} templates
                      {withInstances.length > 0 && (
                        <span className="text-text2"> &middot; {withInstances.reduce((s, t) => s + t.instances.length, 0)} active</span>
                      )}
                    </p>
                  </div>

                  {/* Templates with instances — shown prominently */}
                  {withInstances.length > 0 && (
                    <div className="flex items-start gap-2 flex-wrap justify-center mt-1">
                      {withInstances.map(tmpl => {
                        const spec = parseAppearance(tmpl.appearance_spec)
                        const node: OrgNodeAgent = {
                          id: tmpl.id,
                          name: tmpl.name,
                          role: `${tmpl.instances.length} instance${tmpl.instances.length !== 1 ? "s" : ""}`,
                          team: team.key,
                          appearance: spec,
                        }
                        return (
                          <div key={tmpl.id} className="flex flex-col items-center gap-1">
                            <div onMouseEnter={() => setHovered(node)} onMouseLeave={() => setHovered(null)}>
                              <OrgNode agent={node} state="ghost" href={`/agents/${tmpl.id}`} />
                            </div>
                            {/* Instance count badge */}
                            <span className={`text-2xs font-bold px-1.5 py-0.5 rounded-full ${style.color} bg-raised`}>
                              {tmpl.instances.length} instance{tmpl.instances.length !== 1 ? "s" : ""}
                            </span>
                            {/* Instances nested underneath */}
                            <div className="flex items-start gap-0.5 flex-wrap justify-center">
                              {tmpl.instances.map(inst => {
                                const instBorn = !!inst.soul_hash
                                const instNode: OrgNodeAgent = {
                                  id: inst.id,
                                  name: inst.name,
                                  role: inst.role || tmpl.name,
                                  team: team.key,
                                  appearance: parseAppearance(inst.appearance_spec),
                                }
                                return (
                                  <div key={inst.id} onMouseEnter={() => setHovered(instNode)} onMouseLeave={() => setHovered(null)}>
                                    <OrgNode agent={instNode} state={instBorn ? "born" : "ghost"} href={`/agents/${inst.id}`} />
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Templates without instances — ghost grid */}
                  {withoutInstances.length > 0 && (
                    <div className="flex items-start gap-0.5 flex-wrap justify-center mt-1" style={{ maxWidth: 320 }}>
                      {withoutInstances.map(tmpl => {
                        const spec = parseAppearance(tmpl.appearance_spec)
                        const node: OrgNodeAgent = {
                          id: tmpl.id,
                          name: tmpl.name,
                          role: tmpl.description,
                          team: team.key,
                          appearance: spec,
                        }
                        return (
                          <div key={tmpl.id} onMouseEnter={() => setHovered(node)} onMouseLeave={() => setHovered(null)}>
                            <OrgNode agent={node} state="ghost" href={`/agents/${tmpl.id}`} />
                          </div>
                        )
                      })}
                    </div>
                  )}
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
              {hovered.template && <span className="text-2xs text-text3 bg-raised px-1.5 py-0.5 rounded">{hovered.template}</span>}
            </div>
            <p className="text-xs text-text2 mt-1">{hovered.role}</p>
          </div>
        )}
      </div>
    </div>
  )
}
