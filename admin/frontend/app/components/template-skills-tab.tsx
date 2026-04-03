import { useState, useRef, useEffect } from "react"
import { Link } from "react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card, CardContent } from "~/components/ui/card"
import { Switch } from "~/components/ui/switch"
import { Input } from "~/components/ui/input"
import { SkillQualityBadge, type QualityTier } from "~/components/skill-quality-badge"
import { SkillEffectivenessBar } from "~/components/skill-effectiveness-bar"
import {
  ChevronUp, ChevronDown, X, Lock, Search, Zap, Plus,
} from "lucide-react"

// ── Types ────────────────────────────────────────────────

interface TemplateSkillRow {
  skill_id: string
  sort_order: number
  is_mandatory: number
  assignment_rationale: string
  name: string
  description: string
  category: string
  quality_tier: string
  quality_score: number
}

interface TemplateSkillsResponse {
  template_id: string
  skills: TemplateSkillRow[]
}

interface AllSkillRow {
  id: string
  name: string
  description: string
  category: string
  quality_tier: string | null
}

interface AllSkillsResponse {
  skills: AllSkillRow[]
}

interface EffectivenessSkillRow {
  skill_id: string
  skill_name: string
  times_selected: number
  positive_count: number
  negative_count: number
  effectiveness_score: number | null
}

interface EffectivenessResponse {
  template_id: string
  skills: EffectivenessSkillRow[]
}

interface PreviewCandidate {
  skill_id: string
  name: string
  score: number
  reason: string
  is_mandatory: number
}

interface PreviewResponse {
  candidates: PreviewCandidate[]
  selected: PreviewCandidate[]
  prompt: string
}

interface TemplateSkillsTabProps {
  templateId: string
}

// ── Component ────────────────────────────────────────────

export function TemplateSkillsTab({ templateId }: TemplateSkillsTabProps) {
  const qc = useQueryClient()

  // ── Editing rationale state ──
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null)
  const [editingRationale, setEditingRationale] = useState<string>("")

  // ── Add skill dropdown state ──
  const [searchText, setSearchText] = useState("")
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // ── Preview state ──
  const [previewPrompt, setPreviewPrompt] = useState("")
  const [previewResult, setPreviewResult] = useState<PreviewResponse | null>(null)

  // ── Close dropdown on outside click ──
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // ── Queries ──

  const { data: assignedData, isLoading: assignedLoading } = useQuery({
    queryKey: ["template-skills", templateId],
    queryFn: () => api<TemplateSkillsResponse>(`/api/admin/templates/${templateId}/skills`),
    retry: false,
  })

  const { data: allSkillsData } = useQuery({
    queryKey: ["all-skills"],
    queryFn: () => api<AllSkillsResponse>("/api/admin/skills"),
    retry: false,
    staleTime: 60_000,
  })

  const { data: effectivenessData } = useQuery({
    queryKey: ["template-skill-effectiveness", templateId],
    queryFn: () => api<EffectivenessResponse>(`/api/admin/templates/${templateId}/skill-effectiveness`),
    retry: false,
  })

  const skills = assignedData?.skills ?? []
  const allSkills = allSkillsData?.skills ?? []
  const assignedIds = new Set(skills.map(s => s.skill_id))

  // ── Mutations ──

  const invalidateTemplateSkills = () =>
    qc.invalidateQueries({ queryKey: ["template-skills", templateId] })

  const attachMutation = useMutation({
    mutationFn: (skillId: string) =>
      api(`/api/admin/templates/${templateId}/skills`, {
        method: "POST",
        json: { skill_id: skillId },
      }),
    onSuccess: invalidateTemplateSkills,
  })

  const detachMutation = useMutation({
    mutationFn: (skillId: string) =>
      api(`/api/admin/templates/${templateId}/skills/${skillId}`, { method: "DELETE" }),
    onSuccess: invalidateTemplateSkills,
  })

  const updateMutation = useMutation({
    mutationFn: ({ skillId, patch }: { skillId: string; patch: { is_mandatory?: number; assignment_rationale?: string; sort_order?: number } }) =>
      api(`/api/admin/templates/${templateId}/skills/${skillId}`, {
        method: "PATCH",
        json: patch,
      }),
    onSuccess: invalidateTemplateSkills,
  })

  const previewMutation = useMutation({
    mutationFn: (prompt: string) =>
      api<PreviewResponse>(`/api/admin/templates/${templateId}/skills-preview`, {
        method: "POST",
        json: { prompt },
      }),
    onSuccess: (data) => setPreviewResult(data),
  })

  // ── Handlers ──

  function handleMandatoryToggle(skill: TemplateSkillRow, checked: boolean) {
    updateMutation.mutate({ skillId: skill.skill_id, patch: { is_mandatory: checked ? 1 : 0 } })
  }

  function handleSortUp(index: number) {
    if (index === 0) return
    const curr = skills[index]
    const prev = skills[index - 1]
    // Swap sort_orders
    updateMutation.mutate({ skillId: curr.skill_id, patch: { sort_order: prev.sort_order } })
    updateMutation.mutate({ skillId: prev.skill_id, patch: { sort_order: curr.sort_order } })
  }

  function handleSortDown(index: number) {
    if (index === skills.length - 1) return
    const curr = skills[index]
    const next = skills[index + 1]
    updateMutation.mutate({ skillId: curr.skill_id, patch: { sort_order: next.sort_order } })
    updateMutation.mutate({ skillId: next.skill_id, patch: { sort_order: curr.sort_order } })
  }

  function handleRationaleEdit(skill: TemplateSkillRow) {
    setEditingSkillId(skill.skill_id)
    setEditingRationale(skill.assignment_rationale ?? "")
  }

  function handleRationaleSave(skillId: string) {
    updateMutation.mutate({ skillId, patch: { assignment_rationale: editingRationale } })
    setEditingSkillId(null)
  }

  function handleAttach(skillId: string) {
    attachMutation.mutate(skillId)
    setSearchText("")
    setDropdownOpen(false)
  }

  // ── Filtered skills for add dropdown ──
  const filteredSkills = allSkills
    .filter(s => !assignedIds.has(s.id))
    .filter(s => {
      if (!searchText.trim()) return true
      const q = searchText.toLowerCase()
      return s.name.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q)
    })
    .slice(0, 8)

  // ── Render ──

  return (
    <div className="flex flex-col gap-5 pb-6">

      {/* ─── Section 1: Assigned Skills Table ─── */}
      <Card>
        <div className="flex items-center px-3 py-2 border-b border-border bg-muted/50">
          <span className="text-2xs font-semibold uppercase tracking-wide text-text3">Assigned Skills</span>
          <span className="ml-2 text-2xs text-text3">({skills.length})</span>
        </div>

        {assignedLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="size-5 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
          </div>
        ) : skills.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-text3">
            No skills assigned to this template yet.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50 bg-muted/50 text-left">
                <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3 w-6">#</th>
                <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Skill</th>
                <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3 w-[180px]">Rationale</th>
                <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3 w-16 text-center">Req</th>
                <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3 w-16 text-center">Order</th>
                <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3 w-8" />
              </tr>
            </thead>
            <tbody>
              {skills.map((skill, idx) => (
                <tr key={skill.skill_id} className="border-b border-border/20 last:border-0">
                  <td className="px-3 py-2 text-2xs text-text3">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {skill.is_mandatory === 1 && (
                        <Lock className="size-3 text-warning shrink-0" />
                      )}
                      <Link
                        to={`/skills/${skill.skill_id}/pack`}
                        className="text-xs font-medium text-foreground hover:text-accent-porter hover:underline transition-colors"
                      >
                        {skill.name}
                      </Link>
                      <SkillQualityBadge tier={skill.quality_tier as QualityTier} />
                    </div>
                    {skill.description && (
                      <p className="text-2xs text-text3 truncate max-w-[240px] mt-0.5">{skill.description}</p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editingSkillId === skill.skill_id ? (
                      <Input
                        autoFocus
                        value={editingRationale}
                        onChange={e => setEditingRationale(e.target.value)}
                        onBlur={() => handleRationaleSave(skill.skill_id)}
                        onKeyDown={e => {
                          if (e.key === "Enter") handleRationaleSave(skill.skill_id)
                          if (e.key === "Escape") setEditingSkillId(null)
                        }}
                        className="h-6 text-2xs px-1.5"
                      />
                    ) : (
                      <span
                        className="text-2xs text-text3 cursor-pointer hover:text-foreground transition-colors"
                        title="Click to edit rationale"
                        onClick={() => handleRationaleEdit(skill)}
                      >
                        {skill.assignment_rationale || <span className="italic opacity-50">add rationale...</span>}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Switch
                      checked={skill.is_mandatory === 1}
                      onCheckedChange={checked => handleMandatoryToggle(skill, checked)}
                      className="scale-75"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-0.5 justify-center">
                      <button
                        className="flex items-center justify-center size-5 rounded text-text3 hover:text-foreground hover:bg-raised disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        onClick={() => handleSortUp(idx)}
                        disabled={idx === 0}
                        title="Move up"
                      >
                        <ChevronUp className="size-3" />
                      </button>
                      <button
                        className="flex items-center justify-center size-5 rounded text-text3 hover:text-foreground hover:bg-raised disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        onClick={() => handleSortDown(idx)}
                        disabled={idx === skills.length - 1}
                        title="Move down"
                      >
                        <ChevronDown className="size-3" />
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      className="flex items-center justify-center size-5 rounded text-text3 hover:text-danger hover:bg-danger/10 transition-colors"
                      onClick={() => detachMutation.mutate(skill.skill_id)}
                      title="Remove skill"
                    >
                      <X className="size-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* ─── Section 2: Add Skill ─── */}
      <Card>
        <div className="flex items-center px-3 py-2 border-b border-border bg-muted/50">
          <Plus className="size-3 text-text3 mr-1.5" />
          <span className="text-2xs font-semibold uppercase tracking-wide text-text3">Add Skill</span>
        </div>
        <CardContent className="p-3">
          <div className="relative" ref={dropdownRef}>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-text3 pointer-events-none" />
              <Input
                placeholder="Search skills to add..."
                value={searchText}
                onChange={e => { setSearchText(e.target.value); setDropdownOpen(true) }}
                onFocus={() => setDropdownOpen(true)}
                className="h-8 text-xs pl-7"
              />
            </div>
            {dropdownOpen && filteredSkills.length > 0 && (
              <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-background border border-border rounded-md shadow-lg overflow-hidden">
                {filteredSkills.map(skill => (
                  <button
                    key={skill.id}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-raised transition-colors text-left"
                    onClick={() => handleAttach(skill.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-foreground">{skill.name}</span>
                        <SkillQualityBadge tier={skill.quality_tier as QualityTier} />
                      </div>
                      {skill.description && (
                        <p className="text-2xs text-text3 truncate">{skill.description}</p>
                      )}
                    </div>
                    {skill.category && (
                      <span className="text-2xs text-text3 shrink-0">{skill.category}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {dropdownOpen && searchText && filteredSkills.length === 0 && (
              <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-background border border-border rounded-md shadow-sm px-3 py-2">
                <p className="text-xs text-text3">No skills found matching "{searchText}"</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ─── Section 3: Skill Effectiveness ─── */}
      <Card>
        <div className="flex items-center px-3 py-2 border-b border-border bg-muted/50">
          <span className="text-2xs font-semibold uppercase tracking-wide text-text3">Skill Effectiveness</span>
          <span className="ml-2 text-2xs text-text3">— aggregated across all spawned agents</span>
        </div>
        <CardContent className="p-3">
          {!effectivenessData?.skills?.length ? (
            <p className="text-xs text-text3">No feedback data yet</p>
          ) : (
            <div className="space-y-2">
              {effectivenessData.skills.map(s => (
                <div key={s.skill_id} className="flex items-center justify-between py-1">
                  <span className="text-xs text-text2 truncate mr-4 flex-1">{s.skill_name || s.skill_id}</span>
                  <SkillEffectivenessBar
                    positive={s.positive_count}
                    negative={s.negative_count}
                    score={s.effectiveness_score}
                    timesSelected={s.times_selected}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Section 4: Preview Auto-Detection ─── */}
      <Card>
        <div className="flex items-center px-3 py-2 border-b border-border bg-muted/50">
          <Zap className="size-3 text-text3 mr-1.5" />
          <span className="text-2xs font-semibold uppercase tracking-wide text-text3">Preview Skill Selection</span>
        </div>
        <CardContent className="p-3 flex flex-col gap-3">
          <div className="flex gap-2">
            <Input
              placeholder="Enter a sample task prompt to preview skill selection..."
              value={previewPrompt}
              onChange={e => setPreviewPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && previewPrompt.trim()) previewMutation.mutate(previewPrompt.trim()) }}
              className="h-8 text-xs flex-1"
            />
            <Button
              size="sm"
              className="h-8 text-xs gap-1 shrink-0"
              disabled={!previewPrompt.trim() || previewMutation.isPending}
              onClick={() => previewMutation.mutate(previewPrompt.trim())}
            >
              <Zap className="size-3" />
              {previewMutation.isPending ? "Running..." : "Preview"}
            </Button>
          </div>

          {previewMutation.isError && (
            <p className="text-xs text-danger">Preview failed. Check the prompt and try again.</p>
          )}

          {previewResult && (
            <div className="flex flex-col gap-3">
              {/* Selected */}
              {previewResult.selected.length > 0 && (
                <div>
                  <p className="text-2xs font-semibold text-success mb-1.5 uppercase tracking-wide">
                    Selected ({previewResult.selected.length})
                  </p>
                  <div className="flex flex-col gap-1">
                    {previewResult.selected.map(c => (
                      <div key={c.skill_id} className="border-l-2 border-success pl-3 py-1 rounded-r bg-success/5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-foreground">{c.name}</span>
                          {c.is_mandatory === 1 && (
                            <Badge className="text-2xs bg-warning/15 text-warning border-0 gap-0.5">
                              <Lock className="size-2.5" /> mandatory
                            </Badge>
                          )}
                          <span className="text-2xs text-text3 ml-auto">score: {c.score}</span>
                        </div>
                        {c.reason && <p className="text-2xs text-text3 mt-0.5">{c.reason}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Candidates (not selected) */}
              {previewResult.candidates.length > 0 && (
                <div>
                  <p className="text-2xs font-semibold text-text3 mb-1.5 uppercase tracking-wide">
                    Remaining candidates ({previewResult.candidates.length})
                  </p>
                  <div className="flex flex-col gap-1">
                    {previewResult.candidates.map(c => (
                      <div key={c.skill_id} className="pl-3 py-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-text2">{c.name}</span>
                          <span className="text-2xs text-text3 ml-auto">score: {c.score}</span>
                        </div>
                        {c.reason && <p className="text-2xs text-text3 mt-0.5">{c.reason}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {previewResult.selected.length === 0 && previewResult.candidates.length === 0 && (
                <p className="text-xs text-text3">No skills matched this prompt.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
