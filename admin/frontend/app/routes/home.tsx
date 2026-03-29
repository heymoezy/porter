import { useState } from "react"
import { useMountEffect } from "~/hooks/use-mount-effect"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { AnimCount } from "~/components/ui/anim-count"
import { Sparkline } from "~/components/ui/sparkline"
import { LLMTerminal } from "~/components/llm-terminal"
import { AreaChart } from "~/components/ui/area-chart"
import { PixelPortrait } from "~/components/pixel-portrait"
import { Link } from "react-router"
import {
  FolderKanban, Bot, Check, Sparkles, BarChart2,
  ArrowRight, TrendingUp, Clock, Zap,
  Monitor, Loader2, Shield, Activity,
} from "lucide-react"

/* ── Agent Supervisor Headers ── */
const AGENT_PRESETS: Record<string, { skin: string; hair: string; eyes: string; shirt: string; hairStyle: "short" | "long" | "mohawk" | "bald" | "parted" | "buzz" | "curly" | "ponytail" }> = {
  "project-mgr":       { skin: "#F5D0A9", hair: "#2C1810", eyes: "#1A1A2E", shirt: "#6366F1", hairStyle: "parted" },
  "ops":               { skin: "#FDBCB4", hair: "#8B4513", eyes: "#1A1A2E", shirt: "#22C55E", hairStyle: "curly" },
  "pulse":             { skin: "#D4A574", hair: "#1A1A2E", eyes: "#1A1A2E", shirt: "#F59E0B", hairStyle: "buzz" },
  "customer-success":  { skin: "#F5D0A9", hair: "#8B4513", eyes: "#1A1A2E", shirt: "#EC4899", hairStyle: "long" },
}

function AgentSupervisor({ agent, name, desc, accent, activity }: { agent: string; name: string; desc: string; accent: string; activity?: string }) {
  const ap = AGENT_PRESETS[agent] ?? AGENT_PRESETS.ops
  // Agents not born yet — show ghost state. `agent` IS the canonical template ID.
  return (
    <Link to={`/agents/${agent}`} className="block rounded-lg border border-border/40 px-3 py-2 mb-2 bg-card hover:border-accent-porter/30 transition-colors">
      <div className="flex items-center gap-2.5">
        <div className="grayscale opacity-40">
          <PixelPortrait skin={ap.skin} hair={ap.hair} eyes={ap.eyes} shirt={ap.shirt} hairStyle={ap.hairStyle} size="xs" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-2xs font-bold text-text2">{name}</p>
          <p className="text-2xs text-text3 truncate">{desc}</p>
        </div>
        <span className="flex items-center gap-1 text-2xs text-text3 font-mono shrink-0">
          <span className="size-1.5 rounded-full bg-text3/40" />
          pending
        </span>
      </div>
      {activity && (
        <p className="text-2xs text-text2 mt-1.5 pl-8 truncate">
          <span className="font-bold text-text3">Awaiting forge:</span> {activity}
        </p>
      )}
    </Link>
  )
}

/* ── Types ── */
interface DashboardData {
  projects: { total: number; byStatus: Array<{ status: string; cnt: number }> }
  agents: number; tasks: number; orchestrations: number; decisions: number
  customers: number; sessions: number; messages: number
  tokens: { input: number; output: number; requests: number }
  learnings: number; skills: number; version: string
  recentActivity: Array<{ ts: number; actor: string; action: string; target: string }>
}
interface SystemData {
  memory: { pct: number }; disk: { pct: number }
  cpu: { cores: number; load1m: number }
  sessions: { active: number; concurrent: number }; uptime: number
}
interface LogLine { text: string; color: string }

/* ── Seed data (swap for real endpoints later) ── */
const SEED_PROJECTS = [
  { name: "Marketing Site", status: "active", progress: 65, agents: 3, spark: [3,5,8,4,7,9,6,8], task: "Hero section design review" },
  { name: "Brand Guide", status: "active", progress: 30, agents: 2, spark: [1,2,4,3,5,2,3,4], task: "Color palette finalization" },
  { name: "API Docs", status: "paused", progress: 80, agents: 1, spark: [6,4,2,1,1,0,0,1], task: "Waiting for endpoint changes" },
  { name: "Mobile App", status: "active", progress: 12, agents: 4, spark: [0,0,1,3,5,7,9,11], task: "Wireframe first 3 screens" },
]

const SEED_ACTIVITY_TEMPLATES = [
  { agent: "Moe", action: "logged in from Singapore", status: "complete" as const },
  { agent: "Jacob", action: "created project 'Brand Guide'", status: "complete" as const },
  { agent: "Sarah", action: "assigned 3 agents to Marketing Site", status: "complete" as const },
  { agent: "Moe", action: "edited Porter's Soul.md", status: "complete" as const },
  { agent: "John", action: "signed up (trial)", status: "complete" as const },
  { agent: "Porter", action: "auto-assigned SEO Specialist to Brand Guide", status: "working" as const },
  { agent: "Sarah", action: "sent welcome email to john@acme.com", status: "complete" as const },
  { agent: "Jacob", action: "viewed Agent Templates", status: "complete" as const },
  { agent: "Porter", action: "generated weekly report for Marketing Site", status: "complete" as const },
  { agent: "Moe", action: "updated billing plan to Cloud", status: "complete" as const },
  { agent: "Sarah", action: "deployed API Docs to staging", status: "complete" as const },
  { agent: "Porter", action: "resolved 3 task conflicts in Mobile App", status: "complete" as const },
  { agent: "John", action: "invited team member lisa@acme.com", status: "complete" as const },
  { agent: "Jacob", action: "reviewed Brand Guide deliverables", status: "complete" as const },
  { agent: "Porter", action: "learned new skill: competitor analysis", status: "working" as const },
  { agent: "Sarah", action: "created project 'Q2 Campaign'", status: "complete" as const },
  { agent: "Moe", action: "configured webhook for Slack notifications", status: "complete" as const },
  { agent: "Porter", action: "auto-scaled agents for Marketing Site sprint", status: "complete" as const },
  { agent: "John", action: "completed onboarding checklist", status: "complete" as const },
  { agent: "Jacob", action: "exported Brand Guide assets to Figma", status: "complete" as const },
  { agent: "Porter", action: "summarized 12 tasks for daily standup", status: "complete" as const },
  { agent: "Sarah", action: "ran A/B test on landing hero", status: "complete" as const },
  { agent: "Moe", action: "approved Brand Guide color palette", status: "complete" as const },
  { agent: "Porter", action: "detected anomaly in API response times", status: "working" as const },
  { agent: "John", action: "uploaded brand assets to shared drive", status: "complete" as const },
  { agent: "Jacob", action: "scheduled deployment for Mobile App v0.2", status: "complete" as const },
  { agent: "Sarah", action: "closed 5 support tickets", status: "complete" as const },
  { agent: "Porter", action: "retrained sentiment model on new feedback", status: "complete" as const },
  { agent: "Moe", action: "reviewed Q1 revenue dashboard", status: "complete" as const },
  { agent: "John", action: "connected Stripe integration", status: "complete" as const },
  { agent: "Porter", action: "migrated 3 agents to new skill format", status: "complete" as const },
  { agent: "Sarah", action: "published blog post 'AI Agents in 2026'", status: "complete" as const },
  { agent: "Jacob", action: "fixed broken webhook for Slack", status: "complete" as const },
  { agent: "Moe", action: "set up monitoring alerts for uptime", status: "complete" as const },
  { agent: "Porter", action: "auto-resolved merge conflict in Brand Guide", status: "complete" as const },
  { agent: "John", action: "added 2FA to account", status: "complete" as const },
  { agent: "Sarah", action: "onboarded new client workspace", status: "complete" as const },
  { agent: "Porter", action: "pruned 8 stale agent sessions", status: "complete" as const },
  { agent: "Jacob", action: "benchmarked API response under load", status: "complete" as const },
  { agent: "Moe", action: "renamed project 'MVP' to 'Mobile App'", status: "complete" as const },
  { agent: "Porter", action: "generated accessibility audit for Marketing Site", status: "working" as const },
  { agent: "Sarah", action: "synced CRM contacts from HubSpot", status: "complete" as const },
  { agent: "John", action: "submitted feedback on onboarding flow", status: "complete" as const },
  { agent: "Jacob", action: "tagged release v0.2.8 for admin panel", status: "complete" as const },
  { agent: "Porter", action: "cached 200 embeddings for knowledge base", status: "complete" as const },
  { agent: "Moe", action: "archived project 'Legacy Docs'", status: "complete" as const },
  { agent: "Sarah", action: "created email template for trial expiry", status: "complete" as const },
  { agent: "Porter", action: "routed 14 queries to specialized agents", status: "complete" as const },
  { agent: "John", action: "upgraded workspace to Cloud plan", status: "complete" as const },
  { agent: "Jacob", action: "reviewed Porter's weekly learning summary", status: "complete" as const },
]
const SEED_ACTIVITY = SEED_ACTIVITY_TEMPLATES.map((e, i) => ({ ...e, _sec: i * 180 }))

// Growth curves (fake seed — hockey stick growth)
const REVENUE_CURVE = [0,0,0,200,450,800,1200,1800,2400,3200,4500,5800,7200,8500,9800,11500,13200,15800,18500,22000,26500,32000,38500]
const CUSTOMER_CURVE = [0,1,2,4,7,12,18,28,42,58,78,105,138,175,220,275,340,420,510,620,750,900,1080]

/* ── Helpers ── */
function timeAgo(s: number) {
  if (s < 60) return "now"
  if (s < 120) return "1m"
  return `${Math.floor(s / 60)}m`
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

/* ── Stat tile config ── */
const STAT_TILES = [
  { label: "Projects", key: "projects" as const, icon: FolderKanban, color: "text-accent-porter", link: "/users" },
  { label: "Agents", key: "agents" as const, icon: Bot, color: "text-success", link: "/agents" },
  { label: "Tasks", key: "tasks" as const, icon: Check, color: "text-warning", link: "/activity" },
  { label: "Decisions", key: "decisions" as const, icon: Sparkles, color: "text-chart-2", link: "/activity" },
  { label: "Tokens", key: "tokens" as const, icon: BarChart2, color: "text-chart-3", link: "/billing" },
] as const

/* ── Component ── */
function DashboardContent() {
  const [mounted, setMounted] = useState(false)
  const timeline = SEED_ACTIVITY.map((e, i) => ({ ...e, _key: i }))
  const projectTimeline = SEED_PROJECTS.map((p, i) => ({ ...p, _key: i }))

  // Mount animation trigger
  useMountEffect(() => { requestAnimationFrame(() => setMounted(true)) })

  // Logs via useQuery (60s refresh, SSE handles real-time)
  const { data: logsData } = useQuery({
    queryKey: ["admin", "logs"],
    queryFn: () => api<{ logs: Array<{ ts: number; text: string; color: string }> }>("/api/admin/health/logs?limit=6"),
    refetchInterval: 60_000,
  })
  const termLines = (logsData?.logs ?? []).map((l, i) => ({ ...l, _key: i }))

  const { data: d } = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: () => api<DashboardData>("/api/admin/health/dashboard"),
    refetchInterval: 60_000,
  })
  const { data: sys } = useQuery({
    queryKey: ["admin", "system"],
    queryFn: () => api<SystemData>("/api/admin/system"),
    refetchInterval: 60_000,
  })

  if (!d) return (
    <div className="flex items-center justify-center py-20">
      <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
    </div>
  )

  // Non-null alias for use inside nested functions (TS can't narrow `d` past the guard above)
  const dd = d
  const totalTokens = dd.tokens.input + dd.tokens.output
  const activeProjects = dd.projects.byStatus.find(s => s.status === "active")?.cnt ?? 0

  function statValue(key: typeof STAT_TILES[number]["key"]) {
    switch (key) {
      case "projects": return dd.projects.total
      case "agents": return dd.agents
      case "tasks": return dd.tasks
      case "decisions": return dd.decisions
      case "tokens": return totalTokens
    }
  }
  function statSub(key: typeof STAT_TILES[number]["key"]) {
    switch (key) {
      case "projects": return `${activeProjects} active`
      case "agents": return `${dd.skills} skills`
      case "tasks": return "today"
      case "decisions": return `${dd.learnings} learnings`
      case "tokens": return `${dd.tokens.requests} requests`
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-var(--header-height)-2rem)] overflow-hidden">
      <div className="shrink-0 space-y-3">

        {/* ── Hero ── */}
        <div
          className={`rounded-xl border border-accent-porter/20 bg-gradient-to-br from-accent-porter/5 via-surface to-background p-4 transition-all duration-[var(--duration-long)] ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}
          style={{ transitionDelay: "var(--duration-instant)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <p className="text-sm font-black tracking-tight text-accent-porter">askporter.app</p>
            <span className="text-2xs text-text3/40 font-medium">March 2026</span>
            <div className="flex-1" />
            <button className="flex items-center gap-1.5 rounded-md border border-accent-porter/30 bg-accent-porter/5 px-2.5 py-1 text-2xs font-bold text-accent-porter hover:bg-accent-porter/10 transition-all">
              <XIcon className="h-2.5 w-2.5" /> Share
            </button>
          </div>

          <div className="grid grid-cols-4 gap-4">
            {/* ARR — with sparkline */}
            <div className="rounded-lg border border-success/20 bg-success/3 p-3 relative overflow-hidden">
              <p className="text-2xs font-semibold uppercase text-text3/50 mb-1">ARR</p>
              <p className="text-2xl font-black text-success tabular-nums tracking-tight">$462k</p>
              <span className="flex items-center gap-0.5 text-sm font-black text-success mt-1"><TrendingUp className="h-3.5 w-3.5" />+47%<span className="text-2xs font-bold text-text3/40 ml-0.5">m/m</span></span>
              <div className="absolute bottom-0 right-0 w-[60%] opacity-40">
                <AreaChart values={REVENUE_CURVE} color="var(--success)" height={32} glow={false} animate={mounted} />
              </div>
            </div>

            {/* NRR — with gauge arc */}
            <div className="rounded-lg border border-accent-porter/20 bg-accent-porter/3 p-3 relative overflow-hidden">
              <p className="text-2xs font-semibold uppercase text-text3/50 mb-1">NRR</p>
              <p className="text-2xl font-black text-accent-porter tabular-nums tracking-tight">127%</p>
              <span className="flex items-center gap-0.5 text-sm font-black text-accent-porter mt-1"><TrendingUp className="h-3.5 w-3.5" />+8%<span className="text-2xs font-bold text-text3/40 ml-0.5">q/q</span></span>
              <svg viewBox="0 0 60 35" className="absolute bottom-1 right-2 w-[45%] opacity-30">
                <path d="M 5 32 A 25 25 0 0 1 55 32" fill="none" stroke="var(--accent-porter)" strokeWidth={3} strokeLinecap="round"
                  strokeDasharray={`${Math.PI * 25}`}
                  strokeDashoffset={`${Math.PI * 25 * (1 - 127 / 150)}`} />
              </svg>
            </div>

            {/* Margin — with revenue/cost bars */}
            <div className="rounded-lg border border-warning/20 bg-warning/3 p-3">
              <p className="text-2xs font-semibold uppercase text-text3/50 mb-1">Margin</p>
              <p className="text-2xl font-black text-warning tabular-nums tracking-tight">82%</p>
              <span className="flex items-center gap-0.5 text-sm font-black text-warning mt-1"><TrendingUp className="h-3.5 w-3.5" />+3%<span className="text-2xs font-bold text-text3/40 ml-0.5">m/m</span></span>
              <div className="mt-2 space-y-1">
                <div className="h-1.5 rounded-full bg-success/30 overflow-hidden"><div className="h-full rounded-full bg-success" style={{ width: "100%" }} /></div>
                <div className="h-1.5 rounded-full bg-danger/30 overflow-hidden"><div className="h-full rounded-full bg-danger/60" style={{ width: "18%" }} /></div>
              </div>
            </div>

            {/* Customers — with pixel avatars */}
            <div className="rounded-lg border border-chart-2/20 bg-chart-2/3 p-3 relative overflow-hidden">
              <p className="text-2xs font-semibold uppercase text-text3/50 mb-1">Customers</p>
              <p className="text-2xl font-black text-chart-2 tabular-nums tracking-tight">1,080</p>
              <span className="flex items-center gap-0.5 text-sm font-black text-chart-2 mt-1"><TrendingUp className="h-3.5 w-3.5" />+62%<span className="text-2xs font-bold text-text3/40 ml-0.5">m/m</span></span>
              <div className="absolute bottom-1.5 right-2 flex -space-x-1 opacity-30">
                <PixelPortrait skin="#F5D0A9" hair="#2C1810" eyes="#1A1A2E" shirt="#6366F1" hairStyle="short" size="xs" />
                <PixelPortrait skin="#FDBCB4" hair="#8B4513" eyes="#1A1A2E" shirt="#22C55E" hairStyle="curly" size="xs" />
                <PixelPortrait skin="#D4A574" hair="#1A1A2E" eyes="#1A1A2E" shirt="#F59E0B" hairStyle="long" size="xs" />
              </div>
            </div>
          </div>

          {/* Bottom metrics row */}
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/20">
            <span className="flex items-center gap-1.5 text-2xs"><Zap className="h-3.5 w-3.5 text-warning" /><span className="font-bold text-warning">$148k</span><span className="text-text3/50">value created</span></span>
            <span className="flex items-center gap-1.5 text-2xs"><Clock className="h-3.5 w-3.5 text-chart-2" /><span className="font-bold text-chart-2">2,840h</span><span className="text-text3/50">saved</span></span>
            <span className="flex items-center gap-1.5 text-2xs"><Bot className="h-3.5 w-3.5 text-accent-porter" /><span className="font-bold text-foreground">{d?.agents ?? 0}</span><span className="text-text3/50">agents</span></span>
            <span className="flex items-center gap-1.5 text-2xs"><FolderKanban className="h-3.5 w-3.5 text-accent-porter" /><span className="font-bold text-foreground">{d?.projects.total ?? 0}</span><span className="text-text3/50">projects</span></span>
            <span className="flex items-center gap-1.5 text-2xs"><Check className="h-3.5 w-3.5 text-success" /><span className="font-bold text-foreground"><AnimCount to={d?.tasks ?? 0} duration={2000} /></span><span className="text-text3/50">tasks done</span></span>
            <div className="flex-1" />
            <span className="text-2xs font-bold text-accent-porter/40">askporter.app</span>
          </div>
        </div>

      </div>

      {/* ── Two columns: Projects + Activity ── */}
      <div className="flex flex-col lg:flex-row gap-3 flex-1 min-h-0 mt-3">

        {/* Projects — agent owns the whole section */}
        <div className="lg:w-1/2 min-w-0 flex flex-col h-full rounded-lg border border-accent-porter/20 bg-gradient-to-b from-accent-porter/3 to-transparent p-3">
          <AgentSupervisor agent="project-mgr" name="Project Manager" desc="Tracking progress, assigning agents, reporting blockers" accent="text-accent-porter" activity={`Monitoring ${d?.projects.total ?? 0} projects · ${d?.projects.byStatus.find(s => s.status === "active")?.cnt ?? 0} active sprints`} />
          <div className="flex items-center justify-between mb-2 shrink-0">
            <h2 className="text-xs font-bold text-foreground uppercase tracking-wide">Projects</h2>
            <button className="text-2xs text-text3 hover:text-accent-porter transition-colors">all &rarr;</button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 min-h-0 scrollbar-thin pt-px">
            {projectTimeline.map((p, i) => (
              <div
                key={p._key}
                className={`group rounded-lg border border-border bg-surface p-3 cursor-pointer transition-all duration-[var(--duration-fast)] hover:border-accent-porter/30 hover:shadow-[var(--shadow-card)] hover:-translate-y-px ${mounted ? "animate-card-deal-in" : "opacity-0"}`}
                style={{ animationDelay: `calc(var(--duration-normal) + ${i} * var(--stagger-delay) * 2)`, animationFillMode: "both" }}
              >
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold text-foreground truncate flex-1 min-w-0">{p.name}</p>
                  <Sparkline values={p.spark} />
                  <Badge className={`text-2xs px-1.5 py-0 ${p.status === "active" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>{p.status}</Badge>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex-1 h-1 rounded-full bg-raised overflow-hidden">
                    <div className="h-full rounded-full bg-accent-porter transition-all duration-[var(--duration-chart)] ease-out" style={{ width: `${p.progress}%` }} />
                  </div>
                  <span className="text-2xs text-text3 tabular-nums w-8 text-right">{p.progress}%</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <p className="text-2xs text-text3 truncate min-w-0"><span className="text-text2">Next:</span> {p.task}</p>
                  <span className="text-2xs text-text3 shrink-0">{p.agents} agents</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Activity — agent owns the whole section */}
        <div className="lg:w-1/2 min-w-0 flex flex-col h-full rounded-lg border border-success/20 bg-gradient-to-b from-success/3 to-transparent p-3">
          <AgentSupervisor agent="ops" name="Operations" desc="Monitoring all platform activity, detecting patterns" accent="text-success" activity={`Processed ${d?.decisions ?? 0} decisions · ${d?.tasks ?? 0} tasks completed today`} />
          <div className="flex items-center justify-between mb-2 shrink-0">
            <h2 className="text-xs font-bold text-foreground uppercase tracking-wide flex items-center gap-1.5">
              Activity
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-badge" />
            </h2>
            <Link to="/activity" className="text-2xs text-text3 hover:text-accent-porter transition-colors">all &rarr;</Link>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
            {timeline.map((e, i) => (
              <div
                key={e._key}
                className={`flex items-center gap-2 rounded-md py-1.5 px-2 cursor-pointer hover:bg-raised/50 transition-all duration-[var(--duration-slow)] ease-out ${i === 0 ? "animate-slide-down" : ""}`}
              >
                <div className={`h-2 w-2 rounded-full shrink-0 ${e.status === "working" ? "bg-accent-porter animate-pulse-badge" : "bg-success"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-2xs text-foreground break-words"><span className="font-bold">{e.agent}</span> {e.action}</p>
                </div>
                {e.status === "working" && <Loader2 className="h-2.5 w-2.5 animate-spin text-accent-porter shrink-0" />}
                <span className="text-2xs text-text3 shrink-0">{i === 0 ? "now" : timeAgo(e._sec)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Bottom: System Health + User Logs ── */}
      <div className="shrink-0 mt-3 rounded-lg border border-border bg-card p-3">
        <div className="flex flex-col lg:flex-row gap-3">

          {/* System Health */}
          <div className="lg:w-1/2 min-w-0">
            <AgentSupervisor agent="pulse" name="Pulse" desc="Watching metrics, predicting resource exhaustion, detecting anomalies" accent="text-warning" activity={sys ? `CPU ${Math.round(sys.cpu.load1m / sys.cpu.cores * 100)}% · MEM ${sys.memory.pct}% · ${sys.sessions.concurrent} online · up ${Math.floor(sys.uptime / 3600)}h` : "Connecting to system..."} />
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="flex items-center gap-2 bg-surface px-3 py-1.5 border-b border-border">
                <div className="flex gap-1">
                  <div className="h-2 w-2 rounded-full bg-danger/60" />
                  <div className="h-2 w-2 rounded-full bg-warning/60" />
                  <div className="h-2 w-2 rounded-full bg-success/60" />
                </div>
                <div className="flex items-center gap-1.5 flex-1">
                  <Monitor className="h-3 w-3 text-accent-porter" />
                  <span className="text-2xs font-mono text-text3">System Health</span>
                </div>
                <Link to="/system" className="text-2xs text-text3 hover:text-accent-porter font-mono">details →</Link>
              </div>
              <div className="bg-surface p-2.5 font-mono text-2xs leading-[1.8]">
                {sys ? (
                  <>
                    {[
                      { label: "MEM", pct: sys.memory.pct },
                      { label: "CPU", pct: Math.round(sys.cpu.load1m / sys.cpu.cores * 100) },
                      { label: "DSK", pct: sys.disk.pct },
                    ].map(g => (
                      <div key={g.label} className="flex items-center gap-2">
                        <span className="w-6 text-text3">{g.label}</span>
                        <div className="flex-1 h-2 rounded-sm bg-raised/30 overflow-hidden">
                          <div
                            className={`h-full rounded-sm transition-all duration-[var(--duration-long)] ${g.pct >= 90 ? "bg-danger" : g.pct >= 70 ? "bg-warning" : "bg-success/70"}`}
                            style={{ width: `${g.pct}%` }}
                          />
                        </div>
                        <span className={`w-8 text-right tabular-nums ${g.pct >= 80 ? "text-danger" : "text-text3"}`}>{g.pct}%</span>
                      </div>
                    ))}
                    <p className="text-text3 mt-1">
                      <span className={sys.sessions.concurrent > 0 ? "text-success" : ""}>{sys.sessions.concurrent} online</span> · load {sys.cpu.load1m.toFixed(2)} · {sys.cpu.cores} cores · up {Math.floor(sys.uptime / 3600)}h
                    </p>
                  </>
                ) : <p className="text-text3">loading...</p>}
              </div>
            </div>
          </div>

          {/* System Log */}
          <div className="lg:w-1/2 min-w-0">
            <AgentSupervisor agent="customer-success" name="Customer Success" desc="Monitoring user behavior, flagging churn signals" accent="text-chart-3" activity={`Watching ${d?.customers ?? 0} customers · ${d?.sessions ?? 0} active sessions`} />
            <LLMTerminal lines={termLines} title="User Logs" className="h-[120px]" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function HomePage() {
  return (
      <div className="overflow-y-auto p-4 flex-1">
        <DashboardContent />
      </div>
  )
}
