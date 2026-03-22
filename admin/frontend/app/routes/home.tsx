import { AdminShell } from "~/components/layout/admin-shell"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Link } from "react-router"
import { PixelPortrait } from "~/components/pixel-portrait"
import {
  FolderKanban, Bot, MessageSquare, Sparkles, Users,
  Zap, Brain, Activity, Monitor, Server,
  HardDrive, Cpu, ChevronRight, BarChart3,
} from "lucide-react"

interface DashboardData {
  projects: { total: number; byStatus: Array<{ status: string; cnt: number }> }
  agents: number
  chats: number
  messages: number
  agentMessages: number
  tasks: number
  orchestrations: number
  decisions: number
  customers: number
  sessions: number
  tokens: { input: number; output: number; requests: number }
  learnings: number
  auditEvents: number
  emails: number
  skills: number
  recentActivity: Array<{ ts: number; actor: string; action: string; target: string }>
  version: string
}

interface SystemData {
  memory: { pct: number; used: number; total: number }
  disk: { pct: number; used: number; total: number }
  cpu: { cores: number; load1m: number }
  uptime: number
  runtimes: Array<{ name: string; status: string; latencyMs: number }>
}

function fmtN(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
function fmtBytes(b: number) {
  if (!b) return "0"
  const k = 1024, s = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(b) / Math.log(k))
  return `${(b / Math.pow(k, i)).toFixed(0)}${s[i]}`
}
function fmtRel(ts: number) {
  const d = Date.now() / 1000 - ts
  if (d < 60) return "now"
  if (d < 3600) return `${Math.floor(d / 60)}m`
  if (d < 86400) return `${Math.floor(d / 3600)}h`
  return `${Math.floor(d / 86400)}d`
}

const actionColors: Record<string, string> = {
  "auth.login.ok": "bg-success/15 text-success",
  "auth.logout": "bg-text3/15 text-text3",
  "project.create": "bg-accent-porter/15 text-accent-porter",
  "persona.create": "bg-purple-500/15 text-purple-400",
  "chat.message": "bg-blue-500/15 text-blue-400",
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1 rounded-full bg-border">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
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
    refetchInterval: 15_000,
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
      {/* Hero banner */}
      <div className="rounded-xl border border-border bg-surface p-3 flex items-center gap-3 animate-card-deal-in">
        <PixelPortrait hair="#1e293b" skin="#f1c27d" eyes="#0f172a" shirt="#1e3a5f" hairStyle="short" size="md" />
        <div className="flex-1">
          <h1 className="text-base font-bold text-text">Porter Command Center</h1>
          <p className="text-xs text-text3">Platform control plane · {d.customers} customers · {d.agents} agents · {fmtN(d.messages)} messages</p>
          <div className="flex items-center gap-3 mt-1">
            {sys?.runtimes?.map(rt => (
              <div key={rt.name} className="flex items-center gap-1">
                <div className={`size-1.5 rounded-full ${rt.status === "healthy" ? "bg-success animate-pulse-badge" : "bg-danger"}`} />
                <span className="text-[10px] text-text3">{rt.name}</span>
              </div>
            ))}
            <span className="text-[10px] text-text3">v{d.version}</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-accent-porter">{fmtN(totalTokens)}</p>
          <p className="text-[10px] text-text3">tokens processed</p>
        </div>
      </div>

      {/* Hero metrics */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { icon: FolderKanban, label: "Projects", value: d.projects.total, color: "text-accent-porter", link: "/users" },
          { icon: Bot, label: "Agents", value: d.agents, color: "text-purple-400", link: "/agents" },
          { icon: MessageSquare, label: "Conversations", value: d.chats, color: "text-blue-400", link: null },
          { icon: Users, label: "Customers", value: d.customers, color: "text-success", link: "/users" },
        ].map((m, i) => (
          <div key={i} className="animate-card-deal-in rounded-xl border border-border bg-surface p-2.5" style={{ animationDelay: `${i * 40}ms` }}>
            <div className="flex items-center justify-between">
              <m.icon className={`size-4 ${m.color}`} />
              {m.link && <Link to={m.link}><ChevronRight className="size-3 text-text3" /></Link>}
            </div>
            <p className="text-lg font-bold text-text mt-1">{fmtN(m.value)}</p>
            <p className="text-[10px] text-text3 uppercase">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Platform activity row */}
      <div className="grid grid-cols-6 gap-2">
        {[
          { label: "Messages", value: d.messages, icon: MessageSquare },
          { label: "Agent Msgs", value: d.agentMessages, icon: Bot },
          { label: "Tasks", value: d.tasks, icon: Zap },
          { label: "Orchestrations", value: d.orchestrations, icon: BarChart3 },
          { label: "Skills", value: d.skills, icon: Sparkles },
          { label: "Learnings", value: d.learnings, icon: Brain },
        ].map((m, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface p-2 animate-card-deal-in" style={{ animationDelay: `${(i + 4) * 30}ms` }}>
            <m.icon className="size-3 text-text3" />
            <p className="text-sm font-bold text-text mt-0.5">{fmtN(m.value)}</p>
            <p className="text-[9px] text-text3 uppercase">{m.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {/* Tokens */}
        <div className="rounded-xl border border-border bg-surface p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">Tokens</span>
            <span className="text-xs font-bold text-text">{fmtN(totalTokens)}</span>
          </div>
          <div className="space-y-1 text-[10px]">
            <div className="flex justify-between"><span className="text-text3">Input</span><span className="text-text2">{fmtN(d.tokens.input)}</span></div>
            <div className="flex justify-between"><span className="text-text3">Output</span><span className="text-text2">{fmtN(d.tokens.output)}</span></div>
            <div className="flex justify-between"><span className="text-text3">Requests</span><span className="text-text2">{fmtN(d.tokens.requests)}</span></div>
          </div>
        </div>

        {/* System */}
        {sys && (
          <div className="rounded-xl border border-border bg-surface p-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">System</span>
            <div className="space-y-1.5 mt-1.5">
              {[
                { icon: Monitor, label: "Mem", pct: sys.memory.pct },
                { icon: HardDrive, label: "Disk", pct: sys.disk.pct },
                { icon: Cpu, label: "CPU", pct: Math.round(sys.cpu.load1m / sys.cpu.cores * 100) },
              ].map(g => (
                <div key={g.label}>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-text3">{g.label}</span>
                    <span className={g.pct >= 80 ? "text-danger font-bold" : "text-text2"}>{g.pct}%</span>
                  </div>
                  <Bar pct={g.pct} color={g.pct >= 90 ? "bg-danger" : g.pct >= 70 ? "bg-warning" : "bg-success"} />
                </div>
              ))}
              <div className="flex gap-2 pt-0.5">
                {sys.runtimes?.map(rt => (
                  <div key={rt.name} className="flex items-center gap-1 text-[9px]">
                    <div className={`size-1.5 rounded-full ${rt.status === "healthy" ? "bg-success" : "bg-danger"}`} />
                    <span className="text-text3">{rt.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Recent activity */}
        <div className="rounded-xl border border-border bg-surface p-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">Activity</span>
            <Link to="/activity" className="text-[10px] text-accent-porter hover:underline">all</Link>
          </div>
          <div className="space-y-px">
            {d.recentActivity.slice(0, 7).map((e, i) => (
              <div key={i} className="flex items-center gap-1.5 py-0.5">
                <span className="text-[9px] text-text3 w-6 shrink-0">{fmtRel(e.ts)}</span>
                <span className="text-[10px] font-medium text-text">{e.actor}</span>
                <Badge className={`text-[8px] border-0 px-1 py-0 ${actionColors[e.action] || "bg-text3/15 text-text3"}`}>{e.action.split(".").pop()}</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Projects breakdown */}
      {d.projects.byStatus.length > 0 && (
        <div className="flex items-center gap-2 px-1 text-[10px] text-text3">
          <span className="uppercase font-semibold">Projects:</span>
          {d.projects.byStatus.map(s => (
            <span key={s.status}>{s.status} ({s.cnt})</span>
          ))}
          <span className="mx-1">·</span>
          <span>{d.auditEvents} audit events</span>
          <span>·</span>
          <span>{d.emails} emails</span>
          <span>·</span>
          <span>{d.sessions} active sessions</span>
        </div>
      )}
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
