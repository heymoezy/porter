import { useState, useRef } from "react"
import { useMountEffect } from "~/hooks/use-mount-effect"
import { useParams } from "react-router"
import {
  useCustomerDetail, useSuspendUser, useUnsuspendUser,
  useCustomerActivity, useCustomerTags, planDisplayLabel, type CustomerDetailResponse,
} from "~/hooks/use-admin-api"
import { CustomerTagsEditor } from "~/components/customer/CustomerTagsEditor"
import { Button } from "~/components/ui/button"
import { Badge } from "~/components/ui/badge"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Card, CardContent } from "~/components/ui/card"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip"
import { PixelPortrait } from "~/components/pixel-portrait"
import {
  TrendingUp, Target, Brain,
  Shield, ShieldOff, Check,
  Clock, Bot, MessageSquare, LogOut,
  Mail, MapPin, Building,
  Gift, AlertTriangle, Briefcase, Timer, Send, Maximize2, Minimize2, RotateCcw,
} from "lucide-react"
import { api } from "~/lib/api"
import { ActivityTimeline } from "~/components/customer/ActivityTimeline"
import { ContactInfoCard } from "~/components/customer/ContactInfoCard"
import { AgentConversations } from "~/components/customer/AgentConversations"

// ── Helpers ──────────────────────────────────────────────
function fmt$(n: number) { return n >= 0 ? `$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}` }
function fmtRel(ts: number | null) {
  if (!ts) return "never"
  const d = Date.now() / 1000 - ts
  if (d < 60) return "now"
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}
function fmtDate(ts: number | null) {
  if (!ts) return "\u2014"
  return new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}
function scoreColor(v: number, invert = false) {
  const n = invert ? 100 - v : v
  if (n >= 70) return "text-success"
  if (n >= 40) return "text-warning"
  return "text-danger"
}

/** Blended customer score 0-10: health 40%, anti-churn 30%, conversion 20%, viral 10% */
function customerScore(health: number, conversion: number, churn: number, viral: number): number {
  return Math.round(((health * 0.4) + (conversion * 0.2) + ((100 - churn) * 0.3) + (viral * 0.1)) / 10 * 10) / 10
}

// ── Inline Markdown ──────────────────────────────────────
/** Lightweight markdown→React for chat: **bold**, *italic*, `code`, ```blocks``` */
function renderMarkdown(text: string): React.ReactNode {
  // Split code blocks first
  const blocks = text.split(/(```[\s\S]*?```)/g)
  return blocks.map((block, bi) => {
    if (block.startsWith("```") && block.endsWith("```")) {
      const code = block.slice(3, -3).replace(/^\w*\n/, "") // strip optional language tag
      return <pre key={bi} className="my-1.5 rounded bg-black/20 px-2.5 py-1.5 text-2xs font-mono overflow-x-auto whitespace-pre-wrap">{code}</pre>
    }
    // Process inline markdown per line
    return block.split("\n").map((line, li) => {
      const parts: React.ReactNode[] = []
      // Match **bold**, *italic*, `code`
      const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g
      let last = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(line)) !== null) {
        if (m.index > last) parts.push(line.slice(last, m.index))
        if (m[2]) parts.push(<strong key={`${bi}-${li}-${m.index}`} className="font-bold">{m[2]}</strong>)
        else if (m[3]) parts.push(<em key={`${bi}-${li}-${m.index}`}>{m[3]}</em>)
        else if (m[4]) parts.push(<code key={`${bi}-${li}-${m.index}`} className="rounded bg-black/20 px-1 py-0.5 text-2xs font-mono">{m[4]}</code>)
        last = m.index + m[0].length
      }
      if (last < line.length) parts.push(line.slice(last))
      return <span key={`${bi}-${li}`}>{parts}{li < block.split("\n").length - 1 && "\n"}</span>
    })
  })
}

// ── Gamification ─────────────────────────────────────────
const LEVELS = [
  { name: "Recruit", key: "recruit", desc: "Signed up" },
  { name: "Operator", key: "operator", desc: "First agent + chat" },
  { name: "Handler", key: "handler", desc: "Active projects" },
  { name: "Commander", key: "commander", desc: "Power user" },
  { name: "Architect", key: "architect", desc: "Complex workflows" },
  { name: "Director", key: "director", desc: "Platform expert" },
] as const

function deriveLevel(c: CustomerDetailResponse["customer"], s: CustomerDetailResponse["scores"]): number {
  if (s.invitesSent > 0 && c.agent_count >= 5 && c.project_count >= 10) return 5
  if (c.agent_count >= 3 && c.project_count >= 5) return 4
  if (c.project_count >= 3 || (c.chat_count >= 20 && c.agent_count >= 2)) return 3
  if (c.project_count >= 1 && c.agent_count >= 1) return 2
  if (c.agent_count >= 1 || c.chat_count >= 1) return 1
  return 0
}

/** SVG score ring */
function ScoreRing({ value, size = 40, invert = false }: { value: number; size?: number; invert?: boolean }) {
  const r = (size - 5) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (value / 100) * circ
  const n = invert ? 100 - value : value
  const color = n >= 70 ? "var(--success)" : n >= 40 ? "var(--warning)" : "var(--danger)"
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={2.5} opacity={0.3} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={2.5} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        className="transition-all duration-700 ease-out" />
    </svg>
  )
}

// ── Progression Timeline ─────────────────────────────────
function ProgressionTimeline({ level }: { level: number }) {
  return (
    <div className="flex items-start gap-0 w-full py-1.5">
      {LEVELS.map((l, i) => {
        const status = i < level ? "complete" : i === level ? "active" : "upcoming"
        return (
          <div key={l.key} className="flex items-center flex-1 last:flex-initial">
            <div className="flex flex-col items-center gap-0.5 min-w-[60px]">
              <div className={`relative flex size-7 items-center justify-center rounded-full border-2 transition-all duration-500 ${
                status === "complete" ? "border-success bg-success/15" :
                status === "active" ? "border-accent-porter bg-accent-porter/15 shadow-[0_0_12px_var(--accent-porter)] animate-pulse" :
                "border-border bg-raised/50"
              }`}>
                {status === "complete" ? (
                  <Check className="size-3 text-success" />
                ) : (
                  <span className={`text-2xs font-bold ${
                    status === "active" ? "text-accent-porter" : "text-text3"
                  }`}>{i + 1}</span>
                )}
              </div>
              <p className={`text-2xs font-bold leading-none ${
                status === "complete" ? "text-success" :
                status === "active" ? "text-accent-porter" : "text-text3/50"
              }`}>{l.name}</p>
              <p className="text-2xs text-text3/40 leading-tight mt-0.5">{l.desc}</p>
            </div>
            {i < LEVELS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 mt-[-20px] rounded-full ${
                i < level ? "bg-success/60" : "bg-border/30"
              }`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Activity Log ─────────────────────────────────────────
function useActivityLines(username: string) {
  const { data } = useCustomerActivity(username)
  const events = data?.events ?? []
  const typeColor: Record<string, string> = {
    login: "text-success", project: "text-accent-porter",
    agent: "text-warning", chat: "text-chart-2",
  }
  return events.map((e, i) => ({
    _key: i,
    text: `${fmtRel(e.ts).padEnd(8)} ${e.action}${e.detail && e.detail !== "\u2014" ? "  " + e.detail : ""}`,
    color: typeColor[e.type] || "text-text3",
  }))
}

// ── Agent Appearances ────────────────────────────────────
const AGENT_APPEARANCES: Record<string, {
  skin: string; hair: string; eyes: string; shirt: string
  hairStyle: "short" | "long" | "mohawk" | "bald" | "parted" | "buzz" | "curly" | "ponytail"
}> = {
  porter:    { skin: "#F5D0A9", hair: "#2C1810", eyes: "#1A1A2E", shirt: "#8B5CF6", hairStyle: "short" },
  growth:    { skin: "#FDBCB4", hair: "#8B4513", eyes: "#1A1A2E", shirt: "#22C55E", hairStyle: "curly" },
  retention: { skin: "#D4A574", hair: "#1A1A2E", eyes: "#1A1A2E", shirt: "#F59E0B", hairStyle: "mohawk" },
}
const DEFAULT_APPEARANCE = { skin: "#F5D0A9", hair: "#2C1810", eyes: "#1A1A2E", shirt: "#6B7280", hairStyle: "bald" as const }
function agentAppearance(agent: string) { return AGENT_APPEARANCES[agent] ?? DEFAULT_APPEARANCE }

// ── Plan Controls ────────────────────────────────────────

// ── Generic Agent Carousel ────────────────────────────────
interface AgentAction {
  icon: typeof Brain
  agent: string
  label: string
  text: string
  accent: string
  glow: string
}

function AgentCarousel({ items, interval = 4000 }: { items: AgentAction[]; interval?: number }) {
  const [active, setActive] = useState(0)
  useMountEffect(() => {
    if (items.length <= 1) return
    const timer = setInterval(() => setActive(prev => (prev + 1) % items.length), interval)
    return () => clearInterval(timer)
  })

  const activeItem = items[active % items.length]

  return (
    <div className={`relative rounded-lg border border-border/40 ${activeItem.glow} overflow-hidden transition-shadow duration-500`}>
      {/* Grid overlay: all items occupy same cell — tallest sets height, no bounce */}
      <div className="grid">
        {items.map((item, i) => {
          const ap = agentAppearance(item.agent)
          const isActive = i === active % items.length
          return (
            <div key={i} className={`col-start-1 row-start-1 flex items-center gap-3 px-3 py-2.5 transition-opacity duration-500 ${isActive ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
              <PixelPortrait skin={ap.skin} hair={ap.hair} eyes={ap.eyes} shirt={ap.shirt} hairStyle={ap.hairStyle} size="xs" />
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-bold ${item.accent}`}>{item.label}</p>
                <p className="text-2xs text-text leading-snug mt-0.5">{item.text}</p>
              </div>
            </div>
          )
        })}
      </div>
      {items.length > 1 && (
        <div className="absolute top-2 right-2.5 flex items-center gap-1">
          <button onClick={() => setActive(prev => (prev - 1 + items.length) % items.length)} className="text-text3/40 hover:text-text text-xs">&lsaquo;</button>
          <span className={`text-2xs font-bold tabular-nums ${activeItem.accent}`}>{(active % items.length) + 1}/{items.length}</span>
          <button onClick={() => setActive(prev => (prev + 1) % items.length)} className="text-text3/40 hover:text-text text-xs">&rsaquo;</button>
        </div>
      )}
    </div>
  )
}

function buildGrowthActions(s: CustomerDetailResponse["scores"], pendingTasks: any[]): AgentAction[] {
  const items: AgentAction[] = []
  const actionText = typeof s.nextAction === "object" ? s.nextAction?.text : String(s.nextAction ?? "")
  const actionAgent = typeof s.nextAction === "object" ? s.nextAction?.agent : ""
  if (actionText) items.push({ icon: Brain, agent: actionAgent || "porter", label: actionAgent || "Porter", text: actionText, accent: "text-accent-porter", glow: "shadow-[var(--shadow-accent-pulse)]" })
  if (pendingTasks.length > 0) items.push({ icon: Bot, agent: "porter", label: "Tasks", text: pendingTasks.map((t: any) => t.action_type.replace(/_/g, " ")).join(", "), accent: "text-warning", glow: "shadow-[var(--shadow-warning-glow)]" })
  if (s.health < 50) items.push({ icon: Target, agent: "retention", label: "Retention Agent", text: `Health score ${s.health}/100 — running re-engagement: checking last login, sending feature discovery emails`, accent: "text-danger", glow: "shadow-[var(--shadow-danger-glow)]" })
  if (s.churn > 60) items.push({ icon: Shield, agent: "retention", label: "Retention Agent", text: `Churn risk ${s.churn}% — activating save protocol: scheduling check-in, preparing discount offer`, accent: "text-danger", glow: "shadow-[var(--shadow-danger-glow)]" })
  if (s.conversion > 50) items.push({ icon: TrendingUp, agent: "growth", label: "Growth Agent", text: `Conversion signal ${s.conversion}% — preparing upgrade path: highlighting premium features used on free plan`, accent: "text-success", glow: "shadow-[var(--shadow-success-glow)]" })
  if (items.length === 0) items.push({ icon: Brain, agent: "porter", label: "Porter", text: "All metrics healthy — monitoring login patterns, feature adoption, and engagement signals", accent: "text-accent-porter", glow: "" })
  return items
}

function buildRevenueActions(c: CustomerDetailResponse["customer"], s: CustomerDetailResponse["scores"], sub: CustomerDetailResponse["subscription"]): AgentAction[] {
  const items: AgentAction[] = []
  if (c.plan === "free" && s.conversion > 30) items.push({ icon: TrendingUp, agent: "growth", label: "Growth Agent", text: `Free plan user showing ${s.conversion}% conversion signals — preparing personalized upgrade offer based on feature usage`, accent: "text-success", glow: "shadow-[var(--shadow-success-glow)]" })
  if ((sub?.status ?? "none") === "past_due") items.push({ icon: AlertTriangle, agent: "retention", label: "Revenue Agent", text: "Payment failed — running dunning sequence: retry charge, send payment update email, flag for admin review", accent: "text-danger", glow: "shadow-[var(--shadow-danger-glow)]" })
  if ((sub?.status ?? "none") === "trialing") items.push({ icon: Clock, agent: "growth", label: "Growth Agent", text: `Trial active until ${sub?.trialEndsAt ? fmtDate(sub.trialEndsAt) : "TBD"} — tracking feature adoption to optimize conversion timing`, accent: "text-warning", glow: "shadow-[var(--shadow-warning-glow)]" })
  if (items.length === 0) items.push({ icon: Brain, agent: "porter", label: "Porter", text: `${c.plan === "free" ? "Free plan" : c.plan + " plan"} — monitoring payment health, usage-to-plan fit, and expansion opportunities`, accent: "text-accent-porter", glow: "" })
  return items
}

// ── Main Component ──────────────────────────────────────
function UserDetailContent() {
  const { username } = useParams<{ username: string }>()
  const { data, isLoading, refetch } = useCustomerDetail(username!)
  const { data: tagsData } = useCustomerTags(username!)
  const suspendUser = useSuspendUser()
  const unsuspendUser = useUnsuspendUser()
  const [showSuspend, setShowSuspend] = useState(false)
  const [suspendReason, setSuspendReason] = useState("")
  const [chatExpanded, setChatExpanded] = useState(false)
  const [chatInput, setChatInput] = useState("")
  const [chatMessages, setChatMessages] = useState<{ role: "porter" | "admin"; text: string; model?: string }[]>([])
  const [chatSending, setChatSending] = useState(false)
  const [chatModel, setChatModel] = useState("auto")
  const chatEndRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLInputElement>(null)

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-8 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  const { customer: c, scores: s, anomalies = [], pendingTasks = [], stage } = data
  const tags = tagsData?.tags ?? []
  const isSuspended = !!c.suspended_at
  const isOnline = c.active_sessions > 0 && c.last_seen_at && (Date.now() / 1000 - c.last_seen_at < 300)
  const label = planDisplayLabel(c, data.preLaunch)
  const level = deriveLevel(c, s)
  const sub = data.subscription

  async function handleSuspend() {
    await suspendUser.mutateAsync({ username: c.username, reason: suspendReason || undefined })
    setSuspendReason(""); setShowSuspend(false); refetch()
  }

  return (
    <div className="space-y-0">
      {/* Suspend dialog */}
      <AlertDialog open={showSuspend} onOpenChange={setShowSuspend}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspend {c.display_name || c.username}</AlertDialogTitle>
            <AlertDialogDescription>Immediately revoke all sessions and prevent login.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2">
            <Label className="text-xs text-text3 mb-1.5">Reason (optional)</Label>
            <Input value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} placeholder="Why?" className="h-9 text-sm" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/80" onClick={handleSuspend}>Suspend</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ═══ HEADER — identity + actions ═══ */}
      <div className="flex items-center gap-4 border-b border-border/50 pb-4 mb-0">
        <PixelPortrait skin="#F5D0A9" hair="#2C1810" eyes="#1A1A2E" shirt="#6366F1" hairStyle="short" size="sm" />

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-text tracking-tight">{c.full_name || c.display_name || c.username}</span>
            {/* Blended score */}
            {(() => {
              const cs = customerScore(s.health, s.conversion, s.churn, s.viral)
              const csColor = cs >= 7 ? "text-success" : cs >= 4 ? "text-warning" : "text-danger"
              return <span className={`text-lg font-black tabular-nums ${csColor}`}>{cs}<span className="text-2xs text-text3/40 font-bold">/10</span></span>
            })()}
            {isOnline && <Badge className="bg-success/15 text-success border-0 text-2xs font-bold gap-1"><span className="size-1.5 rounded-full bg-success animate-pulse" />Live</Badge>}
            <Badge className="bg-accent-porter/15 text-accent-porter border-0 text-2xs font-bold">{LEVELS[level].name}</Badge>
            <Badge className={`border-0 text-2xs capitalize ${
              stage === "revenue" ? "bg-success/15 text-success" :
              stage === "activated" ? "bg-accent-porter/15 text-accent-porter" :
              stage === "acquired" ? "bg-warning/15 text-warning" : "bg-danger/15 text-danger"
            }`}>{stage}</Badge>
            {isSuspended && <Badge className="bg-danger/15 text-danger border-0 text-2xs">Suspended</Badge>}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-2xs text-text3 flex-wrap">
            <span className="inline-flex items-center gap-1"><Mail className="size-2.5" />{c.email}</span>
            {(c.country || c.city) && <span className="inline-flex items-center gap-1"><MapPin className="size-2.5" />{[c.country, c.city].filter(Boolean).join(" · ")}</span>}
            {c.company && <span className="inline-flex items-center gap-1"><Building className="size-2.5" />{c.company}</span>}
            {c.job_title && <span className="inline-flex items-center gap-1"><Briefcase className="size-2.5" />{c.job_title}</span>}
            {!isOnline && <span className="inline-flex items-center gap-1"><Clock className="size-2.5" />{fmtRel(c.last_seen_at)}</span>}
            {c.timezone && <span className="inline-flex items-center gap-1"><Timer className="size-2.5" />{c.timezone}</span>}
            <span>{label}</span>
            <span className="text-text3">@{c.username} · Joined {fmtDate(c.created_at)}{c.last_ip ? ` · IP ${c.last_ip}` : ""}</span>
          </div>
          <div className="mt-1.5">
            <CustomerTagsEditor username={c.username} tags={tags} />
          </div>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-1.5 shrink-0">
          <Button variant="ghost" size="xs" onClick={() => { api(`/api/admin/users/${c.username}/purge-sessions`, { method: "POST" }); refetch() }}>
            <LogOut className="size-3" /> Logout
          </Button>
          {isSuspended ? (
            <Button variant="outline" size="xs" onClick={() => { unsuspendUser.mutateAsync(c.username); refetch() }}>
              <Shield className="size-3" /> Unsuspend
            </Button>
          ) : (
            <Button variant="destructive" size="xs" onClick={() => setShowSuspend(true)}>
              <ShieldOff className="size-3" /> Suspend
            </Button>
          )}
        </div>
      </div>

      {/* ═══ METRIC BAR — usage stats + PIRATE scores ═══ */}
      <div className="grid grid-cols-[repeat(5,1fr)_1px_repeat(4,1fr)] border-b border-border/50 py-3 mb-4">
        {/* Usage stats — 5 cells */}
        {[
          { label: "Sessions", value: String(c.active_sessions) },
          { label: "Projects", value: String(c.project_count) },
          { label: "Agents", value: String(c.agent_count) },
          { label: "Chats", value: String(c.chat_count) },
          { label: "30d Logins", value: String(s.loginCount) },
        ].map((m, i) => (
          <div key={m.label} className={`px-4 ${i === 0 ? "pl-0" : ""} ${i < 4 ? "border-r border-border/30" : ""}`}>
            <p className="text-2xs font-semibold uppercase tracking-wider text-text3/50">{m.label}</p>
            <p className="text-base font-bold tabular-nums text-text">{m.value}</p>
          </div>
        ))}

        {/* Separator */}
        <div className="border-r border-border/50 mx-2" />

        {/* PIRATE scores — 4 cells */}
        {[
          { label: "Health", value: s.health, invert: false },
          { label: "Conversion", value: s.conversion, invert: false },
          { label: "Churn", value: s.churn, invert: true },
          { label: "Viral", value: s.viral, invert: false },
        ].map((sc, i) => (
          <div key={sc.label} className={`px-4 ${i < 3 ? "border-r border-border/30" : ""}`}>
            <p className="text-2xs font-semibold uppercase tracking-wider text-text3/50">{sc.label}</p>
            <div className="flex items-baseline gap-1 mt-0.5">
              <p className={`text-base font-bold tabular-nums ${scoreColor(sc.value, sc.invert)}`}>{sc.value}</p>
              <p className="text-2xs text-text3/40 font-medium">/100</p>
            </div>
            <div className="mt-1.5 h-1 rounded-full bg-border/30 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  (sc.invert ? 100 - sc.value : sc.value) >= 70 ? "bg-success" :
                  (sc.invert ? 100 - sc.value : sc.value) >= 40 ? "bg-warning" : "bg-danger"
                }`}
                style={{ width: `${sc.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* ═══ Anomaly Alert ═══ */}
      {anomalies.length > 0 && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-3.5 text-danger shrink-0" />
            <p className="text-2xs text-danger">{anomalies.join(" · ")}</p>
          </div>
        </div>
      )}

      {/* ═══ PROGRESSION — spans full width ═══ */}
      <ProgressionTimeline level={level} />

      {/* ═══ MAIN CONTENT ═══ */}
      <div className={`grid gap-4 items-start mt-4 ${chatExpanded ? "grid-cols-1" : "grid-cols-[1fr_1.5fr_1fr]"}`}>

        {/* ── LEFT: Intelligence cards ── */}
        {!chatExpanded && (
          <div className="flex flex-col gap-3">

            {/* Contact info card — inline-editable contact fields + domain peers badge */}
            <ContactInfoCard customer={c} onSaved={refetch} />

            {/* Growth card — without the LLMTerminal block */}
            <Card className="ring-0 border border-success/20 bg-gradient-to-br from-success/5 via-transparent to-transparent">
              <CardContent className="p-4">
                <div className="mb-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-success/70">Autonomous Growth</p>
                  <p className="text-2xs text-text3/50 mt-0.5">Growth · Retention · Referral</p>
                </div>
                <AgentCarousel items={buildGrowthActions(s, pendingTasks)} />
                <TooltipProvider>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    {[
                      { label: "Health", value: s.health, invert: false, tip: "Overall engagement — login frequency, feature adoption, session depth. Low health triggers retention agents." },
                      { label: "Conversion", value: s.conversion, invert: false, tip: "Likelihood to upgrade plan. Based on usage patterns, feature hits, team size. High conversion triggers upgrade flows." },
                      { label: "Churn", value: s.churn, invert: true, tip: "Probability of leaving. Based on declining logins, reduced usage. High churn activates retention protocols." },
                      { label: "Viral", value: s.viral, invert: false, tip: "Likelihood to refer others. Based on invites sent, team additions, sharing activity. High viral amplifies referral incentives." },
                    ].map(sc => {
                      const n = sc.invert ? 100 - sc.value : sc.value
                      const barColor = n >= 70 ? "bg-success" : n >= 40 ? "bg-warning" : "bg-danger"
                      return (
                        <Tooltip key={sc.label}>
                          <TooltipTrigger asChild>
                            <div className="rounded-lg border border-border/30 p-2.5 bg-raised/30 cursor-help">
                              <p className="text-2xs font-semibold uppercase tracking-wide text-text3/60">{sc.label}</p>
                              <p className={`text-xl font-bold tabular-nums leading-none mt-1 ${scoreColor(sc.value, sc.invert)}`}>{sc.value}</p>
                              <div className="mt-2 h-1 rounded-full bg-border/30 overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${sc.value}%` }} />
                              </div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent sideOffset={4} className="max-w-[200px]">{sc.tip}</TooltipContent>
                        </Tooltip>
                      )
                    })}
                  </div>
                </TooltipProvider>
              </CardContent>
            </Card>

            {/* Revenue card */}
            <Card className="ring-0 border border-warning/20 bg-gradient-to-br from-warning/5 via-transparent to-transparent">
              <CardContent className="p-4">
                <div className="mb-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-warning/70">Autonomous Revenue</p>
                  <p className="text-2xs text-text3/50 mt-0.5">Revenue Agent · Billing Agent</p>
                </div>
                <AgentCarousel items={buildRevenueActions(c, s, sub)} interval={6000} />
                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-border/30 p-2.5 bg-raised/30 text-center">
                      <p className="text-2xs font-semibold uppercase text-text3/50">Plan</p>
                      <p className="text-sm font-bold text-text capitalize">{c.plan === "cloud_team" ? "Team" : c.plan}</p>
                    </div>
                    <div className="rounded-lg border border-border/30 p-2.5 bg-raised/30 text-center">
                      <p className="text-2xs font-semibold uppercase text-text3/50">Status</p>
                      <p className={`text-sm font-bold capitalize ${
                        (sub?.status ?? "none") === "active" ? "text-success" :
                        (sub?.status ?? "none") === "trialing" ? "text-warning" : "text-text3"
                      }`}>{sub?.status ?? "none"}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg border border-border/30 p-2.5 bg-raised/30 text-center">
                      <p className="text-2xs font-semibold uppercase text-text3/50">MRR</p>
                      <p className="text-sm font-bold text-success tabular-nums">{fmt$(s.mrr)}</p>
                    </div>
                    <div className="rounded-lg border border-border/30 p-2.5 bg-raised/30 text-center">
                      <p className="text-2xs font-semibold uppercase text-text3/50">Margin</p>
                      <p className={`text-sm font-bold tabular-nums ${s.margin >= 0 ? "text-success" : "text-danger"}`}>{fmt$(s.margin)}</p>
                    </div>
                    <div className="rounded-lg border border-border/30 p-2.5 bg-raised/30 text-center">
                      <p className="text-2xs font-semibold uppercase text-text3/50">LTV</p>
                      <p className="text-sm font-bold text-accent-porter tabular-nums">{fmt$(s.ltv)}</p>
                    </div>
                  </div>
                  {c.lifetime_free && (
                    <div className="flex items-center justify-center gap-1.5 text-2xs">
                      <Gift className="size-3 text-accent-porter" />
                      <span className="text-accent-porter font-bold">Lifetime free</span>
                    </div>
                  )}
                  {sub?.trialEndsAt && (
                    <p className="text-2xs text-text3/50 text-center">Trial ends {fmtDate(sub.trialEndsAt)}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Agent Conversations card */}
            <AgentConversations username={c.username} />

          </div>
        )}

        {/* ── CENTER: Activity Timeline (primary view) ── */}
        {!chatExpanded && (
          <ActivityTimeline username={c.username} />
        )}

        {/* ── RIGHT: Porter Chat (full height) ── */}
        <Card className="ring-0 border border-accent-porter/20 bg-gradient-to-b from-accent-porter/5 to-transparent flex flex-col overflow-hidden" style={{ height: chatExpanded ? "calc(100vh - 280px)" : "calc(100vh - 340px)" }}>
          <CardContent className="p-4 flex flex-col flex-1 overflow-hidden">
            <div className="flex items-center gap-2 mb-2">
              <PixelPortrait skin="#F5D0A9" hair="#2C1810" eyes="#1A1A2E" shirt="#8B5CF6" hairStyle="short" size="xs" />
              <p className="text-xs font-bold text-text">Porter</p>
              <span className="text-2xs text-text3/40 font-mono">{chatModel !== "auto" ? chatModel : ""}</span>
              <div className="flex-1" />
              <Button variant="ghost" size="xs" onClick={() => {
                setChatMessages([])
              }} className="text-text3/50 hover:text-text" title="New chat">
                <RotateCcw className="size-3" />
              </Button>
              <Button variant="ghost" size="xs" onClick={() => setChatExpanded(!chatExpanded)} className="text-text3/50 hover:text-text">
                {chatExpanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto mb-3 space-y-2.5">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "admin" ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[85%]">
                    <div className={`rounded-[10px] px-3.5 py-2.5 text-sm leading-relaxed ${
                      msg.role === "admin"
                        ? "rounded-br-[2px] bg-accent-porter text-white"
                        : "rounded-bl-[2px] border border-border bg-raised text-text"
                    }`} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {renderMarkdown(msg.text)}
                    </div>
                    {msg.model && <p className="text-2xs text-text3/40 mt-0.5 font-mono">{msg.model}</p>}
                  </div>
                </div>
              ))}
              {chatSending && (
                <div className="flex justify-start">
                  <div className="rounded-[10px] rounded-bl-[2px] border border-border bg-raised px-3.5 py-2.5">
                    <span className="flex gap-1">
                      {[0, 1, 2].map(i => <span key={i} className="h-1.5 w-1.5 rounded-full bg-text3 animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />)}
                    </span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault()
              const msg = chatInput.trim()
              if (!msg || chatSending) return
              setChatInput("")
              if (msg === "/clear") {
                setChatMessages([])
                return
              }
              if (msg === "/help") {
                setChatMessages(prev => [...prev, { role: "porter", text: "/clear — new chat\n/models — list available models\n/switch <model> — change model (auto, ollama, openclaw)\n/help — this message" }])
                return
              }
              if (msg === "/models") {
                setChatMessages(prev => [...prev, { role: "porter", text: `Available models:\n· auto — smart routing (picks best available)\n· ollama — local qwen2.5-coder:1.5b (fast, basic)\n· openclaw — cloud GPT-5.4 via OpenClaw\n\nCurrent: ${chatModel}` }])
                return
              }
              if (msg.startsWith("/switch ")) {
                const model = msg.slice(8).trim().toLowerCase()
                if (["auto", "ollama", "openclaw"].includes(model)) {
                  setChatModel(model)
                  setChatMessages(prev => [...prev, { role: "porter", text: `Switched to ${model}` }])
                } else {
                  setChatMessages(prev => [...prev, { role: "porter", text: `Unknown model "${model}". Available: auto, ollama, openclaw` }])
                }
                return
              }
              setChatMessages(prev => [...prev, { role: "admin", text: msg }])
              setChatSending(true)
              setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50)
              try {
                const contextPrefix = `You are Porter, the AI orchestrator at askporter.app. You are speaking with Moe, the platform admin. You are discussing customer "${c.display_name || c.username}" (${c.email}). This customer is on the ${c.plan} plan. Their health score is ${s.health}/100, conversion ${s.conversion}/100, churn risk ${s.churn}/100. Be concise, direct, and strategic. You manage this customer's agents autonomously. Respond as Porter — confident, sharp, no fluff.\n\nMoe says: `
                const chatCall = () => api<{ response: string; model?: string }>("/api/admin/porter/chat", {
                  method: "POST",
                  json: { message: contextPrefix + msg },
                })
                let res: { response: string; model?: string }
                try { res = await chatCall() } catch { res = await chatCall() }
                setChatMessages(prev => [...prev, { role: "porter", text: res.response || "No response.", model: res.model }])
              } catch {
                setChatMessages(prev => [...prev, { role: "porter", text: "I'm having trouble connecting right now. Try again in a moment." }])
              } finally {
                setChatSending(false)
                setTimeout(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); chatInputRef.current?.focus() }, 50)
              }
            }}>
              <div className="rounded-2xl border border-border bg-gradient-to-b from-surface to-background p-3">
                <div className="flex items-center gap-2">
                  <input ref={chatInputRef} value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                    placeholder={`Message Porter about ${c.display_name || c.username}...`}
                    disabled={chatSending}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit() } }}
                    className="flex-1 bg-transparent text-sm text-text placeholder:text-text3/30 focus:outline-none disabled:opacity-50" />
                  <Button variant="default" size="xs" type="submit" disabled={!chatInput.trim() || chatSending}>
                    <Send className="size-3" />
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}

export default function UserDetailPage() {
  return (
      <div className="overflow-y-auto p-4 flex-1">
        <UserDetailContent />
      </div>
  )
}
