import { AdminShell } from "~/components/layout/admin-shell"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Monitor, HardDrive, Cpu, Database, Clock, Users } from "lucide-react"

interface SystemData {
  memory: { total: number; used: number; free: number; pct: number }
  cpu: { cores: number; model: string; load1m: number; load5m: number; load15m: number }
  disk: { total: number; used: number; available: number; pct: number }
  uptime: number
  platform: { os: string; arch: string; hostname: string; nodeVersion: string }
  db: { size: number; path: string }
  sessions: { active: number }
  process: { rss: number; heapUsed: number; heapTotal: number }
  runtimes: Array<{ name: string; url: string; status: string; latencyMs: number }>
}

function fmtBytes(b: number) {
  if (!b) return "0 B"
  const k = 1024
  const s = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(b) / Math.log(k))
  return `${(b / Math.pow(k, i)).toFixed(1)} ${s[i]}`
}

function fmtUptime(s: number) {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 rounded-full bg-border overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}

function SystemContent() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "system"],
    queryFn: () => api<SystemData>("/api/admin/system"),
    refetchInterval: 10_000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  const s = data!

  const barColor = (pct: number) => pct >= 90 ? "bg-danger" : pct >= 70 ? "bg-warning" : "bg-success"

  return (
    <div className="space-y-3">
      {/* Platform info */}
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
        <Monitor className="size-3 text-accent-porter" />
        <span className="text-xs font-medium text-text">{s.platform.hostname}</span>
        <span className="text-[10px] text-text3">{s.platform.os}/{s.platform.arch}</span>
        <span className="text-[10px] text-text3">Node {s.platform.nodeVersion}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <Clock className="size-3 text-text3" />
          <span className="text-[10px] text-text3">up {fmtUptime(s.uptime)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Users className="size-3 text-text3" />
          <span className="text-[10px] text-text3">{s.sessions.active} sessions</span>
        </div>
      </div>

      {/* Resource gauges */}
      <div className="grid grid-cols-3 gap-2">
        {/* Memory */}
        <div className="rounded-xl border border-border bg-surface p-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <Monitor className="size-3 text-accent-porter" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">Memory</span>
            </div>
            <Badge className={`text-[10px] border-0 ${s.memory.pct >= 80 ? "bg-danger/15 text-danger" : "bg-success/15 text-success"}`}>
              {s.memory.pct}%
            </Badge>
          </div>
          <Bar pct={s.memory.pct} color={barColor(s.memory.pct)} />
          <div className="flex justify-between mt-1.5 text-[10px] text-text3">
            <span>{fmtBytes(s.memory.used)} used</span>
            <span>{fmtBytes(s.memory.total)} total</span>
          </div>
        </div>

        {/* Disk */}
        <div className="rounded-xl border border-border bg-surface p-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <HardDrive className="size-3 text-accent-porter" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">Disk</span>
            </div>
            <Badge className={`text-[10px] border-0 ${s.disk.pct >= 80 ? "bg-danger/15 text-danger" : "bg-success/15 text-success"}`}>
              {s.disk.pct}%
            </Badge>
          </div>
          <Bar pct={s.disk.pct} color={barColor(s.disk.pct)} />
          <div className="flex justify-between mt-1.5 text-[10px] text-text3">
            <span>{fmtBytes(s.disk.used)} used</span>
            <span>{fmtBytes(s.disk.total)} total</span>
          </div>
        </div>

        {/* CPU */}
        <div className="rounded-xl border border-border bg-surface p-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <Cpu className="size-3 text-accent-porter" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">CPU</span>
            </div>
            <span className="text-[10px] text-text3">{s.cpu.cores} cores</span>
          </div>
          <Bar pct={Math.round(s.cpu.load1m / s.cpu.cores * 100)} color={barColor(Math.round(s.cpu.load1m / s.cpu.cores * 100))} />
          <div className="flex gap-3 mt-1.5 text-[10px] text-text3">
            <span>1m: {s.cpu.load1m.toFixed(2)}</span>
            <span>5m: {s.cpu.load5m.toFixed(2)}</span>
            <span>15m: {s.cpu.load15m.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Porter Runtimes */}
      {s.runtimes?.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-3 py-2 bg-surface border-b border-border">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">Porter Runtimes</span>
          </div>
          <table className="w-full">
            <tbody>
              {s.runtimes.map(rt => (
                <tr key={rt.name} className="border-b border-border/30 last:border-0">
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <div className={`size-2 rounded-full ${rt.status === "healthy" ? "bg-success animate-pulse-badge" : "bg-danger"}`} />
                      <span className="text-xs font-medium text-text">{rt.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-xs text-text3">{rt.url}</td>
                  <td className="px-3 py-1.5 text-xs text-text2 text-right">{rt.latencyMs}ms</td>
                  <td className="px-3 py-1.5 text-right">
                    <Badge className={`text-[10px] border-0 ${rt.status === "healthy" ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>
                      {rt.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Process + DB */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-border bg-surface p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Monitor className="size-3 text-accent-porter" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">Admin Process</span>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-text3">RSS</span><span className="text-text2">{fmtBytes(s.process.rss)}</span></div>
            <div className="flex justify-between"><span className="text-text3">Heap Used</span><span className="text-text2">{fmtBytes(s.process.heapUsed)}</span></div>
            <div className="flex justify-between"><span className="text-text3">Heap Total</span><span className="text-text2">{fmtBytes(s.process.heapTotal)}</span></div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Database className="size-3 text-accent-porter" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">Database</span>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-text3">Size</span><span className="text-text2">{fmtBytes(s.db.size)}</span></div>
            <div className="flex justify-between"><span className="text-text3">Path</span><span className="text-text2 truncate max-w-[200px]">{s.db.path}</span></div>
          </div>
        </div>
      </div>

      <p className="text-center text-[10px] text-text3">Refreshes every 10s</p>
    </div>
  )
}

export default function SystemPage() {
  return (
    <AdminShell>
      <SystemContent />
    </AdminShell>
  )
}
