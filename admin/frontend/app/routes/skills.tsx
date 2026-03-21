import { useState } from "react"
import { AdminShell } from "~/components/layout/admin-shell"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Switch } from "~/components/ui/switch"
import { Input } from "~/components/ui/input"
import { Sparkles, Search, ChevronDown, ChevronRight } from "lucide-react"

interface SkillAgent {
  id: string
  name: string
  role: string
  enabled: boolean
}

interface Skill {
  name: string
  agents: SkillAgent[]
}

interface SkillsResponse {
  skills: Skill[]
  totalSkills: number
  totalAssignments: number
}

function SkillsContent() {
  const qc = useQueryClient()
  const [search, setSearch] = useState("")
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "skills"],
    queryFn: () => api<SkillsResponse>("/api/admin/skills"),
  })

  const toggleSkill = useMutation({
    mutationFn: ({ personaId, skillName }: { personaId: string; skillName: string }) =>
      api(`/api/admin/skills/${personaId}/${skillName}/toggle`, { method: "PUT" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "skills"] }),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  const allSkills = data?.skills ?? []
  const skills = search
    ? allSkills.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.agents.some(a => a.name.toLowerCase().includes(search.toLowerCase()))
      )
    : allSkills

  return (
    <div className="space-y-2">
      {/* Header + search */}
      <div className="flex items-center gap-2">
        <Sparkles className="size-3 text-accent-porter" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">
          {data?.totalSkills ?? 0} skills · {data?.totalAssignments ?? 0} assignments
        </span>
        <div className="relative ml-auto">
          <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-text3" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter skills..."
            className="h-7 w-[180px] bg-raised border-border pl-7 text-xs"
          />
        </div>
      </div>

      {/* Skills table */}
      <div className="rounded-xl border border-border overflow-hidden">
        {skills.map(skill => {
          const isExpanded = expandedSkill === skill.name
          const enabledCount = skill.agents.filter(a => a.enabled).length
          return (
            <div key={skill.name} className="border-b border-border/30 last:border-0">
              <button
                onClick={() => setExpandedSkill(isExpanded ? null : skill.name)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface/80 transition-colors"
              >
                {isExpanded
                  ? <ChevronDown className="size-3 text-text3 shrink-0" />
                  : <ChevronRight className="size-3 text-text3 shrink-0" />
                }
                <span className="text-xs font-medium text-text flex-1">{skill.name}</span>
                <Badge className="text-[10px] bg-accent-porter/15 text-accent-porter border-0">
                  {enabledCount}/{skill.agents.length}
                </Badge>
              </button>
              {isExpanded && (
                <div className="bg-surface/50 border-t border-border/30">
                  {skill.agents.map(a => (
                    <div key={a.id} className="flex items-center gap-2 px-3 py-1 pl-8 border-b border-border/20 last:border-0">
                      <span className="text-[11px] font-medium text-text flex-1">{a.name}</span>
                      <span className="text-[10px] text-text3 truncate max-w-[200px]">{a.role}</span>
                      <Switch
                        checked={a.enabled}
                        onCheckedChange={() => toggleSkill.mutate({ personaId: a.id, skillName: skill.name })}
                        className="scale-75"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {skills.length === 0 && (
        <div className="py-6 text-center text-xs text-text3">
          {search ? "No skills match" : "No skills found"}
        </div>
      )}
    </div>
  )
}

export default function SkillsPage() {
  return (
    <AdminShell>
      <SkillsContent />
    </AdminShell>
  )
}
