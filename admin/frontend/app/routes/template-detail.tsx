import { useState } from "react"
import { useParams, Link } from "react-router"
import { AdminShell } from "~/components/layout/admin-shell"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { PixelPortrait } from "~/components/pixel-portrait"
import {
  Shield, MessageSquare, FileText, Save, Sparkles,
  Eye, X,
} from "lucide-react"

interface TemplateDetail {
  id: string; name: string; cat: string; desc: string
  soul: string[]; mission: string; inputs: string[]; outputs: string[]
  authority: string[]; tags: string[]; archetype: string
  appearance_spec: Record<string, string>; communication_style: string
  files: Record<string, string | null>
}

const archetypeColors: Record<string, string> = {
  navigator: "bg-blue-500/15 text-blue-400",
  operator: "bg-emerald-500/15 text-emerald-400",
  maker: "bg-purple-500/15 text-purple-400",
  auditor: "bg-amber-500/15 text-amber-400",
  warden: "bg-red-500/15 text-red-400",
}

const FILE_TABS = [
  { id: "SOUL.md", label: "Soul", icon: Shield },
  { id: "IDENTITY.md", label: "Identity", icon: FileText },
  { id: "ROLE_CARD.md", label: "Role Card", icon: FileText },
  { id: "SKILLS.md", label: "Skills", icon: Sparkles },
  { id: "DELIVERABLES.md", label: "Deliverables", icon: FileText },
  { id: "MISSION.md", label: "Mission", icon: FileText },
]

function TemplateDetailContent() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<string>("SOUL.md")
  const [editContent, setEditContent] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showWhoIs, setShowWhoIs] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "templates", "detail", id],
    queryFn: () => api<TemplateDetail>(`/api/admin/templates/${id}`),
    enabled: !!id,
  })

  const saveMutation = useMutation({
    mutationFn: async ({ file, content }: { file: string; content: string }) =>
      api(`/api/admin/templates/${id}/files/${file}`, { method: "PUT", json: { content } }),
    onSuccess: () => { setSaving(false); setEditContent(null); qc.invalidateQueries({ queryKey: ["admin", "templates", "detail", id] }) },
    onError: () => setSaving(false),
  })

  if (isLoading) return <div className="flex items-center justify-center py-20"><div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" /></div>
  if (error || !data) return <div className="py-12 text-center"><p className="text-xs text-danger">Template not found</p><Link to="/templates" className="text-xs text-accent-porter hover:underline mt-2 inline-block">Back</Link></div>

  const t = data
  const spec = t.appearance_spec || {}
  const files = t.files || {}
  const currentContent = editContent ?? files[activeTab] ?? ""

  return (
    <div className="flex flex-col gap-2 h-[calc(100vh-var(--header-height)-2rem)]">
      {/* Hero */}
      <div className="rounded-xl border border-border bg-surface p-3 shrink-0">
        <div className="flex items-center gap-3">
          <PixelPortrait
            hair={spec.hair || "#2c1b18"} skin={spec.skin || "#f1c27d"}
            eyes={spec.eyes || "#1a1a2e"} shirt={spec.shirt || "#64748b"}
            hairStyle={(["short","long","mohawk","bald","parted","buzz","curly","ponytail"].includes(spec.hair_style) ? spec.hair_style : "short") as "short" | "long" | "mohawk" | "bald" | "parted" | "buzz" | "curly" | "ponytail"}
            size="md"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-text">{t.name}</h2>
              <Badge className={`text-[10px] border-0 ${archetypeColors[t.archetype] || "bg-text3/15 text-text3"}`}>{t.archetype}</Badge>
              <Badge className="text-[10px] bg-text3/15 text-text3 border-0">{t.cat}</Badge>
            </div>
            <p className="text-xs text-text3 mt-0.5">{t.desc}</p>
          </div>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1 shrink-0" onClick={() => setShowWhoIs(true)}>
            <Eye className="size-3" /> Who Is
          </Button>
        </div>
      </div>

      {/* Who Is popup — shows what users see */}
      {showWhoIs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowWhoIs(false)}>
          <div className="w-[420px] max-h-[80vh] overflow-y-auto rounded-xl border border-border bg-surface p-4 shadow-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-text">Who Is {t.name}?</span>
              <button onClick={() => setShowWhoIs(false)} className="text-text3 hover:text-text"><X className="size-3.5" /></button>
            </div>
            <div className="flex items-center gap-3 mb-3">
              <PixelPortrait
                hair={spec.hair || "#2c1b18"} skin={spec.skin || "#f1c27d"}
                eyes={spec.eyes || "#1a1a2e"} shirt={spec.shirt || "#64748b"}
                hairStyle={(["short","long","mohawk","bald","parted","buzz","curly","ponytail"].includes(spec.hair_style) ? spec.hair_style : "short") as "short" | "long" | "mohawk" | "bald" | "parted" | "buzz" | "curly" | "ponytail"}
                size="lg"
              />
              <div>
                <p className="text-sm font-bold text-text">{t.name}</p>
                <p className="text-xs text-text3">{t.desc}</p>
                <Badge className={`text-[10px] border-0 mt-1 ${archetypeColors[t.archetype] || "bg-text3/15 text-text3"}`}>{t.archetype}</Badge>
              </div>
            </div>
            {t.soul?.length > 0 && (
              <div className="mb-2">
                <p className="text-[11px] font-semibold text-text3 mb-1">Soul</p>
                <div className="flex flex-wrap gap-1">{t.soul.map((s, i) => <span key={i} className="rounded bg-raised px-1.5 py-0.5 text-[11px] text-text2">{s}</span>)}</div>
              </div>
            )}
            {t.mission && (
              <div className="mb-2">
                <p className="text-[11px] font-semibold text-text3 mb-1">Mission</p>
                <p className="text-xs text-text2 leading-relaxed">{t.mission}</p>
              </div>
            )}
            {t.communication_style && (
              <div className="mb-2">
                <p className="text-[11px] font-semibold text-text3 mb-1">Communication</p>
                <p className="text-xs text-text2 italic">{t.communication_style}</p>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 mt-2">
              {t.inputs?.length > 0 && <div><p className="text-[10px] font-semibold text-text3 mb-0.5">Inputs</p>{t.inputs.map((v,i) => <p key={i} className="text-[11px] text-text2">{v}</p>)}</div>}
              {t.outputs?.length > 0 && <div><p className="text-[10px] font-semibold text-text3 mb-0.5">Outputs</p>{t.outputs.map((v,i) => <p key={i} className="text-[11px] text-text2">{v}</p>)}</div>}
              {t.authority?.length > 0 && <div><p className="text-[10px] font-semibold text-text3 mb-0.5">Authority</p>{t.authority.map((v,i) => <p key={i} className="text-[11px] text-text2">{v}</p>)}</div>}
            </div>
            {t.tags?.length > 0 && <div className="flex flex-wrap gap-1 mt-2">{t.tags.map(tag => <Badge key={tag} variant="outline" className="text-[9px]">{tag}</Badge>)}</div>}
          </div>
        </div>
      )}

      {/* File tabs */}
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
            {files[tab.id] && <div className="size-1.5 rounded-full bg-success" />}
          </button>
        ))}
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-border bg-surface overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-background/50 shrink-0">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">{activeTab}</span>
          <button
            onClick={() => { setSaving(true); saveMutation.mutate({ file: activeTab, content: editContent ?? files[activeTab] ?? "" }) }}
            disabled={saving || editContent === null}
            className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
              editContent !== null ? "bg-accent-porter text-white hover:bg-accent-porter/80" : "bg-raised text-text3 cursor-not-allowed"
            }`}
          >
            <Save className="size-2.5" /> {saving ? "Saving..." : "Save"}
          </button>
        </div>
        <textarea
          value={currentContent}
          onChange={e => setEditContent(e.target.value)}
          className="flex-1 w-full bg-background p-3 font-mono text-xs text-text placeholder:text-text3 focus:outline-none resize-none"
          spellCheck={false}
          placeholder={`No ${activeTab} yet. Start typing to define this agent's ${activeTab.replace('.md', '').toLowerCase()}.`}
        />
      </div>
    </div>
  )
}

export default function TemplateDetailPage() {
  return (
    <AdminShell>
      <TemplateDetailContent />
    </AdminShell>
  )
}
