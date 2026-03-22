import { AdminShell } from "~/components/layout/admin-shell"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Link } from "react-router"
import {
  FolderKanban, Bot, Zap, Brain, Coins,
  Users, DollarSign, TrendingUp, Target,
  Monitor, HardDrive, Cpu, ChevronRight,
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
  memory: { pct: number; used: number; total: number }
  disk: { pct: number; used: number; total: number }
  cpu: { cores: number; load1m: number }
  sessions: { active: number }
  uptime: number
}

function fmtN(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
function fmtRel(ts: number) {
  const d = Date.now() / 1000 - ts
  if (d < 60) return "now"
  if (d < 3600) return `${Math.floor(d / 60)}m`
  if (d < 86400) return `${Math.floor(d / 3600)}h`
  return `${Math.floor(d / 86400)}d`
}

function DashboardContent() {
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

  if (!d) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  const totalTokens = d.tokens.input + d.tokens.output

  return (
    <div className="space-y-2">
      {/* ── Hero banner ─────────────────────────── */}
      <div className="relative rounded-xl overflow-hidden h-[100px]">
        <div className="absolute inset-0 bg-gradient-to-r from-accent-porter/30 via-accent-porter/10 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.15),transparent_70%)]" />
        <div className="relative flex items-center justify-between h-full px-4">
          <div>
            <h1 className="text-lg font-bold text-text">Porter Admin</h1>
            <p className="text-xs text-text3">Platform Control Plane · v{d.version}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-accent-porter">{fmtN(totalTokens)}</p>
            <p className="text-[10px] text-text3">tokens processed</p>
          </div>
        </div>
      </div>

      {/* ── Metric cards (matches user dashboard pattern) ─── */}
      <div className="grid grid-cols-5 gap-2">
        {[
          { icon: FolderKanban, label: "Projects", value: d.projects.total, sub: d.projects.byStatus.map(s => `${s.cnt} ${s.status}`).join(" · ") || "none", link: "/users" },
          { icon: Bot, label: "Agents", value: d.agents, sub: `${d.skills} skills deployed`, link: "/agents" },
          { icon: Zap, label: "Tasks", value: d.tasks, sub: `${d.orchestrations} orchestrations`, link: "/activity" },
          { icon: Brain, label: "Decisions", value: d.decisions, sub: `${d.learnings} learnings`, link: "/activity" },
          { icon: Coins, label: "Tokens", value: fmtN(totalTokens), sub: `${fmtN(d.tokens.requests)} requests`, link: "/billing" },
        ].map((m, i) => (
          <Link
            key={i}
            to={m.link}
            className="animate-card-deal-in rounded-xl border border-border bg-surface p-2.5 hover:border-text3/30 transition-all"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <m.icon className="size-4 text-accent-porter" />
            <p className="text-lg font-bold text-text mt-1">{typeof m.value === "number" ? fmtN(m.value) : m.value}</p>
            <p className="text-[10px] text-text3 uppercase font-semibold">{m.label}</p>
            <p className="text-[9px] text-text3 mt-0.5 truncate">{m.sub}</p>
          </Link>
        ))}
      </div>

      {/* ── SaaS metrics ─────────────────────────── */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { icon: Users, label: "Customers", value: d.customers },
          { icon: DollarSign, label: "MRR", value: "$0" },
          { icon: TrendingUp, label: "Chats", value: d.chats },
          { icon: Target, label: "Messages", value: fmtN(d.messages) },
        ].map((m, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface p-2 animate-card-deal-in" style={{ animationDelay: `${(i + 5) * 30}ms` }}>
            <div className="flex items-center gap-1.5">
              <m.icon className="size-3 text-text3" />
              <span className="text-[10px] text-text3 uppercase">{m.label}</span>
            </div>
            <p className="text-sm font-bold text-text mt-0.5">{typeof m.value === "number" ? fmtN(m.value) : m.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* ── User activity ─────────────────────── */}
        <div className="rounded-xl border border-border bg-surface p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">User Activity</span>
            <Link to="/activity" className="text-[10px] text-accent-porter hover:underline">all</Link>
          </div>
          <div className="space-y-px max-h-[140px] overflow-y-auto">
            {d.recentActivity.map((e, i) => (
              <div key={i} className="flex items-center gap-2 py-0.5">
                <span className="text-[9px] text-text3 w-6 shrink-0">{fmtRel(e.ts)}</span>
                <span className="text-[10px] font-medium text-text">{e.actor}</span>
                <Badge className="text-[8px] bg-text3/15 text-text3 border-0 px-1 py-0">{e.action.split(".").pop()}</Badge>
                <span className="text-[9px] text-text3 truncate ml-auto">{e.target}</span>
              </div>
            ))}
            {!d.recentActivity.length && <p className="text-[10px] text-text3 py-2 text-center">No recent activity</p>}
          </div>
        </div>

        {/* ── Live system ───────────────────────── */}
        <div className="rounded-xl border border-border bg-surface p-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">Live System</span>
          {sys && (
            <div className="mt-1.5 space-y-1.5">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { icon: Monitor, label: "Memory", value: `${sys.memory.pct}%`, warn: sys.memory.pct >= 80 },
                  { icon: HardDrive, label: "Disk", value: `${sys.disk.pct}%`, warn: sys.disk.pct >= 80 },
                  { icon: Cpu, label: "CPU", value: `${Math.round(sys.cpu.load1m / sys.cpu.cores * 100)}%`, warn: sys.cpu.load1m > sys.cpu.cores },
                ].map(g => (
                  <div key={g.label} className="text-center">
                    <g.icon className="size-3 text-text3 mx-auto" />
                    <p className={`text-sm font-bold mt-0.5 ${g.warn ? "text-danger" : "text-text"}`}>{g.value}</p>
                    <p className="text-[9px] text-text3">{g.label}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-border/50 text-[10px]">
                <span className="text-text3">{sys.sessions.active} active sessions</span>
                <span className="text-text3">up {Math.floor(sys.uptime / 3600)}h</span>
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
