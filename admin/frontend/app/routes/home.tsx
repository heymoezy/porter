import { useState } from "react"
import { useMountEffect } from "~/hooks/use-mount-effect"
import { AdminShell } from "~/components/layout/admin-shell"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { AnimCount } from "~/components/ui/anim-count"
import { LLMTerminal } from "~/components/llm-terminal"
import { Link } from "react-router"
import {
  FolderKanban, Bot, Check, Sparkles, BarChart2,
  ArrowRight, TrendingUp, Clock, Zap,
  Monitor, HardDrive, Cpu, Settings, ArrowUpRight,
} from "lucide-react"

/* ── Types ── */

interface DashboardData {
  projects: { total: number; byStatus: Array<{ status: string; cnt: number }> }
  agents: number; chats: number; messages: number; agentMessages: number
  tasks: number; orchestrations: number; decisions: number
  customers: number; sessions: number
  tokens: { input: number; output: number; requests: number }
  learnings: number; auditEvents: number; emails: number; skills: number
  recentActivity: Array<{ ts: number; actor: string; action: string; target: string }>
  version: string
}

interface SystemData {
  memory: { pct: number; used: number; total: number }
  disk: { pct: number; used: number; total: number }
  cpu: { cores: number; load1m: number }
  sessions: { active: number }
  uptime: number
  runtimes: Array<{ name: string; status: string; latencyMs: number }>
}

/* ── Helpers ── */

function fmtRel(ts: number) {
  const d = Date.now() / 1000 - ts
  if (d < 60) return "now"
  if (d < 3600) return `${Math.floor(d / 60)}m`
  if (d < 86400) return `${Math.floor(d / 3600)}h`
  return `${Math.floor(d / 86400)}d`
}

function fmtBytes(b: number) {
  if (!b) return "0"
  const k = 1024, s = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(b) / Math.log(k))
  return `${(b / Math.pow(k, i)).toFixed(0)}${s[i]}`
}

/* ── Bar chart data ── */
const CHART_BARS = [12,18,15,22,28,25,35,32,41,38,45,52,48,55,62,58,68,72,65,78,82,75,88,92,85,95,98,90,100,96]

/* ── System log seed ── */
const LOG_STREAM = [
  { text: "▸ auth.login.ok → moe (127.0.0.1)", color: "text-success" },
  { text: "▸ dispatch → porter-core → chat-orchestrator", color: "text-accent-porter" },
  { text: "  tokens: 1,204 in / 328 out · 1.2s", color: "text-text3" },
  { text: "▸ persona.heartbeat → porter-core healthy", color: "text-success" },
  { text: "◆ memory: extracted 2 learnings from session", color: "text-chart-3" },
  { text: "▸ project.update → First Mission → active", color: "text-warning" },
  { text: "▸ skill.assign → daily-joke → humor-writer", color: "text-chart-2" },
  { text: "✓ agent task: growth → onboarding email queued", color: "text-success" },
  { text: "▸ session.create → moe · expires 30d", color: "text-text3" },
  { text: "◆ decision: route to openclaw (cost-optimal)", color: "text-warning" },
]

/* ── XIcon ── */
function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  )
}

/* ── Main ── */

function DashboardContent() {
  const [mounted, setMounted] = useState(false)
  const [termLines, setTermLines] = useState(LOG_STREAM.slice(0, 4).map((l, i) => ({ ...l, _key: i })))

  useMountEffect(() => { requestAnimationFrame(() => setMounted(true)) })

  useMountEffect(() => {
    let idx = 4
    const id = setInterval(() => {
      const l = LOG_STREAM[idx % LOG_STREAM.length]
      idx++
      setTermLines(p => [...p.slice(-3), { ...l, _key: Date.now() }])
    }, 3000)
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

  if (!d) return <div className="flex items-center justify-center py-20"><div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" /></div>

  const totalTokens = d.tokens.input + d.tokens.output
  const activeProjects = d.projects.byStatus.find(s => s.status === "active")?.cnt ?? 0

  return (
    <div className="flex flex-col h-[calc(100vh-var(--header-height)-2rem)]">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-3">

        {/* ── Hero (from hero-stats.tsx) ────────── */}
        <div
          className={`rounded-xl border border-accent-porter/20 bg-gradient-to-br from-accent-porter/5 via-surface to-background p-5 transition-all duration-700 ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
          }`}
          style={{ transitionDelay: "100ms" }}
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
                  <div className="flex items-center gap-1"><TrendingUp className="h-3 w-3 text-success" /><span className="text-xs font-bold text-success">+{d.orchestrations}</span></div>
                  <span className="text-[9px] text-text3">orchestrations</span>
                </div>
                <div className="h-6 w-px bg-border" />
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-1"><Clock className="h-3 w-3 text-chart-2" /><span className="text-xs font-bold text-chart-2">~{d.learnings} hrs</span></div>
                  <span className="text-[9px] text-text3">saved</span>
                </div>
                <div className="h-6 w-px bg-border" />
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-1"><Zap className="h-3 w-3 text-warning" /><span className="text-xs font-bold text-warning">${totalTokens > 0 ? Math.round(totalTokens * 0.003) : 0}</span></div>
                  <span className="text-[9px] text-text3">value</span>
                </div>
              </div>
            </div>
            <div className="w-full md:w-2/5 min-w-0">
              <div className="flex items-end gap-[3px] h-[90px]">
                {CHART_BARS.map((v, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t-sm transition-all duration-700 ease-out"
                    style={{
                      height: mounted ? `${v}%` : "0%",
                      background: "linear-gradient(to top, var(--accent-porter), color-mix(in srgb, var(--accent-porter) 30%, transparent))",
                      opacity: 0.3 + (v / 100) * 0.7,
                      transitionDelay: `${800 + i * 30}ms`,
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

        {/* ── Stat tiles (from stat-tiles.tsx) ──── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {([
            { label: "Projects", value: d.projects.total, icon: FolderKanban, color: "text-accent-porter", sub: `${activeProjects} active`, link: "/users" },
            { label: "Agents", value: d.agents, icon: Bot, color: "text-success", sub: `${d.skills} skills`, link: "/agents" },
            { label: "Tasks", value: d.tasks, icon: Check, color: "text-warning", sub: `${d.orchestrations} runs`, link: "/activity" },
            { label: "Decisions", value: d.decisions, icon: Sparkles, color: "text-chart-2", sub: `${d.learnings} learnings`, link: "/activity" },
            { label: "Tokens", value: totalTokens, icon: BarChart2, color: "text-chart-3", sub: `${d.tokens.requests} requests`, link: "/billing" },
          ] as const).map((s, i) => (
            <Link
              key={s.label}
              to={s.link}
              className={`group rounded-lg border border-border bg-surface px-3 py-2 cursor-pointer transition-all duration-300 hover:border-accent-porter/30 hover:-translate-y-px hover:shadow-[var(--shadow-sm)] ${
                mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
              }`}
              style={{ transitionDelay: `${80 + i * 50}ms` }}
            >
              <div className="flex items-center justify-between">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-text3">{s.label}</p>
                <s.icon className={`h-3 w-3 ${s.color}`} />
              </div>
              <p className="text-lg font-bold text-foreground tabular-nums leading-tight">
                {s.label === "Tokens" ? totalTokens.toLocaleString() : <AnimCount to={s.value} />}
              </p>
              <div className="flex items-center justify-between">
                <p className="text-[9px] text-text3">{s.sub}</p>
                <ArrowRight className="h-2.5 w-2.5 text-text3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>
          ))}
        </div>

        {/* ── Two columns (Activity + SaaS) ──── */}
        <div className="flex flex-col lg:flex-row gap-3">
          {/* User Activity (matches ActivityFeed pattern) */}
          <div className="lg:w-1/2 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-bold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                Activity
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-badge" />
              </h2>
              <Link to="/activity" className="text-[10px] text-text3 hover:text-accent-porter transition-colors">all &rarr;</Link>
            </div>
            <div>
              {d.recentActivity.map((e, i) => (
                <div key={i} className="flex items-center gap-2 rounded-md py-1.5 px-2 cursor-pointer hover:bg-surface transition-all duration-300 ease-out">
                  <div className={`h-2 w-2 rounded-full shrink-0 ${
                    e.action.includes("login") ? "bg-success" : e.action.includes("logout") ? "bg-border2" : "bg-accent-porter"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-foreground break-words">
                      <span className="font-bold">{e.actor}</span> {e.action.replace(/\./g, " ")}
                    </p>
                  </div>
                  <span className="text-[8px] text-text3 shrink-0">{fmtRel(e.ts)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* SaaS Metrics */}
          <div className="lg:w-1/2 min-w-0">
            <h2 className="text-xs font-bold text-foreground uppercase tracking-wide mb-2">SaaS Metrics</h2>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Customers", value: d.customers, icon: Bot, color: "text-accent-porter" },
                { label: "MRR", value: "$0", icon: BarChart2, color: "text-success" },
                { label: "Messages", value: d.messages, icon: Check, color: "text-warning" },
                { label: "Emails", value: d.emails, icon: Sparkles, color: "text-chart-2" },
              ].map((m, i) => (
                <div key={i} className="rounded-lg border border-border bg-surface px-3 py-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-text3">{m.label}</p>
                    <m.icon className={`h-3 w-3 ${m.color}`} />
                  </div>
                  <p className="text-lg font-bold text-foreground tabular-nums leading-tight">
                    {typeof m.value === "number" ? <AnimCount to={m.value} /> : m.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom bar (matches dashboard-mockup exactly) ── */}
      <div className="h-[140px] shrink-0 border-t border-border bg-background overflow-hidden">
        <div className="py-2 h-full">
          <div className="flex flex-col lg:flex-row gap-3 h-full">
            {/* System Health (replaces Project Ideas) */}
            <div className="lg:w-1/2 min-w-0 overflow-hidden">
              <div className="flex items-center justify-between mb-1.5">
                <h2 className="text-xs font-bold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Monitor className="h-3 w-3 text-accent-porter" />
                  System Health
                </h2>
                <Link to="/system" className="text-[9px] text-text3 hover:text-accent-porter transition-colors flex items-center gap-1">
                  <Settings className="h-2.5 w-2.5" /> details
                </Link>
              </div>
              {sys && (
                <div className="space-y-1.5">
                  {[
                    { icon: Monitor, label: "Memory", value: `${sys.memory.pct}%`, detail: `${fmtBytes(sys.memory.used)} / ${fmtBytes(sys.memory.total)}`, warn: sys.memory.pct >= 80 },
                    { icon: HardDrive, label: "Disk", value: `${sys.disk.pct}%`, detail: `${fmtBytes(sys.disk.used)} / ${fmtBytes(sys.disk.total)}`, warn: sys.disk.pct >= 80 },
                    { icon: Cpu, label: "CPU", value: `${Math.round(sys.cpu.load1m / sys.cpu.cores * 100)}%`, detail: `${sys.cpu.cores} cores · load ${sys.cpu.load1m.toFixed(1)}`, warn: sys.cpu.load1m > sys.cpu.cores },
                  ].map(g => (
                    <div key={g.label} className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 hover:border-accent-porter/30 hover:-translate-y-px transition-all duration-300">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent-porter/10">
                        <g.icon className="h-3 w-3 text-accent-porter" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-foreground">{g.label}: <span className={g.warn ? "text-danger" : ""}>{g.value}</span></p>
                        <p className="text-[9px] text-text3 truncate">{g.detail}</p>
                      </div>
                      <span className="text-[9px] text-text3">{sys.sessions.active} sessions</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* System Log (replaces LLM Activity) */}
            <div className="lg:w-1/2 min-w-0 overflow-hidden">
              <LLMTerminal lines={termLines} title="System Log" className="h-full" />
            </div>
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
