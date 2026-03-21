import { useState } from "react"
import { useParams, Link } from "react-router"
import { AdminShell } from "~/components/layout/admin-shell"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Switch } from "~/components/ui/switch"
import { PixelPortrait } from "~/components/pixel-portrait"
import {
  ArrowLeft, Shield, Save, Sparkles, FolderKanban,
  FileText, MessageSquare, Zap,
} from "lucide-react"

interface Skill { name: string; enabled: boolean; assignedAt: number }
interface Project { project_id: string; project_name: string; role: string }

interface AgentDetail {
  persona: Record<string, unknown>
  files: Record<string, string | null>
  skills: Skill[]
  projects: Project[]
  metrics: { recentMessages: number; signalCount: number }
}

const FILE_TABS = [
  { id: "SOUL.md", label: "Soul", icon: Shield },
  { id: "IDENTITY.md", label: "Identity", icon: FileText },
  { id: "ROLE_CARD.md", label: "Role Card", icon: FileText },
  { id: "SKILLS.md", label: "Skills", icon: Sparkles },
  { id: "DELIVERABLES.md", label: "Deliverables", icon: FileText },
  { id: "USER.md", label: "User", icon: FileText },
  { id: "MEMORY.md", label: "Memory", icon: MessageSquare },
]

function AgentDetailContent() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<string>("SOUL.md")
  const [editContent, setEditContent] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "agents", id],
    queryFn: () => api<AgentDetail>(`/api/admin/agents/${id}`),
    enabled: !!id,
  })

  const saveMutation = useMutation({
    mutationFn: async ({ file, content }: { file: string; content: string }) =>
      api(`/api/admin/agents/${id}/files/${file}`, { method: "PUT", json: { content } }),
    onSuccess: () => {
      setSaving(false)
      setEditContent(null)
      qc.invalidateQueries({ queryKey: ["admin", "agents", id] })
    },
    onError: () => setSaving(false),
  })

  const toggleSkill = useMutation({
    mutationFn: (skillName: string) =>
      api(`/api/admin/skills/${id}/${skillName}/toggle`, { method: "PUT" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "agents", id] }),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-danger">Agent not found</p>
        <Link to="/agents" className="text-xs text-accent-porter hover:underline mt-2 inline-block">Back to agents</Link>
      </div>
    )
  }

  const p = data.persona
  const files = data.files
  const skills = data.skills
  const projects = data.projects
  const metrics = data.metrics

  let spec: Record<string, string> = {}
  try { spec = typeof p.appearance_spec === 'string' ? JSON.parse(p.appearance_spec as string) : (p.appearance_spec as Record<string, string>) || {} } catch {}
  const palette = spec.palette ?? spec

  const currentContent = editContent ?? files[activeTab] ?? ""
  const showEditor = activeTab !== "skills-tab" && activeTab !== "deploy-tab"

  return (
    <div className="flex flex-col gap-2 h-[calc(100vh-var(--header-height)-2rem)]">
      {/* Header */}
      <div className="flex items-center gap-2 shrink-0">
        <Link to="/agents" className="flex items-center gap-1 text-xs text-text3 hover:text-accent-porter transition-colors">
          <ArrowLeft className="size-3" /> Agents
        </Link>
      </div>

      {/* Hero */}
      <div className="rounded-xl border border-border bg-surface p-3 shrink-0">
        <div className="flex items-center gap-3">
          <PixelPortrait
            hair={palette.hair || "#2c1b18"}
            skin={palette.skin || "#f1c27d"}
            eyes={palette.eyes || "#1a1a2e"}
            shirt={palette.shirt || "#64748b"}
            hairStyle="short"
            size="md"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-text">{p.name as string}</h2>
              {p.is_system ? <Shield className="size-3 text-accent-porter" /> : null}
              {p.agent_group && <Badge className="text-[10px] bg-accent-porter/15 text-accent-porter border-0">{p.agent_group as string}</Badge>}
              <Badge className="text-[10px] bg-text3/15 text-text3 border-0">{p.dispatch_mode as string}</Badge>
            </div>
            <p className="text-xs text-text3 mt-0.5 truncate">{p.role as string}</p>
            <div className="flex items-center gap-3 mt-1 text-[10px] text-text3">
              <span className="flex items-center gap-1"><Sparkles className="size-2.5" />{skills.length} skills</span>
              <span className="flex items-center gap-1"><FolderKanban className="size-2.5" />{projects.length} projects</span>
              <span className="flex items-center gap-1"><MessageSquare className="size-2.5" />{metrics.recentMessages} msgs (7d)</span>
              <span className="flex items-center gap-1"><Zap className="size-2.5" />{metrics.signalCount} signals</span>
              {p.owner && <span>owner: {p.owner as string}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-border shrink-0 overflow-x-auto">
        {FILE_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setEditContent(null) }}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              activeTab === tab.id ? "border-accent-porter text-accent-porter" : "border-transparent text-text3 hover:text-text2"
            }`}
          >
            <tab.icon className="size-2.5" />
            {tab.label}
          </button>
        ))}
        <button
          onClick={() => { setActiveTab("skills-tab"); setEditContent(null) }}
          className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
            activeTab === "skills-tab" ? "border-accent-porter text-accent-porter" : "border-transparent text-text3 hover:text-text2"
          }`}
        >
          <Sparkles className="size-2.5" /> Skills ({skills.length})
        </button>
        <button
          onClick={() => { setActiveTab("deploy-tab"); setEditContent(null) }}
          className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
            activeTab === "deploy-tab" ? "border-accent-porter text-accent-porter" : "border-transparent text-text3 hover:text-text2"
          }`}
        >
          <FolderKanban className="size-2.5" /> Deployments ({projects.length})
        </button>
      </div>

      {/* Content — fills remaining height */}
      <div className="flex-1 min-h-0">
        {activeTab === "skills-tab" ? (
          <div className="h-full overflow-y-auto rounded-xl border border-border overflow-hidden">
            {skills.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-text3">No skills assigned</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50 bg-surface text-left">
                    <th className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text3">Skill</th>
                    <th className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text3 text-right">Enabled</th>
                  </tr>
                </thead>
                <tbody>
                  {skills.map(s => (
                    <tr key={s.name} className="border-b border-border/20 last:border-0">
                      <td className="px-3 py-1 text-xs font-medium text-text">{s.name}</td>
                      <td className="px-3 py-1 text-right">
                        <Switch
                          checked={s.enabled}
                          onCheckedChange={() => toggleSkill.mutate(s.name)}
                          className="scale-75"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : activeTab === "deploy-tab" ? (
          <div className="h-full overflow-y-auto rounded-xl border border-border overflow-hidden">
            {projects.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-text3">Not deployed to any projects</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50 bg-surface text-left">
                    <th className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text3">Project</th>
                    <th className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text3">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map(pr => (
                    <tr key={pr.project_id} className="border-b border-border/20 last:border-0">
                      <td className="px-3 py-1 text-xs font-medium text-text">{pr.project_name || pr.project_id}</td>
                      <td className="px-3 py-1 text-xs text-text3">{pr.role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="h-full flex flex-col rounded-xl border border-border bg-surface overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-background/50 shrink-0">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">{activeTab}</span>
              <button
                onClick={() => {
                  setSaving(true)
                  saveMutation.mutate({ file: activeTab, content: editContent ?? files[activeTab] ?? "" })
                }}
                disabled={saving || editContent === null}
                className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                  editContent !== null ? "bg-accent-porter text-white hover:bg-accent-porter/80" : "bg-raised text-text3 cursor-not-allowed"
                }`}
              >
                <Save className="size-2.5" />
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
            <textarea
              value={currentContent}
              onChange={e => setEditContent(e.target.value)}
              className="flex-1 w-full bg-background p-3 font-mono text-xs text-text placeholder:text-text3 focus:outline-none resize-none"
              spellCheck={false}
              placeholder={`No ${activeTab} file yet. Start typing to create one.`}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default function AgentDetailPage() {
  return (
    <AdminShell>
      <AgentDetailContent />
    </AdminShell>
  )
}
