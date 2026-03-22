import { useState } from "react"
import { useMountEffect } from "~/hooks/use-mount-effect"
import { AdminShell } from "~/components/layout/admin-shell"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { AnimCount } from "~/components/ui/anim-count"
import { Sparkline } from "~/components/ui/sparkline"
import { LLMTerminal } from "~/components/llm-terminal"
import { Link } from "react-router"
import {
  FolderKanban, Bot, Check, Sparkles, BarChart2,
  ArrowRight, TrendingUp, Clock, Zap,
  Monitor, Loader2,
} from "lucide-react"

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

const CHART_BARS = [12,18,15,22,28,25,35,32,41,38,45,52,48,55,62,58,68,72,65,78,82,75,88,92,85,95,98,90,100,96]
const MAX_TIMELINE = 200
const MAX_PROJECTS = 6

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
  const [elapsed, setElapsed] = useState(0)
  const [timeline, setTimeline] = useState(SEED_ACTIVITY.map((e, i) => ({ ...e, _key: i })))
  const [projectTimeline, setProjectTimeline] = useState(SEED_PROJECTS.map((p, i) => ({ ...p, _key: i })))
  const [termLines, setTermLines] = useState<Array<LogLine & { _key: number }>>([])

  // Mount animation trigger
  useMountEffect(() => { requestAnimationFrame(() => setMounted(true)) })

  // Elapsed seconds for relative timestamps
  useMountEffect(() => {
    const id = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(id)
  })

  // Rotate activity feed
  useMountEffect(() => {
    let idx = 0
    const id = setInterval(() => {
      const n = SEED_ACTIVITY[idx % SEED_ACTIVITY.length]
      idx++
      setTimeline(p => [{ ...n, _key: Date.now() }, ...p].slice(0, MAX_TIMELINE))
    }, 5000)
    return () => clearInterval(id)
  })

  // Rotate projects
  useMountEffect(() => {
    let idx = 0
    const id = setInterval(() => {
      const p = SEED_PROJECTS[idx % SEED_PROJECTS.length]
      idx++
      setProjectTimeline(prev => [{ ...p, _key: Date.now() }, ...prev].slice(0, MAX_PROJECTS))
    }, 8000)
    return () => clearInterval(id)
  })

  // Fetch real logs
  useMountEffect(() => {
    async function fetchLogs() {
      try {
        const res = await api<{ logs: Array<{ ts: number; text: string; color: string }> }>("/api/admin/health/logs?limit=6")
        setTermLines(res.logs.map((l, i) => ({ ...l, _key: Date.now() + i })))
      } catch { /* admin logs are non-critical */ }
    }
    fetchLogs()
    const id = setInterval(fetchLogs, 10_000)
    return () => clearInterval(id)
  })

  const { data: d } = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: () => api<DashboardData>("/api/admin/health/dashboard"),
    refetchInterval: 15_000,
  })
  const { data: sys } = useQuery({
    queryKey: ["admin", "system"],
    queryFn: () => api<SystemData>("/api/admin/system"),
    refetchInterval: 10_000,
  })

  if (!d) return (
    <div className="flex items-center justify-center py-20">
      <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
    </div>
  )

  const totalTokens = d.tokens.input + d.tokens.output
  const activeProjects = d.projects.byStatus.find(s => s.status === "active")?.cnt ?? 0

  function statValue(key: typeof STAT_TILES[number]["key"]) {
    switch (key) {
      case "projects": return d.projects.total
      case "agents": return d.agents
      case "tasks": return d.tasks
      case "decisions": return d.decisions
      case "tokens": return totalTokens
    }
  }
  function statSub(key: typeof STAT_TILES[number]["key"]) {
    switch (key) {
      case "projects": return `${activeProjects} active`
      case "agents": return `${d.skills} skills`
      case "tasks": return "today"
      case "decisions": return `${d.learnings} learnings`
      case "tokens": return `${d.tokens.requests} requests`
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-var(--header-height)-2rem)] overflow-hidden">
      <div className="shrink-0 space-y-3">

        {/* ── Hero ── */}
        <div
          className={`rounded-xl border border-accent-porter/20 bg-gradient-to-br from-accent-porter/5 via-surface to-background p-5 transition-all duration-[var(--duration-long)] ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}
          style={{ transitionDelay: "var(--duration-instant)" }}
        >
          <div className="flex justify-end -mt-1 -mr-1 mb-1">
            <button className="flex items-center gap-1.5 rounded-md border border-border bg-raised/50 px-2 py-1 text-[9px] font-bold text-text3 transition-all hover:border-foreground hover:text-foreground hover:-translate-y-px hover:shadow-[var(--shadow-sm)]">
              <XIcon className="h-2.5 w-2.5" /> Post
            </button>
          </div>
          <div className="flex flex-col md:flex-row md:items-end gap-4 md:gap-6 min-w-0">
            <div className="flex-1 min-w-0 pb-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-accent-porter">This Month</p>
              <p className="mt-1 text-3xl md:text-4xl font-black text-foreground tabular-nums tracking-tight">
                <AnimCount to={d.tasks} duration={2000} /> <span className="text-base md:text-lg font-bold text-text3">tasks</span>
              </p>
              <p className="text-sm text-text2 mt-0.5">completed autonomously by {d.agents} agents across {d.projects.total} projects</p>
              <div className="flex items-center gap-4 mt-3">
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-1"><TrendingUp className="h-3 w-3 text-success" /><span className="text-xs font-bold text-success">+62%</span></div>
                  <span className="text-[9px] text-text3">vs last month</span>
                </div>
                <div className="h-6 w-px bg-border" />
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-1"><Clock className="h-3 w-3 text-chart-2" /><span className="text-xs font-bold text-chart-2">~124 hrs</span></div>
                  <span className="text-[9px] text-text3">saved</span>
                </div>
                <div className="h-6 w-px bg-border" />
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-1"><Zap className="h-3 w-3 text-warning" /><span className="text-xs font-bold text-warning">$2,480</span></div>
                  <span className="text-[9px] text-text3">value</span>
                </div>
              </div>
            </div>
            <div className="w-full md:w-2/5 min-w-0">
              <div className="flex items-end gap-[3px] h-[90px]">
                {CHART_BARS.map((v, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t-sm transition-all duration-[var(--duration-long)] ease-out"
                    style={{
                      height: mounted ? `${v}%` : "0%",
                      background: "linear-gradient(to top, var(--accent-porter), color-mix(in srgb, var(--accent-porter) 30%, transparent))",
                      opacity: 0.3 + (v / 100) * 0.7,
                      transitionDelay: `calc(var(--duration-long) + ${i} * var(--stagger-delay))`,
                    }}
                  />
                ))}
              </div>
              <div className="flex justify-between items-center mt-1.5">
                <span className="text-[8px] text-text3">Mar 1</span>
                <span className="text-[8px] text-text3">Mar 10</span>
                <span className="text-[8px] text-text3 flex items-center gap-1">Mar 22 · <span className="opacity-50">askporter.app</span></span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Stat tiles ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {STAT_TILES.map((s, i) => (
            <Link
              key={s.label}
              to={s.link}
              className={`group rounded-lg border border-border bg-surface px-3 py-2 cursor-pointer transition-all duration-[var(--duration-slow)] hover:border-accent-porter/30 hover:-translate-y-px hover:shadow-[var(--shadow-sm)] ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
              style={{ transitionDelay: `calc(${i} * var(--stagger-delay) * 2)` }}
            >
              <div className="flex items-center justify-between">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-text3">{s.label}</p>
                <s.icon className={`h-3 w-3 ${s.color}`} />
              </div>
              <p className="text-lg font-bold text-foreground tabular-nums leading-tight">
                {s.key === "tokens" ? totalTokens.toLocaleString() : <AnimCount to={statValue(s.key)} />}
              </p>
              <div className="flex items-center justify-between">
                <p className="text-[9px] text-text3">{statSub(s.key)}</p>
                <ArrowRight className="h-2.5 w-2.5 text-text3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>
          ))}
        </div>

      </div>

      {/* ── Two columns: Projects + Activity ── */}
      <div className="flex flex-col lg:flex-row gap-3 flex-1 min-h-0 mt-3">

        {/* Projects */}
        <div className="lg:w-1/2 min-w-0 flex flex-col h-full">
          <div className="flex items-center justify-between mb-2 shrink-0">
            <h2 className="text-xs font-bold text-foreground uppercase tracking-wide">Projects</h2>
            <button className="text-[10px] text-text3 hover:text-accent-porter transition-colors">all &rarr;</button>
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
                  <Badge className={`text-[9px] px-1.5 py-0 ${p.status === "active" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>{p.status}</Badge>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex-1 h-1 rounded-full bg-raised overflow-hidden">
                    <div className="h-full rounded-full bg-accent-porter transition-all duration-[var(--duration-chart)] ease-out" style={{ width: `${p.progress}%` }} />
                  </div>
                  <span className="text-[9px] text-text3 tabular-nums w-8 text-right">{p.progress}%</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <p className="text-[10px] text-text3 truncate min-w-0"><span className="text-text2">Next:</span> {p.task}</p>
                  <span className="text-[9px] text-text3 shrink-0">{p.agents} agents</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Activity */}
        <div className="lg:w-1/2 min-w-0 flex flex-col h-full">
          <div className="flex items-center justify-between mb-2 shrink-0">
            <h2 className="text-xs font-bold text-foreground uppercase tracking-wide flex items-center gap-1.5">
              Activity
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-badge" />
            </h2>
            <Link to="/activity" className="text-[10px] text-text3 hover:text-accent-porter transition-colors">all &rarr;</Link>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
            {timeline.map((e, i) => (
              <div
                key={e._key}
                className={`flex items-center gap-2 rounded-md py-1.5 px-2 cursor-pointer hover:bg-raised/50 transition-all duration-[var(--duration-slow)] ease-out ${i === 0 ? "animate-slide-down" : ""}`}
              >
                <div className={`h-2 w-2 rounded-full shrink-0 ${e.status === "working" ? "bg-accent-porter animate-pulse-badge" : "bg-success"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-foreground break-words"><span className="font-bold">{e.agent}</span> {e.action}</p>
                </div>
                {e.status === "working" && <Loader2 className="h-2.5 w-2.5 animate-spin text-accent-porter shrink-0" />}
                <span className="text-[8px] text-text3 shrink-0">{i === 0 ? "now" : timeAgo(e._sec + elapsed)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Bottom bar ── */}
      <div className="h-[var(--bottom-bar-height)] shrink-0 border-t border-border bg-background overflow-hidden">
        <div className="py-2 h-full flex flex-col lg:flex-row gap-3">

          {/* System Health */}
          <div className="lg:w-1/2 min-w-0 overflow-hidden">
            <div className="rounded-lg border border-border overflow-hidden h-full">
              <div className="flex items-center gap-2 bg-[var(--terminal-bg)] px-3 py-1.5 border-b border-border">
                <div className="flex gap-1">
                  <div className="h-2 w-2 rounded-full bg-danger/60" />
                  <div className="h-2 w-2 rounded-full bg-warning/60" />
                  <div className="h-2 w-2 rounded-full bg-success/60" />
                </div>
                <div className="flex items-center gap-1.5 flex-1">
                  <Monitor className="h-3 w-3 text-accent-porter" />
                  <span className="text-[10px] font-mono text-text3">System Health</span>
                </div>
                <Link to="/system" className="text-[9px] text-text3 hover:text-accent-porter font-mono">details →</Link>
              </div>
              <div className="bg-[var(--terminal-bg)] p-2.5 font-mono text-[10px] leading-[1.8]">
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
          <div className="lg:w-1/2 min-w-0 overflow-hidden">
            <LLMTerminal lines={termLines} title="User Logs" className="h-full" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function HomePage() {
  return (
    <AdminShell>
      <DashboardContent />
    </AdminShell>
  )
}
