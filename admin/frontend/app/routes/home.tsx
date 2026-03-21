import { AdminShell } from "~/components/layout/admin-shell"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Link } from "react-router"
import {
  Users, DollarSign, Bot, Sparkles, Monitor, Activity,
  Server, HardDrive, Cpu, ChevronRight,
} from "lucide-react"

function fmt$(n: number) { return n >= 0 ? `$${n.toFixed(0)}` : `-$${Math.abs(n).toFixed(0)}` }
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

function DashboardContent() {
  const { data: custData } = useQuery({
    queryKey: ["admin", "customers"],
    queryFn: () => api<{ customers: Array<Record<string, unknown>>; stats: { total: number; paying: number; trialing: number; free: number } }>("/api/admin/users"),
  })
  const { data: sysData } = useQuery({
    queryKey: ["admin", "system"],
    queryFn: () => api<{
      memory: { pct: number; used: number; total: number }
      disk: { pct: number; used: number; total: number }
      cpu: { cores: number; load1m: number }
      sessions: { active: number }
      uptime: number
      runtimes: Array<{ name: string; status: string; latencyMs: number }>
    }>("/api/admin/system"),
    refetchInterval: 15_000,
  })
  const { data: agentData } = useQuery({
    queryKey: ["admin", "agents"],
    queryFn: () => api<{ total: number; system: number; user: number }>("/api/admin/agents"),
  })
  const { data: skillData } = useQuery({
    queryKey: ["admin", "skills"],
    queryFn: () => api<{ totalSkills: number; totalAssignments: number }>("/api/admin/skills"),
  })
  const { data: actData } = useQuery({
    queryKey: ["admin", "activity", ""],
    queryFn: () => api<{ entries: Array<{ ts: number; actor: string; action: string; target: string }>; total: number }>("/api/admin/activity?limit=8"),
  })

  const stats = custData?.stats ?? { total: 0, paying: 0, trialing: 0, free: 0 }
  const customers = custData?.customers ?? []
  const totalMrr = customers.reduce((s: number, c: Record<string, unknown>) => s + ((c.mrr as number) ?? 0), 0)
  const sys = sysData

  return (
    <div className="space-y-2">
      {/* Top metrics */}
      <div className="grid grid-cols-6 gap-2">
        {[
          { icon: Users, label: "Customers", value: String(stats.total), sub: `${stats.paying} paying` },
          { icon: DollarSign, label: "MRR", value: fmt$(totalMrr), sub: `${stats.paying} subs` },
          { icon: Bot, label: "Agents", value: String(agentData?.total ?? 0), sub: `${agentData?.user ?? 0} user` },
          { icon: Sparkles, label: "Skills", value: String(skillData?.totalSkills ?? 0), sub: `${skillData?.totalAssignments ?? 0} deployed` },
          { icon: Monitor, label: "Sessions", value: String(sys?.sessions?.active ?? 0), sub: `up ${sys ? Math.floor(sys.uptime / 3600) + "h" : "—"}` },
          { icon: Activity, label: "Events", value: String(actData?.total ?? 0), sub: "audit log" },
        ].map((m, i) => (
          <div key={i} className="animate-card-deal-in rounded-xl border border-border bg-surface p-2" style={{ animationDelay: `${i * 40}ms` }}>
            <div className="flex items-center gap-1.5">
              <m.icon className="size-3 text-accent-porter" />
              <span className="text-[10px] text-text3 uppercase">{m.label}</span>
            </div>
            <p className="text-sm font-bold text-text mt-0.5">{m.value}</p>
            <p className="text-[10px] text-text3">{m.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {/* System gauges */}
        <div className="rounded-xl border border-border bg-surface p-2.5 space-y-2">
          <div className="flex items-center gap-1.5">
            <Server className="size-3 text-accent-porter" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">System</span>
          </div>
          {sys && (
            <>
              {[
                { icon: Monitor, label: "Memory", pct: sys.memory.pct, detail: `${fmtBytes(sys.memory.used)} / ${fmtBytes(sys.memory.total)}` },
                { icon: HardDrive, label: "Disk", pct: sys.disk.pct, detail: `${fmtBytes(sys.disk.used)} / ${fmtBytes(sys.disk.total)}` },
                { icon: Cpu, label: "CPU", pct: Math.round(sys.cpu.load1m / sys.cpu.cores * 100), detail: `${sys.cpu.cores} cores, load ${sys.cpu.load1m.toFixed(1)}` },
              ].map(g => (
                <div key={g.label}>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-text3">{g.label}</span>
                    <span className={g.pct >= 80 ? "text-danger font-bold" : "text-text2"}>{g.pct}%</span>
                  </div>
                  <div className="h-1 rounded-full bg-border mt-0.5">
                    <div className={`h-full rounded-full transition-all ${g.pct >= 90 ? "bg-danger" : g.pct >= 70 ? "bg-warning" : "bg-success"}`} style={{ width: `${Math.min(g.pct, 100)}%` }} />
                  </div>
                </div>
              ))}
              {/* Runtimes */}
              <div className="pt-1 space-y-0.5">
                {sys.runtimes?.map(rt => (
                  <div key={rt.name} className="flex items-center gap-1.5 text-[10px]">
                    <div className={`size-1.5 rounded-full ${rt.status === "healthy" ? "bg-success" : "bg-danger"}`} />
                    <span className="text-text3">{rt.name}</span>
                    {rt.latencyMs > 0 && <span className="text-text3 ml-auto">{rt.latencyMs}ms</span>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Recent activity */}
        <div className="col-span-2 rounded-xl border border-border bg-surface p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <Activity className="size-3 text-accent-porter" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">Recent Activity</span>
            </div>
            <Link to="/activity" className="text-[10px] text-accent-porter hover:underline">View all</Link>
          </div>
          <div className="space-y-px">
            {(actData?.entries ?? []).map((e, i) => (
              <div key={i} className="flex items-center gap-2 py-0.5">
                <span className="text-[10px] text-text3 w-8 shrink-0">{fmtRel(e.ts)}</span>
                <span className="text-[11px] font-medium text-text">{e.actor}</span>
                <Badge className="text-[9px] bg-text3/15 text-text3 border-0">{e.action}</Badge>
                <span className="text-[10px] text-text3 truncate ml-auto">{e.target}</span>
              </div>
            ))}
            {(!actData?.entries?.length) && <p className="text-xs text-text3 py-2 text-center">No recent activity</p>}
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
