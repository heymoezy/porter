import { useState, useEffect } from "react"
import { AdminShell } from "~/components/layout/admin-shell"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { AnimCount } from "~/components/ui/anim-count"
import { Link } from "react-router"
import {
  FolderKanban, Bot, Check, Sparkles, BarChart2,
  ArrowRight, TrendingUp, Clock, Zap,
  Users, DollarSign, Target, Heart,
  Monitor, HardDrive, Cpu,
} from "lucide-react"

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
  memory: { pct: number }
  disk: { pct: number }
  cpu: { cores: number; load1m: number }
  sessions: { active: number }
  uptime: number
  runtimes: Array<{ name: string; status: string }>
}

function fmtRel(ts: number) {
  const d = Date.now() / 1000 - ts
  if (d < 60) return "now"
  if (d < 3600) return `${Math.floor(d / 60)}m`
  if (d < 86400) return `${Math.floor(d / 3600)}h`
  return `${Math.floor(d / 86400)}d`
}

const CHART_BARS = [12,18,15,22,28,25,35,32,41,38,45,52,48,55,62,58,68,72,65,78,82,75,88,92,85,95,98,90,100,96]

function DashboardContent() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { requestAnimationFrame(() => setMounted(true)) }, [])

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
    <div className="space-y-3">
      {/* ── Hero (matches user hero-stats exactly) ────────── */}
      <div
        className={`rounded-xl border border-accent-porter/20 bg-gradient-to-br from-accent-porter/5 via-surface to-background p-5 transition-all duration-700 ${
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
        }`}
        style={{ transitionDelay: "100ms" }}
      >
        <div className="flex flex-col md:flex-row md:items-end gap-4 md:gap-6 min-w-0">
          <div className="flex-1 min-w-0 pb-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-accent-porter">Platform Totals</p>
            <p className="mt-1 text-3xl md:text-4xl font-black text-foreground tabular-nums tracking-tight">
              <AnimCount to={d.tasks} duration={2000} /> <span className="text-base md:text-lg font-bold text-text3">tasks</span>
            </p>
            <p className="text-sm text-text2 mt-0.5">executed across {d.projects.total} projects by {d.agents} agents</p>
            <div className="flex items-center gap-4 mt-3">
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-1"><TrendingUp className="h-3 w-3 text-success" /><span className="text-xs font-bold text-success">{d.orchestrations}</span></div>
                <span className="text-[9px] text-text3">orchestrations</span>
              </div>
              <div className="h-6 w-px bg-border" />
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-1"><Clock className="h-3 w-3 text-chart-2" /><span className="text-xs font-bold text-chart-2">{d.learnings}</span></div>
                <span className="text-[9px] text-text3">learnings</span>
              </div>
              <div className="h-6 w-px bg-border" />
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-1"><Zap className="h-3 w-3 text-warning" /><span className="text-xs font-bold text-warning">{totalTokens.toLocaleString()}</span></div>
                <span className="text-[9px] text-text3">tokens</span>
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
          </div>
        </div>
      </div>

      {/* ── Stat tiles (matches user stat-tiles exactly) ──── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {[
          { label: "Projects", value: d.projects.total, icon: FolderKanban, color: "text-accent-porter", sub: `${activeProjects} active`, link: "/users" },
          { label: "Agents", value: d.agents, icon: Bot, color: "text-success", sub: `${d.skills} skills`, link: "/agents" },
          { label: "Tasks", value: d.tasks, icon: Check, color: "text-warning", sub: `${d.orchestrations} runs`, link: "/activity" },
          { label: "Decisions", value: d.decisions, icon: Sparkles, color: "text-chart-2", sub: `${d.learnings} learnings`, link: "/activity" },
          { label: "Tokens", value: totalTokens, icon: BarChart2, color: "text-chart-3", sub: `${d.tokens.requests} requests`, link: "/billing" },
        ].map((s, i) => (
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
              <p className="text-[8px] text-text3">{s.sub}</p>
              <ArrowRight className="h-2.5 w-2.5 text-text3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </Link>
        ))}
      </div>

      {/* ── SaaS metrics ─────────────────────────── */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { icon: Users, label: "Customers", value: d.customers, color: "text-accent-porter" },
          { icon: DollarSign, label: "MRR", value: "$0", color: "text-success" },
          { icon: Heart, label: "Messages", value: d.messages, color: "text-danger" },
          { icon: Target, label: "Agent Msgs", value: d.agentMessages, color: "text-warning" },
        ].map((m, i) => (
          <div key={i} className={`rounded-lg border border-border bg-surface px-3 py-2 transition-all duration-300 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`} style={{ transitionDelay: `${330 + i * 40}ms` }}>
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

      <div className="grid grid-cols-2 gap-2">
        {/* ── User activity ─────────────────────── */}
        <div className="rounded-lg border border-border bg-surface px-3 py-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-text3">User Activity</p>
            <Link to="/activity" className="text-[9px] text-accent-porter hover:underline">all</Link>
          </div>
          <div className="space-y-px max-h-[120px] overflow-y-auto">
            {d.recentActivity.map((e, i) => (
              <div key={i} className="flex items-center gap-1.5 py-0.5">
                <span className="text-[9px] text-text3 w-5 shrink-0">{fmtRel(e.ts)}</span>
                <span className="text-[10px] font-medium text-foreground">{e.actor}</span>
                <Badge className="text-[7px] bg-text3/15 text-text3 border-0 px-1 py-0">{e.action.split(".").pop()}</Badge>
              </div>
            ))}
            {!d.recentActivity.length && <p className="text-[9px] text-text3 py-2 text-center">No activity</p>}
          </div>
        </div>

        {/* ── Live system ───────────────────────── */}
        <div className="rounded-lg border border-border bg-surface px-3 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-text3 mb-1">Live System</p>
          {sys && (
            <div className="space-y-1.5">
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { icon: Monitor, label: "Mem", value: `${sys.memory.pct}%`, warn: sys.memory.pct >= 80 },
                  { icon: HardDrive, label: "Disk", value: `${sys.disk.pct}%`, warn: sys.disk.pct >= 80 },
                  { icon: Cpu, label: "CPU", value: `${Math.round(sys.cpu.load1m / sys.cpu.cores * 100)}%`, warn: sys.cpu.load1m > sys.cpu.cores },
                ].map(g => (
                  <div key={g.label}>
                    <g.icon className="h-3 w-3 text-text3 mx-auto" />
                    <p className={`text-sm font-bold tabular-nums ${g.warn ? "text-danger" : "text-foreground"}`}>{g.value}</p>
                    <p className="text-[8px] text-text3">{g.label}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-border/50">
                <span className="text-[9px] text-text3">{sys.sessions.active} sessions</span>
                {sys.runtimes?.map(rt => (
                  <span key={rt.name} className="flex items-center gap-1 text-[8px] text-text3">
                    <span className={`size-1.5 rounded-full ${rt.status === "healthy" ? "bg-success" : "bg-danger"}`} />{rt.name}
                  </span>
                ))}
              </div>
            </div>
          )}
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
