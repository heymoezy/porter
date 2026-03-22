import { useState, useRef, useEffect } from "react"
import { AdminShell } from "~/components/layout/admin-shell"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { PixelPortrait } from "~/components/pixel-portrait"
import {
  Shield, FileText, Sparkles, BarChart3, Save,
  MessageSquare, Send, Zap, Lock, Wrench, Eye,
} from "lucide-react"

interface IdentityResponse {
  identity: Record<string, string | null>
  persona: Record<string, unknown> | null
}

interface SkillItem {
  id: string
  name: string
  purpose?: string
  description?: string
  tier: string
  installed: boolean
  enabled?: boolean
}

interface SkillsResponse {
  skills?: SkillItem[]
  profile?: {
    core: SkillItem[]
    internal: SkillItem[]
    reserve: SkillItem[]
    available: SkillItem[]
    available_count: number
  } | null
  assigned_names?: string[]
  managed_by_porter?: boolean
}

interface StatsResponse {
  totalDispatches: number
  successRate: number
  statusBreakdown: Record<string, number>
}

interface ChatMsg {
  role: "user" | "porter"
  text: string
}

const TABS = [
  { id: "SOUL.md", label: "Soul", icon: Shield },
  { id: "IDENTITY.md", label: "Identity", icon: FileText },
  { id: "ROLE_CARD.md", label: "Role Card", icon: FileText },
  { id: "SKILLS.md", label: "Skills File", icon: Sparkles },
  { id: "USER.md", label: "User", icon: FileText },
] as const

const tierConfig: Record<string, { label: string; color: string; icon: React.ElementType; desc: string }> = {
  core: { label: "Core", color: "text-accent-porter bg-accent-porter/15", icon: Shield, desc: "Primary orchestration capabilities" },
  internal: { label: "Internal", color: "text-warning bg-warning/15", icon: Wrench, desc: "Infrastructure & maintenance" },
  reserve: { label: "Reserve", color: "text-text3 bg-text3/15", icon: Eye, desc: "Available but not active" },
  available: { label: "Available", color: "text-success bg-success/15", icon: Zap, desc: "Can be assigned" },
}

function PorterContent() {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<string>("SOUL.md")
  const [editContent, setEditContent] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [chatInput, setChatInput] = useState("")
  const [chatHistory, setChatHistory] = useState<ChatMsg[]>([
    { role: "porter", text: "I'm here. What do you need, Moe?" },
  ])
  const chatEndRef = useRef<HTMLDivElement>(null)

  const { data: identityData, isLoading } = useQuery({
    queryKey: ["admin", "porter", "identity"],
    queryFn: () => api<IdentityResponse>("/api/admin/porter/identity"),
  })

  const { data: skillsData } = useQuery({
    queryKey: ["admin", "porter", "skills"],
    queryFn: () => api<SkillsResponse>("/api/admin/porter/skills"),
  })

  const { data: statsData } = useQuery({
    queryKey: ["admin", "porter", "stats"],
    queryFn: () => api<StatsResponse>("/api/admin/porter/stats"),
  })

  const saveMutation = useMutation({
    mutationFn: async ({ file, content }: { file: string; content: string }) => {
      return api(`/api/admin/porter/identity/${file}`, {
        method: "PUT",
        json: { content },
      })
    },
    onSuccess: () => {
      setSaving(false)
      setEditContent(null)
      qc.invalidateQueries({ queryKey: ["admin", "porter", "identity"] })
    },
    onError: () => setSaving(false),
  })

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatHistory])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  const identity = identityData?.identity ?? {}
  const persona = identityData?.persona as Record<string, unknown> | null
  const profile = skillsData?.profile ?? null
  const stats = statsData

  const spec = persona?.appearance_spec
    ? (typeof persona.appearance_spec === 'string' ? JSON.parse(persona.appearance_spec as string) : persona.appearance_spec) as Record<string, string>
    : { skin: "#f1c27d", hair: "#1e293b", eyes: "#0f172a", shirt: "#1e3a5f" }
  const palette = spec.palette ?? spec

  const currentContent = editContent ?? identity[activeTab] ?? ""

  const totalSkills = (profile?.core?.length ?? 0) + (profile?.internal?.length ?? 0) + (profile?.reserve?.length ?? 0)

  const [chatSending, setChatSending] = useState(false)

  async function sendChat() {
    const msg = chatInput.trim()
    if (!msg || chatSending) return
    setChatHistory(h => [...h, { role: "user", text: msg }])
    setChatInput("")
    setChatSending(true)

    try {
      const res = await api<{ response: string }>("/api/admin/porter/chat", {
        method: "POST",
        json: { message: msg },
      })
      setChatHistory(h => [...h, { role: "porter", text: res.response }])
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Could not reach Porter"
      setChatHistory(h => [...h, { role: "porter", text: `[Error: ${errMsg}]` }])
    } finally {
      setChatSending(false)
    }
  }

  function renderSkillTier(label: string, tier: string, skills: SkillItem[]) {
    if (!skills.length) return null
    const cfg = tierConfig[tier] || tierConfig.reserve
    const Icon = cfg.icon
    return (
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <Icon className={`size-3.5 ${cfg.color.split(" ")[0]}`} />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">{label}</span>
          <Badge className={`text-[10px] border-0 ${cfg.color}`}>{skills.length}</Badge>
          <span className="text-[10px] text-text3 ml-1">{cfg.desc}</span>
        </div>
        <div className="space-y-px">
          {skills.map(s => (
            <div key={s.id || s.name} className="flex items-start gap-2 rounded-lg bg-background px-3 py-1.5">
              <div className={`size-2 rounded-full mt-1 shrink-0 ${s.installed !== false ? "bg-success" : "bg-text3"}`} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-text">{s.name}</p>
                {(s.purpose || s.description) && (
                  <p className="text-[11px] text-text3 leading-relaxed">{s.purpose || s.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 h-[calc(100vh-var(--header-height)-2rem)]">
      {/* Hero card */}
      <div className="rounded-xl border border-border bg-surface p-3 shrink-0">
        <div className="flex items-center gap-2">
          <PixelPortrait
            hair={(palette as Record<string, string>).hair || "#1e293b"}
            skin={(palette as Record<string, string>).skin || "#f1c27d"}
            eyes={(palette as Record<string, string>).eyes || "#0f172a"}
            shirt={(palette as Record<string, string>).shirt || "#1e3a5f"}
            hairStyle="short"
            size="md"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-text">{(persona?.name as string) || "Porter"}</h2>
              <Badge className="text-[10px] bg-accent-porter/15 text-accent-porter border-0">
                {(persona?.role as string) || "Master Orchestrator"}
              </Badge>
              <div className="flex items-center gap-1.5 ml-1">
                <div className="size-2 rounded-full bg-success animate-pulse-badge" />
                <span className="text-[10px] text-text3">{(persona?.dispatch_mode as string) || "leader"}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-text3">
              {stats && (
                <>
                  <span>{stats.totalDispatches} dispatches</span>
                  <span>{stats.successRate}% success</span>
                </>
              )}
              <span>{totalSkills} skills</span>
              {skillsData?.managed_by_porter && (
                <span className="flex items-center gap-1"><Lock className="size-2.5" /> self-managed</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border shrink-0">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setEditContent(null) }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-accent-porter text-accent-porter"
                : "border-transparent text-text3 hover:text-text2"
            }`}
          >
            <tab.icon className="size-3" />
            {tab.label}
          </button>
        ))}
        <button
          onClick={() => { setActiveTab("skills-list"); setEditContent(null) }}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "skills-list"
              ? "border-accent-porter text-accent-porter"
              : "border-transparent text-text3 hover:text-text2"
          }`}
        >
          <Sparkles className="size-3" />
          Skills
        </button>
        <button
          onClick={() => { setActiveTab("chat"); setEditContent(null) }}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "chat"
              ? "border-accent-porter text-accent-porter"
              : "border-transparent text-text3 hover:text-text2"
          }`}
        >
          <MessageSquare className="size-3" />
          Direct Chat
        </button>
      </div>

      {/* Tab content — fills remaining height */}
      <div className="flex-1 min-h-0">
        {activeTab === "skills-list" ? (
          <div className="h-full overflow-y-auto rounded-xl border border-border bg-surface p-3 space-y-2">
            {profile ? (
              <>
                {renderSkillTier("Core Orchestration", "core", profile.core || [])}
                {renderSkillTier("Internal Operations", "internal", profile.internal || [])}
                {renderSkillTier("Reserve", "reserve", profile.reserve || [])}
                {(profile.available?.length ?? 0) > 0 && renderSkillTier("Available", "available", profile.available || [])}
              </>
            ) : (
              <p className="text-sm text-text3 text-center py-4">Loading skill profile...</p>
            )}
          </div>
        ) : activeTab === "chat" ? (
          <div className="h-full flex flex-col rounded-xl border border-border bg-surface overflow-hidden">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {chatHistory.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                    msg.role === "user"
                      ? "bg-accent-porter text-white"
                      : "bg-background text-text2"
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            {/* Input */}
            <div className="border-t border-border p-2 flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendChat()}
                placeholder="Talk to Porter..."
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text3 focus:border-accent-porter focus:outline-none"
              />
              <button
                onClick={sendChat}
                disabled={!chatInput.trim() || chatSending}
                className="flex size-9 items-center justify-center rounded-lg bg-accent-porter text-white disabled:opacity-30 hover:bg-accent-porter/80 transition-colors"
              >
                {chatSending
                  ? <div className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  : <Send className="size-4" />
                }
              </button>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col rounded-xl border border-border bg-surface overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-background/50 shrink-0">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">{activeTab}</span>
              <button
                onClick={() => {
                  setSaving(true)
                  saveMutation.mutate({ file: activeTab, content: editContent ?? identity[activeTab] ?? "" })
                }}
                disabled={saving || editContent === null}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  editContent !== null
                    ? "bg-accent-porter text-white hover:bg-accent-porter/80"
                    : "bg-raised text-text3 cursor-not-allowed"
                }`}
              >
                <Save className="size-3" />
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
            <textarea
              value={currentContent}
              onChange={e => setEditContent(e.target.value)}
              className="flex-1 w-full bg-background p-3 font-mono text-sm text-text placeholder:text-text3 focus:outline-none resize-none"
              spellCheck={false}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default function PorterPage() {
  return (
    <AdminShell>
      <PorterContent />
    </AdminShell>
  )
}
