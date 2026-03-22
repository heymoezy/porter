import { useState } from "react"
import { useParams, Link } from "react-router"
import { AdminShell } from "~/components/layout/admin-shell"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { PixelPortrait } from "~/components/pixel-portrait"
import {
  ArrowLeft, Shield, Zap, FileInput, FileOutput,
  MessageSquare, FileText, Save, Sparkles,
} from "lucide-react"

interface TemplateDetail {
  id: string
  name: string
  cat: string
  desc: string
  soul: string[]
  mission: string
  inputs: string[]
  outputs: string[]
  authority: string[]
  tags: string[]
  archetype: string
  appearance_spec: Record<string, string>
  communication_style: string
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
  const [activeTab, setActiveTab] = useState<string>("overview")
  const [editContent, setEditContent] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "templates", "detail", id],
    queryFn: () => api<TemplateDetail>(`/api/admin/templates/${id}`),
    enabled: !!id,
  })

  const saveMutation = useMutation({
    mutationFn: async ({ file, content }: { file: string; content: string }) =>
      api(`/api/admin/templates/${id}/files/${file}`, { method: "PUT", json: { content } }),
    onSuccess: () => {
      setSaving(false)
      setEditContent(null)
      qc.invalidateQueries({ queryKey: ["admin", "templates", "detail", id] })
    },
    onError: () => setSaving(false),
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
        <p className="text-xs text-danger">Template not found — is Porter.py running?</p>
        <Link to="/templates" className="text-xs text-accent-porter hover:underline mt-2 inline-block">Back</Link>
      </div>
    )
  }

  const t = data
  const spec = t.appearance_spec || {}
  const files = t.files || {}
  const showEditor = activeTab !== "overview"
  const currentContent = editContent ?? files[activeTab] ?? ""

  return (
    <div className="flex flex-col gap-2 h-[calc(100vh-var(--header-height)-2rem)]">
      {/* Back */}
      <Link to="/templates" className="flex items-center gap-1 text-xs text-text3 hover:text-accent-porter transition-colors shrink-0">
        <ArrowLeft className="size-3" /> Templates
      </Link>

      {/* Hero */}
      <div className="rounded-xl border border-border bg-surface p-3 shrink-0">
        <div className="flex items-center gap-3">
          <PixelPortrait
            hair={spec.hair || "#2c1b18"}
            skin={spec.skin || "#f1c27d"}
            eyes={spec.eyes || "#1a1a2e"}
            shirt={spec.shirt || "#64748b"}
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
            {t.communication_style && (
              <div className="flex items-center gap-1 mt-1">
                <MessageSquare className="size-2.5 text-text3" />
                <span className="text-[10px] text-text3 italic">{t.communication_style}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-border shrink-0 overflow-x-auto">
        <button
          onClick={() => { setActiveTab("overview"); setEditContent(null) }}
          className={`px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
            activeTab === "overview" ? "border-accent-porter text-accent-porter" : "border-transparent text-text3 hover:text-text2"
          }`}
        >Overview</button>
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

      {/* Content */}
      <div className="flex-1 min-h-0">
        {activeTab === "overview" ? (
          <div className="h-full overflow-y-auto space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {t.soul?.length > 0 && (
                <div className="rounded-xl border border-border bg-surface p-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-text3 mb-1">Soul</p>
                  {t.soul.map((s, i) => (
                    <div key={i} className="flex items-start gap-1.5 py-0.5">
                      <Shield className="size-2.5 text-accent-porter mt-0.5 shrink-0" />
                      <span className="text-xs text-text2">{s}</span>
                    </div>
                  ))}
                </div>
              )}
              {t.mission && (
                <div className="rounded-xl border border-border bg-surface p-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-text3 mb-1">Mission</p>
                  <p className="text-xs text-text2 leading-relaxed">{t.mission}</p>
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {t.inputs?.length > 0 && (
                <div className="rounded-xl border border-border bg-surface p-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-text3 mb-1">Inputs</p>
                  {t.inputs.map((v, i) => (
                    <div key={i} className="flex items-center gap-1 py-0.5"><FileInput className="size-2.5 text-text3" /><span className="text-xs text-text2">{v}</span></div>
                  ))}
                </div>
              )}
              {t.outputs?.length > 0 && (
                <div className="rounded-xl border border-border bg-surface p-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-text3 mb-1">Outputs</p>
                  {t.outputs.map((v, i) => (
                    <div key={i} className="flex items-center gap-1 py-0.5"><FileOutput className="size-2.5 text-text3" /><span className="text-xs text-text2">{v}</span></div>
                  ))}
                </div>
              )}
              {t.authority?.length > 0 && (
                <div className="rounded-xl border border-border bg-surface p-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-text3 mb-1">Authority</p>
                  {t.authority.map((v, i) => (
                    <div key={i} className="flex items-center gap-1 py-0.5"><Zap className="size-2.5 text-warning" /><span className="text-xs text-text2">{v}</span></div>
                  ))}
                </div>
              )}
            </div>
            {t.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {t.tags.map(tag => <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>)}
              </div>
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

export default function TemplateDetailPage() {
  return (
    <AdminShell>
      <TemplateDetailContent />
    </AdminShell>
  )
}
