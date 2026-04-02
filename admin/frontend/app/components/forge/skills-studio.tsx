import { Fragment, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Switch } from "~/components/ui/switch"
import { Input } from "~/components/ui/input"
import { Sparkles, Search, ChevronDown, ChevronRight, Bot, Plus, Pencil, Loader2, Package } from "lucide-react"
import { SkillCreateDialog } from "~/components/forge/skill-create-dialog"
import { SkillEditSheet } from "~/components/forge/skill-edit-sheet"

// ── Types ──────────────────────────────────────────────────

interface SkillAgent { id: string; name: string; role: string; enabled: boolean }
interface Skill {
  id: string; name: string; description: string; category: string; source: string
  enabled: boolean; visible: boolean; featured: boolean
  icon: string; color: string; short_label: string
  sort_order: number; featured_order: number
  packStatus: "ready" | "partial" | "missing"
  agents: SkillAgent[]
}
interface SkillsResponse {
  skills: Skill[]; totalSkills: number; totalAssignments: number; assignedSkills: number
  categories: Record<string, number>; sources: Record<string, number>
  status: { ready: number; partial: number; missing: number }
}

const sourceColors: Record<string, string> = {
  "porter-core": "bg-accent-porter/15 text-accent-porter",
  "porter-internal": "bg-warning/15 text-warning",
  "porter-curated": "bg-success/15 text-success",
  "runtime": "bg-blue-500/15 text-blue-400",
  "detected": "bg-text3/15 text-text3",
}

const packStatusStyles: Record<string, string> = {
  ready: "bg-success/15 text-success",
  partial: "bg-warning/15 text-warning",
  missing: "bg-text3/15 text-text3",
}

// ── Component ──────────────────────────────────────────────

export function SkillsStudio() {
  const qc = useQueryClient()
  const [search, setSearch] = useState("")
  const [activeCat, setActiveCat] = useState("all")
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
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

  const generateAll = useMutation({
    mutationFn: () =>
      api<{ generated: number; total: number }>("/api/admin/skills/builder/generate-all", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "skills"] }),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  const allSkills = data?.skills ?? []
  const categories = data?.categories ?? {}
  const sources = data?.sources ?? {}
  const statusCounts = data?.status ?? { ready: 0, partial: 0, missing: 0 }
  const missingCount = statusCounts.missing

  const categoryList = Object.keys(categories).sort()

  let skills = allSkills
  if (activeCat !== "all") skills = skills.filter(s => s.category === activeCat)
  if (search) {
    const q = search.toLowerCase()
    skills = skills.filter(s =>
      s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q) || s.category.toLowerCase().includes(q)
    )
  }

  function openEdit(skill: Skill, e: React.MouseEvent) {
    e.stopPropagation()
    setEditSkill(skill)
    setEditOpen(true)
  }

  return (
    <div className="space-y-2">
      {/* Stats + actions + search */}
      <div className="flex items-center gap-2">
        <Sparkles className="size-3 text-accent-porter" />
        <span className="text-2xs font-semibold uppercase tracking-wide text-text3">
          {data?.totalSkills ?? 0} skills · {data?.assignedSkills ?? 0} assigned · {data?.totalAssignments ?? 0} deployments
        </span>
        <div className="ml-auto flex items-center gap-2">
          {Object.entries(sources).map(([src, cnt]) => (
            <Badge key={src} className={`text-2xs border-0 ${sourceColors[src] || "bg-text3/15 text-text3"}`}>
              {src} ({cnt})
            </Badge>
          ))}
        </div>
        {missingCount > 0 && (
          <Button
            size="xs"
            variant="outline"
            onClick={() => generateAll.mutate()}
            disabled={generateAll.isPending}
          >
            {generateAll.isPending ? (
              <Loader2 className="size-3 mr-1 animate-spin" />
            ) : (
              <Package className="size-3 mr-1" />
            )}
            Generate Missing ({missingCount})
          </Button>
        )}
        <Button size="xs" onClick={() => setCreateOpen(true)}>
          <Plus className="size-3 mr-1" />
          New
        </Button>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-text3" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter..."
            className="h-7 w-[150px] bg-raised border-border pl-7 text-xs"
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => setActiveCat("all")}
          className={`rounded-md px-2 py-1 text-2xs font-medium transition-colors ${
            activeCat === "all" ? "bg-accent-porter/15 text-accent-porter" : "text-text3 hover:text-text2 hover:bg-raised"
          }`}
        >all ({allSkills.length})</button>
        {Object.entries(categories).sort(([,a],[,b]) => b - a).map(([cat, cnt]) => (
          <button
            key={cat}
            onClick={() => setActiveCat(cat)}
            className={`rounded-md px-2 py-1 text-2xs font-medium transition-colors ${
              activeCat === cat ? "bg-accent-porter/15 text-accent-porter" : "text-text3 hover:text-text2 hover:bg-raised"
            }`}
          >{cat} ({cnt})</button>
        ))}
      </div>

      {/* Skills table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/50 bg-surface text-left">
              <th className="w-5 px-2 py-1.5" />
              <th className="px-2 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Skill</th>
              <th className="px-2 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Description</th>
              <th className="px-2 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Source</th>
              <th className="px-2 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Pack</th>
              <th className="px-2 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3 text-right">Agents</th>
              <th className="w-8 px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {skills.map(skill => {
              const isExpanded = expandedSkill === skill.id
              const enabledCount = skill.agents.filter(a => a.enabled).length
              return (
                <Fragment key={skill.id}>
                  <tr
                    onClick={() => setExpandedSkill(isExpanded ? null : skill.id)}
                    className="border-b border-border/20 last:border-0 cursor-pointer hover:bg-surface/60 transition-colors"
                  >
                    <td className="px-2 py-1">
                      {skill.agents.length > 0 ? (
                        isExpanded ? <ChevronDown className="size-3 text-text3" /> : <ChevronRight className="size-3 text-text3" />
                      ) : <span className="size-3" />}
                    </td>
                    <td className="px-2 py-1 text-xs font-bold text-text whitespace-nowrap">{skill.name}</td>
                    <td className="px-2 py-1 text-2xs text-text3 truncate max-w-[300px]">{skill.description}</td>
                    <td className="px-2 py-1">
                      <Badge className={`text-2xs border-0 ${sourceColors[skill.source] || "bg-text3/15 text-text3"}`}>
                        {skill.source}
                      </Badge>
                    </td>
                    <td className="px-2 py-1">
                      <Badge className={`text-2xs border-0 ${packStatusStyles[skill.packStatus] || "bg-text3/15 text-text3"}`}>
                        {skill.packStatus}
                      </Badge>
                    </td>
                    <td className="px-2 py-1 text-right">
                      {skill.agents.length > 0 ? (
                        <span className="text-xs text-text2">{enabledCount}/{skill.agents.length}</span>
                      ) : (
                        <span className="text-2xs text-text3">--</span>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      <button
                        onClick={(e) => openEdit(skill, e)}
                        className="rounded p-1 text-text3 hover:text-text hover:bg-raised transition-colors"
                        title="Edit skill"
                      >
                        <Pencil className="size-3" />
                      </button>
                    </td>
                  </tr>
                  {isExpanded && skill.agents.length > 0 && (
                    <tr key={`${skill.id}-agents`}>
                      <td colSpan={7} className="bg-surface/50 border-b border-border/20">
                        <div className="px-8 py-1">
                          {skill.agents.map(a => (
                            <div key={a.id} className="flex items-center gap-2 py-0.5">
                              <Bot className="size-2.5 text-text3" />
                              <span className="text-2xs font-medium text-text flex-1">{a.name}</span>
                              <span className="text-2xs text-text3 truncate max-w-[200px]">{a.role}</span>
                              <Switch
                                checked={a.enabled}
                                onCheckedChange={() => toggleSkill.mutate({ personaId: a.id, skillName: skill.id })}
                                className="scale-[0.65]"
                              />
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {skills.length === 0 && (
        <div className="py-6 text-center text-xs text-text3">{search ? "No skills match" : "No skills"}</div>
      )}

      {/* Dialogs */}
      <SkillCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        categories={categoryList}
      />
      <SkillEditSheet
        skill={editSkill}
        open={editOpen}
        onOpenChange={setEditOpen}
        categories={categoryList}
      />
    </div>
  )
}
